const acm = require('@aws-cdk/aws-certificatemanager')
const ec2 = require('@aws-cdk/aws-ec2')
const ecs = require('@aws-cdk/aws-ecs')
const elbv2 = require('@aws-cdk/aws-elasticloadbalancingv2')
const route53 = require('@aws-cdk/aws-route53')
const route53Targets = require('@aws-cdk/aws-route53-targets')
const serviceDiscovery = require('@aws-cdk/aws-servicediscovery')
const cdk = require('@aws-cdk/core')

class BaseStack extends cdk.Stack {
  /**
   *
   * @param {cdk.Construct} scope
   * @param {string} id
   * @param {cdk.StackProps=} props
   */
   constructor(scope, id, props) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, 'VPC', { maxAzs: 2 })
    const cluster = new ecs.Cluster(this, 'Cluster', {
      vpc,
      clusterName: 'backendServices'
    })
    const alb = new elbv2.ApplicationLoadBalancer(this, 'ALB', {
      vpc,
      internetFacing: true,
      loadBalancerName: 'ApiServicesLB'
    })
    const servicesSecurityGroup = new ec2.SecurityGroup(this, 'servicesSecurityGroup', {
      vpc,
      allowAllOutbound: true,
      description: 'Services security group to allow communication between apis within the ECS cluster'
    })
    const namespace = new serviceDiscovery.PrivateDnsNamespace(this, 'sdNamespace', {
      vpc,
      name: 'apis',
      description: 'Service discovery to allow api-to-api communication within the ECS cluster.'
    })

    /** DNS, Domains, Certs */
    const zone = route53.HostedZone.fromLookup(this, 'GrittsDevHostedZone', {
      domainName: 'gritts.dev'
    })

    const cert = new acm.Certificate(this, 'GrittsDevCert', {
      domainName: 'apis.gritts.dev',
      subjectAlternativeNames: ['*.apis.gritts.dev'],
      validation: acm.CertificateValidation.fromDns(zone)
    })

    new route53.ARecord(this, 'ApisGrittsDevDns', {
      zone,
      recordName: 'apis',
      target: route53.RecordTarget.fromAlias(
        new route53Targets.LoadBalancerTarget(alb)
      ),
      ttl: cdk.Duration.seconds(300),
      comment: 'Subdomain for API services.'
    })

    /** Configure load balancer listeners */
    const port80Listener = alb.addListener('port80Listener', { port: 80 })
    port80Listener.addAction('80to443Redirect', {
      action: elbv2.ListenerAction.redirect({
        port: '443',
        protocol: elbv2.Protocol.HTTPS,
        permanent: true
      })
    })

    const response = JSON.stringify({
      status: 'ok',
      message: 'Hit apis.gritts.dev'
    })

    const listener = alb.addListener('port443Listener', {
      open: true,
      port: 443,
      certificates: [cert]
    })

    listener.addAction('443BaseRoute', {
      action: elbv2.ListenerAction.fixedResponse(200, {
        contentType: 'application/json',
        messageBody: response
      })
    })

    /** this exports */
    this.cluster = cluster
    this.cloudMapNamespace = namespace
    this.servicesSecurityGroup = servicesSecurityGroup,
    this.listener = listener
  }
}

module.exports = { BaseStack }
