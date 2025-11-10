import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export interface VpcStackProps extends cdk.StackProps {
  environment: string;
  vpcCidr: string;
  maxAzs: number;
  natGateways: number;
  enableFlowLogs?: boolean;
}

export class VpcStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;

  constructor(scope: Construct, id: string, props: VpcStackProps) {
    super(scope, id, props);

    // Create VPC with public and private subnets across AZs
    // MVP: Single AZ for cost optimization (~$32-35/month)
    // PRODUCTION: Increase maxAzs to 2-3 for high availability
    this.vpc = new ec2.Vpc(this, 'JarvisVPC', {
      ipAddresses: ec2.IpAddresses.cidr(props.vpcCidr),
      maxAzs: props.maxAzs,
      natGateways: props.natGateways,

      // Subnet configuration
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 20, // /20 for public subnets (ALB, NAT)
        },
        {
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 19, // /19 for private subnets (ECS tasks)
        },
        {
          name: 'Isolated',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 20, // /20 for isolated subnets (RDS)
        },
      ],

      // Enable DNS
      enableDnsHostnames: true,
      enableDnsSupport: true,

      // VPC Flow Logs - Optional for cost savings in dev/demo environments
      // Enable for production to monitor traffic patterns and security
      // Set enableFlowLogs: true in cdk.json to enable
      ...(props.enableFlowLogs && {
        flowLogs: {
          'FlowLog': {
            destination: ec2.FlowLogDestination.toCloudWatchLogs(),
            trafficType: ec2.FlowLogTrafficType.ALL,
          },
        },
      }),
    });

    // ========================================================================
    // VPC ENDPOINTS - Gateway (FREE)
    // ========================================================================
    // Gateway endpoints have no hourly charge or data transfer costs

    this.vpc.addGatewayEndpoint('S3Endpoint', {
      service: ec2.GatewayVpcEndpointAwsService.S3,
      subnets: [{ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }],
    });

    this.vpc.addGatewayEndpoint('DynamoDBEndpoint', {
      service: ec2.GatewayVpcEndpointAwsService.DYNAMODB,
      subnets: [{ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }],
    });

    // ========================================================================
    // INTERFACE VPC ENDPOINTS - Disabled for MVP Cost Optimization
    // ========================================================================
    // Interface endpoints cost ~$7.20/month each + data transfer ($0.01/GB)
    // Total cost for all endpoints below: ~$86.40/month + data transfer
    //
    // WHEN TO ENABLE:
    // - Production environments with high NAT gateway data transfer costs
    // - When data transfer through NAT exceeds $0.01/GB (NAT costs $0.045/GB)
    // - For improved security (traffic stays within AWS network)
    //
    // TO ENABLE: Uncomment the code below and add endpoint security group
    //
    // const endpointSecurityGroup = new ec2.SecurityGroup(
    //   this,
    //   'VpcEndpointSG',
    //   {
    //     vpc: this.vpc,
    //     description: 'Security group for VPC endpoints',
    //     allowAllOutbound: true,
    //   }
    // );
    //
    // endpointSecurityGroup.addIngressRule(
    //   ec2.Peer.ipv4(props.vpcCidr),
    //   ec2.Port.tcp(443),
    //   'Allow HTTPS from VPC'
    // );
    //
    // // ECR endpoints (for pulling Docker images)
    // this.vpc.addInterfaceEndpoint('EcrApiEndpoint', {
    //   service: ec2.InterfaceVpcEndpointAwsService.ECR,
    //   subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
    //   securityGroups: [endpointSecurityGroup],
    //   privateDnsEnabled: true,
    // });
    //
    // this.vpc.addInterfaceEndpoint('EcrDkrEndpoint', {
    //   service: ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER,
    //   subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
    //   securityGroups: [endpointSecurityGroup],
    //   privateDnsEnabled: true,
    // });
    //
    // // CloudWatch endpoints (for logging and monitoring)
    // this.vpc.addInterfaceEndpoint('CloudWatchLogsEndpoint', {
    //   service: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
    //   subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
    //   securityGroups: [endpointSecurityGroup],
    //   privateDnsEnabled: true,
    // });
    //
    // this.vpc.addInterfaceEndpoint('CloudWatchMonitoringEndpoint', {
    //   service: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_MONITORING,
    //   subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
    //   securityGroups: [endpointSecurityGroup],
    //   privateDnsEnabled: true,
    // });
    //
    // // Secrets Manager endpoint (for retrieving secrets)
    // this.vpc.addInterfaceEndpoint('SecretsManagerEndpoint', {
    //   service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
    //   subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
    //   securityGroups: [endpointSecurityGroup],
    //   privateDnsEnabled: true,
    // });
    //
    // // KMS endpoint (for encryption/decryption)
    // this.vpc.addInterfaceEndpoint('KmsEndpoint', {
    //   service: ec2.InterfaceVpcEndpointAwsService.KMS,
    //   subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
    //   securityGroups: [endpointSecurityGroup],
    //   privateDnsEnabled: true,
    // });
    //
    // // SSM endpoints (for Systems Manager and ECS Exec)
    // this.vpc.addInterfaceEndpoint('SsmEndpoint', {
    //   service: ec2.InterfaceVpcEndpointAwsService.SSM,
    //   subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
    //   securityGroups: [endpointSecurityGroup],
    //   privateDnsEnabled: true,
    // });
    //
    // this.vpc.addInterfaceEndpoint('SsmMessagesEndpoint', {
    //   service: ec2.InterfaceVpcEndpointAwsService.SSM_MESSAGES,
    //   subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
    //   securityGroups: [endpointSecurityGroup],
    //   privateDnsEnabled: true,
    // });
    //
    // // STS endpoint (for IAM role assumption)
    // this.vpc.addInterfaceEndpoint('StsEndpoint', {
    //   service: ec2.InterfaceVpcEndpointAwsService.STS,
    //   subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
    //   securityGroups: [endpointSecurityGroup],
    //   privateDnsEnabled: true,
    // });
    //
    // // ECS endpoints (for ECS service operations)
    // this.vpc.addInterfaceEndpoint('EcsEndpoint', {
    //   service: ec2.InterfaceVpcEndpointAwsService.ECS,
    //   subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
    //   securityGroups: [endpointSecurityGroup],
    //   privateDnsEnabled: true,
    // });
    //
    // this.vpc.addInterfaceEndpoint('EcsAgentEndpoint', {
    //   service: ec2.InterfaceVpcEndpointAwsService.ECS_AGENT,
    //   subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
    //   securityGroups: [endpointSecurityGroup],
    //   privateDnsEnabled: true,
    // });
    //
    // this.vpc.addInterfaceEndpoint('EcsTelemetryEndpoint', {
    //   service: ec2.InterfaceVpcEndpointAwsService.ECS_TELEMETRY,
    //   subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
    //   securityGroups: [endpointSecurityGroup],
    //   privateDnsEnabled: true,
    // });

    // Outputs
    new cdk.CfnOutput(this, 'VpcId', {
      value: this.vpc.vpcId,
      description: 'VPC ID',
      exportName: `${props.environment}-VpcId`,
    });

    new cdk.CfnOutput(this, 'VpcCidr', {
      value: this.vpc.vpcCidrBlock,
      description: 'VPC CIDR Block',
      exportName: `${props.environment}-VpcCidr`,
    });

    new cdk.CfnOutput(this, 'PrivateSubnetIds', {
      value: this.vpc.privateSubnets.map(s => s.subnetId).join(','),
      description: 'Private Subnet IDs',
      exportName: `${props.environment}-PrivateSubnetIds`,
    });

    new cdk.CfnOutput(this, 'PublicSubnetIds', {
      value: this.vpc.publicSubnets.map(s => s.subnetId).join(','),
      description: 'Public Subnet IDs',
      exportName: `${props.environment}-PublicSubnetIds`,
    });

    new cdk.CfnOutput(this, 'IsolatedSubnetIds', {
      value: this.vpc.isolatedSubnets.map(s => s.subnetId).join(','),
      description: 'Isolated Subnet IDs (for RDS)',
      exportName: `${props.environment}-IsolatedSubnetIds`,
    });

    // Tag all resources
    cdk.Tags.of(this).add('Project', 'Jarvis');
    cdk.Tags.of(this).add('Environment', props.environment);
    cdk.Tags.of(this).add('ManagedBy', 'CDK');
  }
}
