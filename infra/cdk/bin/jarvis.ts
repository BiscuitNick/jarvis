#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { VpcStack } from '../lib/vpc-stack';
import { EcsStack } from '../lib/ecs-stack';

const app = new cdk.App();

// Get environment configurations from context
const environments = app.node.tryGetContext('environments');

// ============================================================================
// MVP DEPLOYMENT - Using Default VPC
// ============================================================================
// For MVP, we use the existing AWS default VPC to avoid hitting service limits
// This eliminates the need for a custom VPC and saves ~$32/month in NAT costs
//
// Deploy with: cdk deploy Jarvis-ECS-dev
// Set CDK_DEFAULT_ACCOUNT and CDK_DEFAULT_REGION environment variables or use 'aws configure'

const devConfig = environments['dev'];

new EcsStack(app, 'Jarvis-ECS-dev', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT || process.env.AWS_ACCOUNT_ID,
    region: devConfig.region || process.env.CDK_DEFAULT_REGION || process.env.AWS_REGION || 'us-east-1',
  },
  environment: 'dev',
  desiredCount: devConfig.desiredCount || 1,
  containerPort: 8080,
  cpu: 256, // 0.25 vCPU
  memoryLimitMiB: 512, // 512 MB
  tags: {
    Environment: 'dev',
    Project: 'Jarvis',
    ManagedBy: 'CDK',
    CostCenter: 'MVP',
  },
});

// ============================================================================
// CUSTOM VPC DEPLOYMENT (For Future Production Use)
// ============================================================================
// The VpcStack is preserved for future production deployments
// Uncomment below when ready to deploy custom VPC with private subnets
//
// function createEnvironmentStacks(
//   app: cdk.App,
//   env: 'dev' | 'staging' | 'prod'
// ) {
//   const envConfig = environments[env];
//
//   // VPC Stack
//   const vpcStack = new VpcStack(app, `Jarvis-VPC-${env}`, {
//     env: {
//       account: process.env.CDK_DEFAULT_ACCOUNT || process.env.AWS_ACCOUNT_ID,
//       region: envConfig.region || process.env.CDK_DEFAULT_REGION || process.env.AWS_REGION,
//     },
//     environment: env,
//     vpcCidr: envConfig.vpcCidr,
//     maxAzs: envConfig.maxAzs,
//     natGateways: envConfig.natGateways,
//     enableFlowLogs: envConfig.enableFlowLogs ?? false,
//     tags: {
//       Environment: env,
//       Project: 'Jarvis',
//       ManagedBy: 'CDK',
//     },
//   });
//
//   // ECS Stack (using custom VPC)
//   new EcsStack(app, `Jarvis-ECS-${env}`, {
//     env: {
//       account: process.env.CDK_DEFAULT_ACCOUNT || process.env.AWS_ACCOUNT_ID,
//       region: envConfig.region || process.env.CDK_DEFAULT_REGION || process.env.AWS_REGION,
//     },
//     environment: env,
//     desiredCount: envConfig.desiredCount || 1,
//     containerPort: 8080,
//     tags: {
//       Environment: env,
//       Project: 'Jarvis',
//       ManagedBy: 'CDK',
//     },
//   });
// }
//
// createEnvironmentStacks(app, 'staging');
// createEnvironmentStacks(app, 'prod');

app.synth();
