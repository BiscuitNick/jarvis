import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecs_patterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export interface EcsStackProps extends cdk.StackProps {
  environment: string;
  desiredCount?: number;
  containerPort?: number;
  cpu?: number;
  memoryLimitMiB?: number;
}

export class EcsStack extends cdk.Stack {
  public readonly cluster: ecs.Cluster;
  public readonly service: ecs_patterns.ApplicationLoadBalancedFargateService;

  constructor(scope: Construct, id: string, props: EcsStackProps) {
    super(scope, id, props);

    // ========================================================================
    // IMPORT DEFAULT VPC
    // ========================================================================
    // For MVP, we use the existing default VPC to avoid hitting service limits
    // This saves $32/month (no NAT Gateway needed) and provides 6-AZ redundancy
    const vpc = ec2.Vpc.fromLookup(this, 'DefaultVpc', {
      isDefault: true,
    });

    // Verify we got the correct VPC
    new cdk.CfnOutput(this, 'VpcId', {
      value: vpc.vpcId,
      description: 'Default VPC ID',
      exportName: `${props.environment}-DefaultVpcId`,
    });

    // ========================================================================
    // ECS CLUSTER
    // ========================================================================
    this.cluster = new ecs.Cluster(this, 'JarvisCluster', {
      vpc: vpc,
      clusterName: `jarvis-${props.environment}-cluster`,
      // DISABLED for MVP cost optimization - saves ~$10/month
      // Enable in production: containerInsights: true
      containerInsights: false,
    });

    // ========================================================================
    // FARGATE SERVICE WITH APPLICATION LOAD BALANCER
    // ========================================================================
    // MVP Configuration:
    // - Tasks run in public subnets with public IPs (no NAT Gateway needed)
    // - Security groups control access (least privilege)
    // - ALB provides HTTPS termination and routing

    this.service = new ecs_patterns.ApplicationLoadBalancedFargateService(
      this,
      'JarvisService',
      {
        cluster: this.cluster,
        serviceName: `jarvis-${props.environment}-service`,

        // Task configuration - MVP optimized for cost
        // PRODUCTION: Increase to cpu: 512 (0.5 vCPU) or 1024 (1 vCPU) for better performance
        cpu: props.cpu || 256, // 0.25 vCPU (minimum for Fargate)

        // PRODUCTION: Increase to 1024 MB or 2048 MB for better performance
        memoryLimitMiB: props.memoryLimitMiB || 512, // 512 MB (minimum for Fargate)

        // PRODUCTION: Increase to 2+ for high availability
        // To stop service and save costs: Set to 0 (keeps ALB running at ~$16/month)
        desiredCount: props.desiredCount || 1,

        // Container configuration
        taskImageOptions: {
          // Placeholder image for now - will be replaced with actual service images
          image: ecs.ContainerImage.fromRegistry('amazon/amazon-ecs-sample'),
          containerName: 'jarvis-app',
          containerPort: props.containerPort || 8080,

          // Logging configuration
          logDriver: ecs.LogDrivers.awsLogs({
            streamPrefix: 'jarvis',
            logRetention: logs.RetentionDays.ONE_WEEK, // Cost optimization
          }),

          // Environment variables (will be added per service)
          environment: {
            ENVIRONMENT: props.environment,
            PORT: (props.containerPort || 8080).toString(),
          },
        },

        // Network configuration - MVP uses public subnets
        taskSubnets: {
          subnetType: ec2.SubnetType.PUBLIC,
        },
        assignPublicIp: true, // Required in public subnets without NAT Gateway

        // Load balancer configuration
        publicLoadBalancer: true,
        listenerPort: 80, // HTTP for MVP (add HTTPS later)

        // Health check configuration
        healthCheckGracePeriod: cdk.Duration.seconds(60),
      }
    );

    // ========================================================================
    // DEPLOYMENT CONFIGURATION - MVP optimized for cost
    // ========================================================================
    // Allow full task replacement during deploys to save costs
    // PRODUCTION: Set minHealthyPercent: 100, maxHealthyPercent: 200 for zero-downtime deploys
    const cfnService = this.service.service.node.defaultChild as ecs.CfnService;
    cfnService.deploymentConfiguration = {
      minimumHealthyPercent: 0, // Allows full stop during deploys (cost savings)
      maximumPercent: 100, // Only 1 task at a time
      deploymentCircuitBreaker: {
        enable: false, // Disabled for MVP simplicity
        rollback: false,
      },
    };

    // ========================================================================
    // HEALTH CHECK CONFIGURATION - MVP optimized for cost
    // ========================================================================
    // Longer intervals reduce health check costs
    // PRODUCTION: Reduce interval to 30 seconds for faster failure detection
    // NOTE: Using '/' for sample container - change to '/healthz' when deploying real app
    this.service.targetGroup.configureHealthCheck({
      path: '/', // Changed from '/healthz' to work with sample container
      interval: cdk.Duration.seconds(60), // Increased from 30 to save costs
      timeout: cdk.Duration.seconds(5),
      healthyThresholdCount: 2,
      unhealthyThresholdCount: 2, // Reduced from 3 for faster detection
    });

    // ========================================================================
    // LOAD BALANCER CONFIGURATION - MVP optimized
    // ========================================================================
    // Disable deletion protection for easy teardown during MVP phase
    // PRODUCTION: Enable deletion protection
    const cfnLoadBalancer = this.service.loadBalancer.node
      .defaultChild as cdk.aws_elasticloadbalancingv2.CfnLoadBalancer;
    if (cfnLoadBalancer) {
      cfnLoadBalancer.addPropertyOverride(
        'LoadBalancerAttributes',
        [
          {
            Key: 'deletion_protection.enabled',
            Value: 'false',
          },
        ]
      );
    }

    // ========================================================================
    // SECURITY GROUP CONFIGURATION
    // ========================================================================
    // ALB Security Group - already created by the pattern
    // Default: allows inbound 80 from 0.0.0.0/0

    // Task Security Group - restrict access
    // Allow inbound only from ALB on container port
    this.service.service.connections.allowFrom(
      this.service.loadBalancer,
      ec2.Port.tcp(props.containerPort || 8080),
      'Allow ALB to reach tasks'
    );

    // Allow outbound to internet (for ECR, CloudWatch, AWS APIs)
    // This is already allowed by default, but we document it here
    this.service.service.connections.allowToAnyIpv4(
      ec2.Port.tcp(443),
      'Allow tasks to reach AWS APIs'
    );

    // ========================================================================
    // AUTO SCALING - DISABLED for MVP cost optimization
    // ========================================================================
    // PRODUCTION: Enable auto-scaling for dynamic traffic handling
    // This will automatically adjust task count based on CPU/memory utilization
    //
    // const scaling = this.service.service.autoScaleTaskCount({
    //   minCapacity: 2,     // Minimum 2 tasks for HA
    //   maxCapacity: 10,    // Scale up to 10 tasks under load
    // });
    //
    // scaling.scaleOnCpuUtilization('CpuScaling', {
    //   targetUtilizationPercent: 70,
    //   scaleInCooldown: cdk.Duration.seconds(300),  // 5 min before scaling down
    //   scaleOutCooldown: cdk.Duration.seconds(60),  // 1 min before scaling up
    // });
    //
    // scaling.scaleOnMemoryUtilization('MemoryScaling', {
    //   targetUtilizationPercent: 70,
    //   scaleInCooldown: cdk.Duration.seconds(300),
    //   scaleOutCooldown: cdk.Duration.seconds(60),
    // });

    // ========================================================================
    // OUTPUTS
    // ========================================================================
    new cdk.CfnOutput(this, 'LoadBalancerDNS', {
      value: this.service.loadBalancer.loadBalancerDnsName,
      description: 'Application Load Balancer DNS name',
      exportName: `${props.environment}-LoadBalancerDNS`,
    });

    new cdk.CfnOutput(this, 'ServiceName', {
      value: this.service.service.serviceName,
      description: 'ECS Service name',
      exportName: `${props.environment}-ServiceName`,
    });

    new cdk.CfnOutput(this, 'ClusterName', {
      value: this.cluster.clusterName,
      description: 'ECS Cluster name',
      exportName: `${props.environment}-ClusterName`,
    });

    new cdk.CfnOutput(this, 'ServiceUrl', {
      value: `http://${this.service.loadBalancer.loadBalancerDnsName}`,
      description: 'Service URL',
    });

    // Tag all resources
    cdk.Tags.of(this).add('Project', 'Jarvis');
    cdk.Tags.of(this).add('Environment', props.environment);
    cdk.Tags.of(this).add('ManagedBy', 'CDK');
    cdk.Tags.of(this).add('CostCenter', 'MVP');
  }
}
