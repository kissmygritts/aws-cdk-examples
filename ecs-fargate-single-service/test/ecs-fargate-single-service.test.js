const { expect, matchTemplate, MatchStyle } = require('@aws-cdk/assert');
const cdk = require('@aws-cdk/core');
const EcsFargateSingleService = require('../lib/ecs-fargate-single-service-stack');

test('Empty Stack', () => {
    const app = new cdk.App();
    // WHEN
    const stack = new EcsFargateSingleService.EcsFargateSingleServiceStack(app, 'MyTestStack');
    // THEN
    expect(stack).to(matchTemplate({
      "Resources": {}
    }, MatchStyle.EXACT))
});
