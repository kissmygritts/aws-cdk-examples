#!/usr/bin/env node

const cdk = require('@aws-cdk/core');
const { BaseStack } = require('../lib/base-stack.js');
const { ServiceStack } = require('../lib/service-stack.js')

const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION }

const app = new cdk.App();

const baseStack = new BaseStack(app, 'BaseStack', { env })
new ServiceStack(app, 'ServiceStack', {
  env,
  cluster: baseStack.cluster,
  cloudMapNamespace: baseStack.cloudMapNamespace,
  servicesSecurityGroup: baseStack.servicesSecurityGroup,
  listener: baseStack.listener
})
