An example of using two stacks to deploy the base infrastructure then the services infrastructure.

The services infrastructure depends on values from the base infrastructure to:

1. Reference the cluster to deploy the service to
2. Assign the service to the existing service security group
3. Add the service to the service discovery namespace
4. Allow traffic within the services security group
5. Add the service to the load balancer listener as a target group

## Useful commands

 * `cdk ls`               list the stacks that will be deployed
 * `cdk diff`             compare deployed stack with current state
 * `cdk synth`            emits the synthesized CloudFormation template
 * `cdk deploy`           deploy this stack to your default AWS account/region
