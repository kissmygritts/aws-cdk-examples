const ec2 = require('@aws-cdk/aws-ec2')
const ecs = require('@aws-cdk/aws-ecs')
const elbv2 = require('@aws-cdk/aws-elasticloadbalancingv2')
const ecr = require('@aws-cdk/aws-ecr')
const cdk = require('@aws-cdk/core')

class EcsFargateSingleServiceStack extends cdk.Stack {
  /**
   *
   * @param {cdk.Construct} scope
   * @param {string} id
   * @param {cdk.StackProps=} props
   */
  constructor(scope, id, props) {
    super(scope, id, props);

    // base infrastucture
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

    // get our image, replace REGION and ACCOUNTID with yours
		const repo = ecr.Repository.fromRepositoryArn(
			this,
			'Servic1Repo',
			`arn:aws:ecr:us-west-2:${props.env.account}:repository/service3`
		)
		const image = ecs.ContainerImage.fromEcrRepository(repo, 'latest')
		
		// task definition
		const taskDef = new ecs.FargateTaskDefinition(
			this,
			'taskDef',
			{
				compatibility: ecs.Compatibility.EC2_AND_FARGATE,
				cpu: '256',
				memoryMiB: '512',
				networkMode: ecs.NetworkMode.AWS_VPC
			}
		)
		const container = taskDef.addContainer('Container', {
			image: image,
			memoryLimitMiB: 512
		})
		container.addPortMappings({
			containerPort: 7073,
			protocol: ecs.Protocol.TCP
		})
		
		// create service
		const service = new ecs.FargateService(
			this,
			'service',
			{
				cluster: cluster,
				taskDefinition: taskDef,
				serviceName: 'service3'
			}
		)
		
		// network the service with the load balancer
		const listener = alb.addListener('listener', {
				open: true,
				port: 80
			}
		)

		// add target group to container
		listener.addTargets('service3', {
			targetGroupName: 'Service3Target',
			port: 80,
			targets: [service]
		})

  }
}

module.exports = { EcsFargateSingleServiceStack }
