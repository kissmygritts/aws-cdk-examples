const acm = require('@aws-cdk/aws-certificatemanager')
const ec2 = require('@aws-cdk/aws-ec2')
const ecs = require('@aws-cdk/aws-ecs')
const elbv2 = require('@aws-cdk/aws-elasticloadbalancingv2')
const ecr = require('@aws-cdk/aws-ecr')
const route53 = require('@aws-cdk/aws-route53')
const route53Targets = require('@aws-cdk/aws-route53-targets')
const serviceDiscovery = require('@aws-cdk/aws-servicediscovery')
const cloudfront = require('@aws-cdk/aws-cloudfront')
const origins = require('@aws-cdk/aws-cloudfront-origins')
const cdk = require('@aws-cdk/core')

class EcsFargateElbCloudfrontStack extends cdk.Stack {
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

    /* DNS, DOMAINS, CERTS, AND CLOUDFRONT */
    // I'm using a domain I own: gritts.dev
    // be certain to register and use your own domain!
    const zone = route53.HostedZone.fromLookup(this, 'HostedZone', {
      domainName: 'gritts.dev'
    })

    // in region cert
    // https://aws.amazon.com/premiumsupport/knowledge-center/acm-export-certificate/
    const cert = new acm.Certificate(this, 'GrittsDev', {
      domainName: 'apis.gritts.dev',
      subjectAlternativeNames: ['*.apis.gritts.dev'],
      validation: acm.CertificateValidation.fromDns(zone)
    })

    // cert must be in us-east-1 for CloudFront
    // https://docs.aws.amazon.com/cdk/api/latest/docs/aws-certificatemanager-readme.html#cross-region-certificates
    const cfCert = new acm.DnsValidatedCertificate(this, 'GrittsDevUsEast1', {
      domainName: 'apis.gritts.dev',
      subjectAlternativeNames: ['*.apis.gritts.dev'],
      hostedZone: zone,
      region: 'us-east-1',
      validation: acm.CertificateValidation.fromDns(zone)
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

    // cloudfront distribution
    const cfDistribution = new cloudfront.Distribution(this, 'ServicesCloudFront', {
      defaultBehavior: {
        origin: new origins.LoadBalancerV2Origin(alb),
        compress: true
      },
      domainNames: ['apis.gritts.dev', '*.apis.gritts.dev'],
      certificate: cfCert,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100
    })

    // create DNS record to point to the load balancer
    new route53.ARecord(this, 'apissSubdomain', {
      zone,
      recordName: 'apis',
      target: route53.RecordTarget.fromAlias(
        new route53Targets.CloudFrontTarget(cfDistribution)
      ),
      ttl: cdk.Duration.seconds(300),
      comment: 'apis subdomain'
    })
    new route53.ARecord(this, 'apissWildcardDomain', {
      zone,
      recordName: '*.apis',
      target: route53.RecordTarget.fromAlias(
        new route53Targets.CloudFrontTarget(cfDistribution)
      ),
      ttl: cdk.Duration.seconds(300),
      comment: 'apis subdomain'
    })

    /* DEFINE SERVICES */
    // service 1
    const repoOne = ecr.Repository.fromRepositoryArn(
      this,
      `EcrRepo1`,
      `arn:aws:ecr:us-west-2:${props.env.account}:repository/huntnv`
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
      conditions: [elbv2.ListenerCondition.hostHeaders(['service1.apis.gritts.dev'])],
      healthCheck: {
        interval: cdk.Duration.seconds(60),
        path: '/',
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
      conditions: [elbv2.ListenerCondition.hostHeaders(['service2.apis.gritts.dev'])],
      healthCheck: {
        interval: cdk.Duration.seconds(60),
        path: '/',
        timeout: cdk.Duration.seconds(5)
      }
    })
  }
}

module.exports = { EcsFargateElbCloudfrontStack }
