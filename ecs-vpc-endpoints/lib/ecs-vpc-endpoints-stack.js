const ec2 = require('@aws-cdk/aws-ec2')
const ecs = require('@aws-cdk/aws-ecs')
const elbv2 = require('@aws-cdk/aws-elasticloadbalancingv2')
const ecr = require('@aws-cdk/aws-ecr')
const cdk = require('@aws-cdk/core');

class EcsVpcEndpointsStack extends cdk.Stack {
  /**
   *
   * @param {cdk.Construct} scope
   * @param {string} id
   * @param {cdk.StackProps=} props
   */
  constructor(scope, id, props) {
    super(scope, id, props);

    // base infrastucture
		// We are no longer using the default VPC configuration
    const vpc = new ec2.Vpc(this, 'VPC', {
      maxAzs: 2,
      natGateways: 0,
      gatewayEndpoints: {
        S3: { service: ec2.GatewayVpcEndpointAwsService.S3 }
      }
    })

    /**
     * Add ECR VPC endpoints two required:
     * 1. com.amazonaws.region.ecr.dkr: ECR_DOCKER 
     * 2. com.amazonaws.region.ecr.api: ECR
     */
    vpc.addInterfaceEndpoint('EcrDockerEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER
    })
    vpc.addInterfaceEndpoint('EcrApiEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.ECR
    })
		
    const cluster = new ecs.Cluster(this, 'Cluster', {
			clusterName: 'Services',
			vpc: vpc
		})
		const alb = new elbv2.ApplicationLoadBalancer(this, 'ALB', {
			vpc: vpc,
			internetFacing: true,
			loadBalancerName: 'ServicesLB'
		})

    // ecs service
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
			memoryLimitMiB: 512,
      environment: {
        PATH_PREFIX: '/'
      }
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
			targets: [service],
      healthCheck: {
        path: '/'
      }
		})
  }
}

module.exports = { EcsVpcEndpointsStack }
