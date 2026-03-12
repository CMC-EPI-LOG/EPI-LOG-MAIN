#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { PublicDataStack } from '../lib/public-data-stack';

const app = new cdk.App();

new PublicDataStack(app, 'PublicDataStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || process.env.AWS_REGION || 'ap-northeast-2',
  },
});
