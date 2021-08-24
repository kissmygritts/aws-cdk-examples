const ec2 = require('@aws-cdk/aws-ec2')
const ecs = require('@aws-cdk/aws-ecs')
const elbv2 = require('@aws-cdk/aws-elasticloadbalancingv2')
const ecr = require('@aws-cdk/aws-ecr')
const serviceDiscovery = require('@aws-cdk/aws-servicediscovery')
const cdk = require('@aws-cdk/core')

class ServiceStack extends cdk.Stack {
  // /**
  //  * @param {cdk.Construct} scope
  //  * @param {string} id
  //  * @param {cdk.StackProps=} props
  //  */
  constructor(scope, id, props) {
    super(scope, id, props);
    const { account, region } = props.env
    
    /** Get the repo and image */
    const repo = ecr.Repository.fromRepositoryArn(
      this,
      'EcrRepo',
      `arn:aws:ecr:${region}:${account}:repository/service1`
    )
    const image = ecs.ContainerImage.fromEcrRepository(repo, 'latest')

    /** Task definition */
    const taskDef = new ecs.FargateTaskDefinition(this, 'TaskDef', {})
    const container = taskDef.addContainer('Container', {
      image,
      memoryLimitMiB: 512
    })
    container.addPortMappings({
      containerPort: 7071,
      protocol: ecs.Protocol.TCP
    })

    /** Service definition */
    const service = new ecs.FargateService(
      this,
      'Service',
      {
        cluster: props.cluster,
        taskDefinition: taskDef,
        serviceName: 'Service:1',
        securityGroups: [props.servicesSecurityGroup],
        cloudMapOptions: {
          name: 'api1',
          cloudMapNamespace: props.cloudMapNamespace,
          dnsRecordType: serviceDiscovery.DnsRecordType.A
        }
      }
    )

    /** Security group stuff */
    service.connections.allowFrom(
      props.servicesSecurityGroup,
      ec2.Port.tcp(7071),
      'Allow traffic within security group on 7071'
    )

    /** Network with load balancer */
    props.listener.addTargets('ServiceListener', {
      port: 80,
      targets: [service],
      priority: 1,
      conditions: [elbv2.ListenerCondition.pathPatterns(['/service1*'])],
      healthCheck: {
        interval: cdk.Duration.seconds(60),
        path: '/service1',
        timeout: cdk.Duration.seconds(5)
      }
    })
  }
}

module.exports = { ServiceStack }