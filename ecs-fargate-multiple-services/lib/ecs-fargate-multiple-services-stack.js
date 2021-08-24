const acm = require('@aws-cdk/aws-certificatemanager')
const ec2 = require('@aws-cdk/aws-ec2')
const ecs = require('@aws-cdk/aws-ecs')
const elbv2 = require('@aws-cdk/aws-elasticloadbalancingv2')
const ecr = require('@aws-cdk/aws-ecr')
const route53 = require('@aws-cdk/aws-route53')
const route53Targets = require('@aws-cdk/aws-route53-targets')
const serviceDiscovery = require('@aws-cdk/aws-servicediscovery')
const cdk = require('@aws-cdk/core')

class EcsFargateMultipleServicesStack extends cdk.Stack {
  /**
   *
   * @param {cdk.Construct} scope
   * @param {string} id
   * @param {cdk.StackProps=} props
   */
  constructor(scope, id, props) {
    super(scope, id, props);
    
    /* BASE INFRASTRUCTURE */
		const vpc = new ec2.Vpc(this, 'VPC', { maxAzs: 2 })
		const cluster = new ecs.Cluster(this, 'Cluster', {
			clusterName: 'Services',
			vpc: vpc
		})    
		const alb = new elbv2.ApplicationLoadBalancer(this, 'ALB', {
			vpc: vpc,
			internetFacing: true,
			loadBalancerName: 'ServicesLB'
		})

    // services security group
    const servicesSecurityGroup = new ec2.SecurityGroup(this, 'servicesSecurityGroup', {
      vpc,
      allowAllOutbound: true
    })

    /* SERVICE DISCOVERY */
    const namespace = new serviceDiscovery.PrivateDnsNamespace(
      this,
      'serviceDiscoveryNamespace',
      {
        name: 'services',
        vpc
      }
    )

    /* DNS, DOMAINS, CERTS */
    // I'm using a domain I own: gritts.dev
    // be certain to register and use your own domain!
    const zone = route53.HostedZone.fromLookup(this, 'HostedZone', {
      domainName: 'gritts.dev'
    })

    const cert = new acm.Certificate(this, 'GrittsDev', {
      domainName: 'services.gritts.dev',
      subjectAlternativeNames: ['*.services.gritts.dev'],
      validation: acm.CertificateValidation.fromDns(zone)
    })

    // create DNS record to point to the load balancer
    new route53.ARecord(this, 'servicesSubdomain', {
      zone,
      recordName: 'services',
      target: route53.RecordTarget.fromAlias(
        new route53Targets.LoadBalancerTarget(alb)
      ),
      ttl: cdk.Duration.seconds(300),
      comment: 'services subdomain'
    })

    /* CONFIGURE ALB DEFAULT LISTENERS */
    // port 80 listener redirect to port 443
    const port80Listener = alb.addListener('port80Listener', { port: 80 })
    port80Listener.addAction('80to443Redirect', {
      action: elbv2.ListenerAction.redirect({
        port: '443',
        protocol: elbv2.Protocol.HTTPS,
        permanent: true
      })
    })

    const listener = alb.addListener('Listener', {
      open: true,
      port: 443,
      certificates: [cert]
    })

    // default listener action on `/` path
    listener.addAction('/', {
      action: elbv2.ListenerAction.fixedResponse(200, {
        contentType: 'application/json',
        messageBody: '{ "msg": "base route" }'
      })
    })

    /* DEFINE SERVICES */
    // service 1
    const repoOne = ecr.Repository.fromRepositoryArn(
      this,
      `EcrRepo1`,
      `arn:aws:ecr:us-west-2:${props.env.account}:repository/service1`
    )
    const taskOneImage = ecs.ContainerImage.fromEcrRepository(repoOne, 'latest')

    // task definition & service creation
    const serviceOneTaskDef = new ecs.FargateTaskDefinition(
      this,
      `ServiceOne_TaskDef`,
      {
        compatibility: ecs.Compatibility.EC2_AND_FARGATE,
        cpu: '256',
        memoryMiB: '512',
        networkMode: ecs.NetworkMode.AWS_VPC
      }
    )
    const serviceOneContainer = serviceOneTaskDef.addContainer('ServiceOne_Container', {
      containerName: 'ServiceOneContainer',
      image: taskOneImage,
      memoryLimitMiB: 512,
      logging: ecs.LogDriver.awsLogs({ streamPrefix: 'service1' }),
      environment: {
        SERVICE_URL: 'http://service2.services:7072'
      }
    })
    serviceOneContainer.addPortMappings({
      containerPort: 7071,
      protocol: ecs.Protocol.TCP
    })
    const serviceOne = new ecs.FargateService(
      this,
      'ServiceOne',
      {
        cluster,
        taskDefinition: serviceOneTaskDef,
        serviceName: 'ServiceOne',
        securityGroups: [servicesSecurityGroup],
        cloudMapOptions: {
          name: 'service1',
          cloudMapNamespace: namespace,
          dnsRecordType: serviceDiscovery.DnsRecordType.A
        }
      }
    )

    serviceOne.connections.allowFrom(
      servicesSecurityGroup,
      ec2.Port.tcp(7071),
      'Allow traffic within security group on 7071'
    )

    // network with load balancer
    listener.addTargets('service1', {
      targetGroupName: 'ServiceOneTarget',
      port: 80,
      targets: [serviceOne],
      priority: 1,
      conditions: [elbv2.ListenerCondition.pathPatterns(['/service1*'])],
      healthCheck: {
        interval: cdk.Duration.seconds(60),
        path: '/service1',
        timeout: cdk.Duration.seconds(5)
      }
    })

    // service 2
    const repoTwo = ecr.Repository.fromRepositoryArn(
      this,
      `EcrRepo2`,
      `arn:aws:ecr:us-west-2:${props.env.account}:repository/service2`
    )
    const taskTwoImage = ecs.ContainerImage.fromEcrRepository(repoTwo, 'latest')

    // task definition & service creation
    const serviceTwoTaskDef = new ecs.FargateTaskDefinition(
      this,
      'ServiceTwo_TaskDef',
      {
        compatibility: ecs.Compatibility.EC2_AND_FARGATE,
        cpu: '256',
        memoryMiB: '512',
        networkMode: ecs.NetworkMode.AWS_VPC
      }
    )
    const serviceTwoContianer = serviceTwoTaskDef.addContainer('ServiceTwo_Container', {
      containerName: 'ServiceTwoContainer',
      image: taskTwoImage,
      memoryLimitMiB: 512,
      logging: ecs.LogDriver.awsLogs({ streamPrefix: 'service2' }),
      environment: {
        SERVICE_URL: 'http://service1.services:7071'
      }
    })
    serviceTwoContianer.addPortMappings({
      containerPort: 7072,
      protocol: ecs.Protocol.TCP
    })
    const serviceTwo = new ecs.FargateService(
      this,
      `ServiceTwo`,
      {
        cluster,
        taskDefinition: serviceTwoTaskDef,
        serviceName: 'ServiceTwo',
        securityGroups: [servicesSecurityGroup],
        cloudMapOptions: {
          name: 'service2',
          cloudMapNamespace: namespace,
          dnsRecordType: serviceDiscovery.DnsRecordType.A
        }
      }
    )

    serviceTwo.connections.allowFrom(
      servicesSecurityGroup,
      ec2.Port.tcp(7072),
      'Allow traffic within security group on 7072'
    )

    // network with load balancer
    listener.addTargets('service2', {
      targetGroupName: 'ServiceTwoTarget',
      port: 80,
      targets: [serviceTwo],
      priority: 2,
      conditions: [elbv2.ListenerCondition.pathPatterns(['/service2*'])],
      healthCheck: {
        interval: cdk.Duration.seconds(60),
        path: '/service2',
        timeout: cdk.Duration.seconds(5)
      }
    })

    // create service 3
    const repoThree = ecr.Repository.fromRepositoryArn(
      this,
      `EcrRepo3`,
      `arn:aws:ecr:us-west-2:${props.env.account}:repository/service3`
    )
    const image3 = ecs.ContainerImage.fromEcrRepository(repoThree, 'latest')

    const serviceThreeTaskDef = new ecs.FargateTaskDefinition(
      this,
      'ServiceThree_TaskDef',
      {
        compatibility: ecs.Compatibility.EC2_AND_FARGATE,
        cpu: '256',
        memoryLimitMiB: '512',
        networkMode: ecs.NetworkMode.AWS_VPC
      }
    )
    const service3Container = serviceThreeTaskDef.addContainer('ServiceThree_Container', {
      containerName: 'ServiceThreeContainer',
      image: image3,
      logging: ecs.LogDriver.awsLogs({ streamPrefix: 'service2' }),
    })
    service3Container.addPortMappings({
      containerPort: 7073,
      protocol: ecs.Protocol.TCP
    })

    const serviceThree = new ecs.FargateService(
      this,
      'ServiceThree',
      {
        cluster,
        taskDefinition: serviceThreeTaskDef,
        serviceName: 'ServiceThree',
        securityGroups: [servicesSecurityGroup],
        cloudMapOptions: {
          name: 'service3',
          cloudMapNamespace: namespace,
          dnsRecordType: serviceDiscovery.DnsRecordType.A
        }
      }
    )

    serviceThree.connections.allowFrom(
      servicesSecurityGroup,
      ec2.Port.tcp(7073),
      'Allow traffic within security group on 7073'
    )

    // network with load balancer
    listener.addTargets('service3', {
      targetGroupName: 'ServiceThreeTarget',
      port: 80,
      targets: [serviceThree],
      priority: 3,
      conditions: [elbv2.ListenerCondition.pathPatterns(['/service3*'])],
      healthCheck: {
        interval: cdk.Duration.seconds(60),
        path: '/service3',
        timeout: cdk.Duration.seconds(5)
      }
    })
  }
}

module.exports = { EcsFargateMultipleServicesStack }
