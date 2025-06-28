import * as cdk from 'aws-cdk-lib';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
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

    // Environment context flags
    const env = this.node.tryGetContext('env') ?? 'dev';
    const isProd = env === 'prod';
    const isStage = env === 'stage';
    
    // Developer IP for dev environment database access
    const devIP = this.node.tryGetContext('devIP') || '104.28.133.17/32';

    // VPC configuration based on environment
    const vpc = new ec2.Vpc(this, 'PrereqVPC', {
      maxAzs: 2,
      // Dev: no NAT (cost savings), Stage/Prod: NAT for outbound access
      natGateways: env === 'dev' ? 0 : 1,
      subnetConfiguration: [
        { name: 'Public', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: 'Private', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
    });

    // VPC Endpoints for dev environment (no NAT)
    if (env === 'dev') {
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
    if (env === 'dev') {
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
        // Dev: public subnets for direct access, Stage/Prod: private isolated
        subnetType: env === 'dev' ? ec2.SubnetType.PUBLIC : ec2.SubnetType.PRIVATE_ISOLATED,
      },
      securityGroups: [dbSecurityGroup],
      databaseName: 'prereq',
      credentials: rds.Credentials.fromGeneratedSecret('prereq_admin'),
      // Dev: publicly accessible for local tools, Stage/Prod: private
      publiclyAccessible: env === 'dev',
      backupRetention: cdk.Duration.days(7),
      // Prod: enable deletion protection, Dev/Stage: allow easy cleanup
      deletionProtection: isProd,
      removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // Add automatic secret rotation for database
    database.addRotationSingleUser();

    // RDS Proxy configuration based on environment
    let dbProxy: rds.DatabaseProxy | undefined;
    let dbEndpoint: string;
    
    if (env !== 'dev') {
      // Create environment-specific security groups for proxy
      let proxySecurityGroups: ec2.SecurityGroup[];
      
      if (isStage) {
        // Stage: Create public security group for proxy
        const proxyPublicSg = new ec2.SecurityGroup(this, 'PrereqProxyPublicSG', {
          vpc,
          description: 'Public access security group for RDS Proxy (stage only)',
          allowAllOutbound: true,
        });
        
        // Allow public access to proxy in stage (for founders/demo clients)
        proxyPublicSg.addIngressRule(
          ec2.Peer.anyIpv4(),
          ec2.Port.tcp(5432),
          'Allow public access to RDS Proxy (stage only)'
        );

        // Stage: Use both DB security group and public security group
        proxySecurityGroups = [dbSecurityGroup, proxyPublicSg];
      } else {
        // Prod: Use only the private DB security group
        proxySecurityGroups = [dbSecurityGroup];
      }

      // Stage/Prod: Create RDS Proxy with appropriate security groups
      dbProxy = new rds.DatabaseProxy(this, 'PrereqDatabaseProxy', {
        proxyTarget: rds.ProxyTarget.fromInstance(database),
        secrets: [database.secret!],
        vpc,
        vpcSubnets: {
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
        securityGroups: proxySecurityGroups,
        requireTLS: true,
      });
      
      dbEndpoint = dbProxy.endpoint;
    } else {
      // Dev: Direct database connection
      dbEndpoint = database.instanceEndpoint.hostname;
    }

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

    // Add monthly rotation for JWT secret in production
    if (isProd) {
      jwtSecret.addRotationSchedule('RotateMonthly', {
        automaticallyAfter: cdk.Duration.days(30),
      });
    }

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

    // Environment-specific throttling rates
    const throttleConfig = {
      dev: { rate: undefined, burst: undefined }, // Unlimited
      stage: { rate: 20, burst: 10 },
      prod: { rate: 50, burst: 20 }
    };

    const currentThrottle = throttleConfig[env as keyof typeof throttleConfig];

    // Lambda Function using regular Function (no Docker required)
    // When switching back to NodejsFunction, consider:
    // bundling: { externalModules: ['@nestjs/*', 'pg'] }
    const apiLambda = new lambda.Function(this, 'PrereqAPILambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'main.handler',
      code: lambda.Code.fromAsset('../backend/dist'),
      vpc,
      securityGroups: [lambdaSg],
      environment: {
        DB_SECRET_ARN: database.secret!.secretArn,
        DB_HOST: dbEndpoint,
        ...(dbProxy && { DB_PROXY_ENDPOINT: dbProxy.endpoint }),
        JWT_SECRET_ARN: jwtSecret.secretArn,
        COGNITO_USER_POOL_ID: userPool.userPoolId,
        COGNITO_CLIENT_ID: userPoolClient.userPoolClientId,
        NODE_ENV: env,
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
    });

    // Lambda log group with symmetric retention
    new logs.LogGroup(this, 'PrereqAPILambdaLogs', {
      logGroupName: `/aws/lambda/${apiLambda.functionName}`,
      retention: logs.RetentionDays.ONE_MONTH,
    });

    // Grant Lambda access to database/proxy and secrets
    if (dbProxy) {
      dbProxy.grantConnect(apiLambda, 'prereq_admin');
    } else {
      database.grantConnect(apiLambda);
    }
    database.secret?.grantRead(apiLambda);
    jwtSecret.grantRead(apiLambda);

    // Access-log group
    const apiLogs = new logs.LogGroup(this, 'PrereqApiLogs', {
      retention: logs.RetentionDays.ONE_MONTH,
    });

    // API Gateway with environment-specific throttling
    const deployOptions: any = {
      stageName: env,
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
    };

    // Add throttling only for stage/prod
    if (currentThrottle.rate && currentThrottle.burst) {
      deployOptions.throttlingRateLimit = currentThrottle.rate;
      deployOptions.throttlingBurstLimit = currentThrottle.burst;
    }

    const api = new apigateway.RestApi(this, 'PrereqAPI', {
      restApiName: 'PREREQ API',
      description: 'PREREQ Project Management API',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization'],
      },
      deployOptions,
    });

    // API Gateway Integration
    const integration = new apigateway.LambdaIntegration(apiLambda);

    // API Routes
    api.root.addProxy({
      defaultIntegration: integration,
      anyMethod: true,
    });

    // WAF for stage/prod only (dev has no WAF)
    if (env !== 'dev') {
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
                limit: 2000,         // 2000 requests in 5 min per IP
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
    }

    // Private S3 Bucket for Frontend
    const frontendBucket = new s3.Bucket(this, 'PrereqFrontendBucket', {
      bucketName: `prereq-frontend-${env}-${this.account}-${this.region}`,
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

    // Store sensitive values in SSM Parameters
    new ssm.StringParameter(this, 'DatabaseEndpointParam', {
      parameterName: `/prereq/${env}/database/endpoint`,
      stringValue: database.instanceEndpoint.hostname,
      description: `RDS Database Endpoint (${env})`,
    });

    if (dbProxy) {
      new ssm.StringParameter(this, 'DatabaseProxyEndpointParam', {
        parameterName: `/prereq/${env}/database/proxy-endpoint`,
        stringValue: dbProxy.endpoint,
        description: `RDS Proxy Endpoint (${env})`,
      });
    }

    new ssm.StringParameter(this, 'DatabaseSecretArnParam', {
      parameterName: `/prereq/${env}/database/secret-arn`,
      stringValue: database.secret?.secretArn || '',
      description: `RDS Database Secret ARN (${env})`,
    });

    new ssm.StringParameter(this, 'JwtSecretArnParam', {
      parameterName: `/prereq/${env}/jwt/secret-arn`,
      stringValue: jwtSecret.secretArn,
      description: `JWT Secret ARN (${env})`,
    });

    // Environment-specific outputs
    new cdk.CfnOutput(this, 'Environment', {
      value: env,
      description: 'Deployment environment',
    });

    new cdk.CfnOutput(this, 'DatabaseConfiguration', {
      value: env === 'dev' 
        ? 'Public database (direct access)' 
        : isStage 
          ? 'Private database + public proxy'
          : 'Private database + private proxy',
      description: 'Database access configuration',
    });

    if (currentThrottle.rate && currentThrottle.burst) {
      new cdk.CfnOutput(this, 'ThrottlingConfiguration', {
        value: `${currentThrottle.rate}/${currentThrottle.burst} (rate/burst)`,
        description: 'API Gateway throttling limits',
      });
    } else {
      new cdk.CfnOutput(this, 'ThrottlingConfiguration', {
        value: 'Unlimited',
        description: 'API Gateway throttling limits',
      });
    }

    new cdk.CfnOutput(this, 'WAFProtection', {
      value: env === 'dev' ? 'Disabled' : 'Enabled',
      description: 'WAF protection status',
    });

    if (bastionInstance) {
      new cdk.CfnOutput(this, 'BastionInstanceId', {
        value: bastionInstance.instanceId,
        description: 'Bastion instance ID for SSM port forwarding (prod only)',
      });
    }

    new cdk.CfnOutput(this, 'DatabaseEndpoint', {
      value: isProd ? '<redacted>' : database.instanceEndpoint.hostname,
      description: 'Direct database endpoint',
    });

    if (dbProxy) {
      new cdk.CfnOutput(this, 'DatabaseProxyEndpoint', {
        value: isProd ? '<redacted>' : dbProxy.endpoint,
        description: 'RDS Proxy endpoint',
      });
    }

    // Standard outputs
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