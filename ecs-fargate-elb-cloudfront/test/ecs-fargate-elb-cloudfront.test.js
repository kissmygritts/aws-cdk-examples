const { expect, matchTemplate, MatchStyle } = require('@aws-cdk/assert');
const cdk = require('@aws-cdk/core');
const EcsFargateElbCloudfront = require('../lib/ecs-fargate-elb-cloudfront-stack');

test('Empty Stack', () => {
    const app = new cdk.App();
    // WHEN
    const stack = new EcsFargateElbCloudfront.EcsFargateElbCloudfrontStack(app, 'MyTestStack');
    // THEN
    expect(stack).to(matchTemplate({
      "Resources": {}
    }, MatchStyle.EXACT))
});
