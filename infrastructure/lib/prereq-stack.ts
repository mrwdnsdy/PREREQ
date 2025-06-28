import * as cdk from 'aws-cdk-lib';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export class PrereqStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Determine if this is production environment
    const isProd = this.node.tryGetContext('env') === 'prod';
    
    // Developer IP for dev environment database access (configure this!)
    const devIP = this.node.tryGetContext('devIP') || '0.0.0.0/0'; // Replace with your IP/32

    // VPC with environment-aware NAT configuration
    const vpc = new ec2.Vpc(this, 'PrereqVPC', {
      maxAzs: 2,
      natGateways: isProd ? 1 : 0,
      subnetConfiguration: [
        { name: 'Public', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: 'Private', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
    });

    // VPC Endpoints for dev environment (no NAT)
    if (!isProd) {
      vpc.addGatewayEndpoint('S3Endpoint', { service: ec2.GatewayVpcEndpointAwsService.S3 });
      vpc.addInterfaceEndpoint('SecretsEndpoint', {
        service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
      });
    }

    // Lambda Security Group
    const lambdaSg = new ec2.SecurityGroup(this, 'PrereqLambdaSG', {
      vpc,
      description: 'Security group for PREREQ Lambda functions',
      allowAllOutbound: true,
    });

    // Database Security Group with environment-aware access
    const dbSecurityGroup = new ec2.SecurityGroup(this, 'PrereqDBSecurityGroup', {
      vpc,
      description: 'Security group for PREREQ RDS instance',
      allowAllOutbound: true,
    });

    // Allow PostgreSQL access from Lambda (all environments)
    dbSecurityGroup.addIngressRule(
      lambdaSg,
      ec2.Port.tcp(5432),
      'Allow PostgreSQL access from Lambda'
    );

    // Dev only: Allow direct access from developer IP
    if (!isProd) {
      dbSecurityGroup.addIngressRule(
        ec2.Peer.ipv4(devIP),
        ec2.Port.tcp(5432),
        'Allow PostgreSQL access from developer IP (dev only)'
      );
    }

    // Environment-aware RDS configuration
    const database = new rds.DatabaseInstance(this, 'PrereqDatabase', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_17_5,
      }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      vpc,
      vpcSubnets: {
        // Dev: public subnets for direct access, Prod: private isolated
        subnetType: isProd ? ec2.SubnetType.PRIVATE_ISOLATED : ec2.SubnetType.PUBLIC,
      },
      securityGroups: [dbSecurityGroup],
      databaseName: 'prereq',
      credentials: rds.Credentials.fromGeneratedSecret('prereq_admin'),
      // Dev: publicly accessible for local tools, Prod: private
      publiclyAccessible: !isProd,
      backupRetention: cdk.Duration.days(7),
      // Prod: enable deletion protection, Dev: allow easy cleanup
      deletionProtection: isProd,
      removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // Add automatic secret rotation for database
    database.addRotationSingleUser();

    // RDS Proxy for connection pooling and enhanced security
    const dbProxy = new rds.DatabaseProxy(this, 'PrereqDatabaseProxy', {
      proxyTarget: rds.ProxyTarget.fromInstance(database),
      secrets: [database.secret!],
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
      securityGroups: [dbSecurityGroup],
      requireTLS: true,
    });

    // Optional: SSM Bastion for prod debugging (t3.nano)
    let bastionInstance: ec2.Instance | undefined;
    if (isProd) {
      // Bastion security group
      const bastionSg = new ec2.SecurityGroup(this, 'PrereqBastionSG', {
        vpc,
        description: 'Security group for PREREQ SSM bastion',
        allowAllOutbound: true,
      });

      // Bastion instance for port forwarding in prod
      bastionInstance = new ec2.Instance(this, 'PrereqBastion', {
        instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.NANO),
        machineImage: ec2.MachineImage.latestAmazonLinux2023(),
        vpc,
        vpcSubnets: {
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
        securityGroup: bastionSg,
        role: new iam.Role(this, 'PrereqBastionRole', {
          assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
          managedPolicies: [
            iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
          ],
        }),
        userData: ec2.UserData.forLinux(),
      });

      // Allow bastion to access database
      dbSecurityGroup.addIngressRule(
        bastionSg,
        ec2.Port.tcp(5432),
        'Allow PostgreSQL access from bastion (prod only)'
      );
    }

    // JWT Secret in Secrets Manager
    const jwtSecret = new secretsmanager.Secret(this, 'JwtSecret', {
      description: 'JWT signing secret for PREREQ API',
      generateSecretString: {
        excludePunctuation: true,
        passwordLength: 32,
      },
      removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // Cognito User Pool
    const userPool = new cognito.UserPool(this, 'PrereqUserPool', {
      userPoolName: 'prereq-users',
      selfSignUpEnabled: true,
      signInAliases: {
        email: true,
      },
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
        fullname: {
          required: false,
          mutable: true,
        },
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
    });

    // Cognito User Pool Client
    const userPoolClient = new cognito.UserPoolClient(this, 'PrereqUserPoolClient', {
      userPool,
      userPoolClientName: 'prereq-client',
      generateSecret: false,
      authFlows: {
        adminUserPassword: true,
        userPassword: true,
        userSrp: true,
      },
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
        },
        scopes: [cognito.OAuthScope.EMAIL, cognito.OAuthScope.OPENID, cognito.OAuthScope.PROFILE],
        callbackUrls: ['http://localhost:5173/callback', 'https://your-domain.com/callback'],
      },
    });

    // Lambda Function using NodejsFunction with tree-shaking
    const apiLambda = new NodejsFunction(this, 'PrereqAPILambda', {
      entry: '../backend/src/main.ts',
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_18_X,
      bundling: {
        externalModules: ['@nestjs/core', '@nestjs/common', 'pg'],
        minify: true,
        sourceMap: true,
      },
      vpc,
      securityGroups: [lambdaSg],
      environment: {
        // Use RDS Proxy endpoint for better connection management
        DB_SECRET_ARN: database.secret!.secretArn,
        DB_PROXY_ENDPOINT: dbProxy.endpoint,
        JWT_SECRET_ARN: jwtSecret.secretArn,
        COGNITO_USER_POOL_ID: userPool.userPoolId,
        COGNITO_CLIENT_ID: userPoolClient.userPoolClientId,
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
    });

    // Lambda log group with symmetric retention
    new logs.LogGroup(this, 'PrereqAPILambdaLogs', {
      logGroupName: `/aws/lambda/${apiLambda.functionName}`,
      retention: logs.RetentionDays.ONE_MONTH,
    });

    // Grant Lambda access to RDS Proxy and Secrets Manager
    dbProxy.grantConnect(apiLambda, 'prereq_admin');
    database.secret?.grantRead(apiLambda);
    jwtSecret.grantRead(apiLambda);

    // Access-log group
    const apiLogs = new logs.LogGroup(this, 'PrereqApiLogs', {
      retention: logs.RetentionDays.ONE_MONTH,
    });

    // API Gateway with throttling protection
    const api = new apigateway.RestApi(this, 'PrereqAPI', {
      restApiName: 'PREREQ API',
      description: 'PREREQ Project Management API',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization'],
      },
      deployOptions: {
        stageName: isProd ? 'prod' : 'dev',
        throttlingRateLimit: 50,
        throttlingBurstLimit: 20,
        metricsEnabled: true,
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        accessLogDestination: new apigateway.LogGroupLogDestination(apiLogs),
        accessLogFormat: apigateway.AccessLogFormat.jsonWithStandardFields({
          caller: true,
          httpMethod: true,
          ip: true,
          protocol: true,
          requestTime: true,
          resourcePath: true,
          responseLength: true,
          status: true,
          user: true,
        }),
      },
    });

    // API Gateway Integration
    const integration = new apigateway.LambdaIntegration(apiLambda);

    // API Routes
    api.root.addProxy({
      defaultIntegration: integration,
      anyMethod: true,
    });

    // WAFv2 WebACL for API protection
    const webAcl = new wafv2.CfnWebACL(this, 'ApiWaf', {
      defaultAction: { allow: {} },
      scope: 'REGIONAL',
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: 'PrereqApiWaf',
        sampledRequestsEnabled: true,
      },
      name: 'PrereqApiWaf',
      rules: [
        {
          name: 'AWS-AWSManagedCommonRuleSet',
          priority: 0,
          statement: { managedRuleGroupStatement: {
            name: 'AWSManagedRulesCommonRuleSet',
            vendorName: 'AWS',
          }},
          overrideAction: { none: {} },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'CommonRules',
            sampledRequestsEnabled: true,
          },
        },
        {
          name: 'IpRateLimit',
          priority: 1,
          statement: {
            rateBasedStatement: {
              limit: 2000,         // 2 000 requests in 5 min per IP
              aggregateKeyType: 'IP',
            },
          },
          action: { block: {} },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'IpRateLimit',
            sampledRequestsEnabled: true,
          },
        },
      ],
    });

    // Associate WAF with API Gateway
    new wafv2.CfnWebACLAssociation(this, 'ApiWafAssoc', {
      webAclArn: webAcl.attrArn,
      resourceArn: api.deploymentStage.stageArn,
    });

    // Private S3 Bucket for Frontend
    const frontendBucket = new s3.Bucket(this, 'PrereqFrontendBucket', {
      bucketName: `prereq-frontend-${this.account}-${this.region}`,
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: !isProd,
    });

    // CloudFront Origin Access Identity
    const originAccessIdentity = new cloudfront.OriginAccessIdentity(this, 'PrereqOAI', {
      comment: 'OAI for PREREQ frontend bucket',
    });

    // Grant CloudFront read access to the bucket
    frontendBucket.grantRead(originAccessIdentity);

    // CloudFront Distribution with SPA-optimized caching
    const distribution = new cloudfront.Distribution(this, 'PrereqDistribution', {
      defaultBehavior: {
        origin: new origins.S3Origin(frontendBucket, {
          originAccessIdentity,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(0), // No caching for SPA routes
        },
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(0), // No caching for SPA routes
        },
      ],
    });

    // Store sensitive values in SSM Parameters instead of outputs
    new ssm.StringParameter(this, 'DatabaseEndpointParam', {
      parameterName: '/prereq/database/endpoint',
      stringValue: database.instanceEndpoint.hostname,
      description: 'RDS Database Endpoint',
    });

    new ssm.StringParameter(this, 'DatabaseProxyEndpointParam', {
      parameterName: '/prereq/database/proxy-endpoint',
      stringValue: dbProxy.endpoint,
      description: 'RDS Proxy Endpoint',
    });

    new ssm.StringParameter(this, 'DatabaseSecretArnParam', {
      parameterName: '/prereq/database/secret-arn',
      stringValue: database.secret?.secretArn || '',
      description: 'RDS Database Secret ARN',
    });

    new ssm.StringParameter(this, 'JwtSecretArnParam', {
      parameterName: '/prereq/jwt/secret-arn',
      stringValue: jwtSecret.secretArn,
      description: 'JWT Secret ARN',
    });

    // Environment-specific outputs
    if (bastionInstance) {
      new cdk.CfnOutput(this, 'BastionInstanceId', {
        value: bastionInstance.instanceId,
        description: 'Bastion instance ID for SSM port forwarding (prod only)',
      });
    }

    new cdk.CfnOutput(this, 'DatabaseEnvironment', {
      value: isProd ? 'production (private)' : 'development (public)',
      description: 'Database environment configuration',
    });

    new cdk.CfnOutput(this, 'DatabaseEndpoint', {
      value: database.instanceEndpoint.hostname,
      description: 'Direct database endpoint',
    });

    new cdk.CfnOutput(this, 'DatabaseProxyEndpoint', {
      value: dbProxy.endpoint,
      description: 'RDS Proxy endpoint (recommended for applications)',
    });

    // Keep existing public-facing outputs
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: userPool.userPoolId,
      description: 'Cognito User Pool ID',
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
    });

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
      description: 'API Gateway URL',
    });

    new cdk.CfnOutput(this, 'FrontendUrl', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'CloudFront Distribution URL',
    });
  }
} 