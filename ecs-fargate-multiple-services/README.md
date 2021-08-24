An example CDK app of deploying multiple services to one ECS cluster and load balancing with an application load balancer.

The load balancer uses path based routing (http://example.com/path/to/service) to route traffic to the appropriate container.

## Useful commands

 * `cdk ls`               list the stacks that will be deployed
 * `cdk deploy`           deploy this stack to your default AWS account/region
 * `cdk diff`             compare deployed stack with current state
 * `cdk synth`            emits the synthesized CloudFormation template
