const { expect, matchTemplate, MatchStyle } = require('@aws-cdk/assert');
const cdk = require('@aws-cdk/core');
const EcsFargateMultipleServices = require('../lib/ecs-fargate-multiple-services-stack');

test('Empty Stack', () => {
    const app = new cdk.App();
    // WHEN
    const stack = new EcsFargateMultipleServices.EcsFargateMultipleServicesStack(app, 'MyTestStack');
    // THEN
    expect(stack).to(matchTemplate({
      "Resources": {}
    }, MatchStyle.EXACT))
});
