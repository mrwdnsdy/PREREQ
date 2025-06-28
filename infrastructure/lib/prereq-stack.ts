import * as cdk from 'aws-cdk-lib';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export class PrereqStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // VPC for RDS
    const vpc = new ec2.Vpc(this, 'PrereqVPC', {
      maxAzs: 2,
      natGateways: 1,
    });

    // Security Group for RDS
    const dbSecurityGroup = new ec2.SecurityGroup(this, 'PrereqDBSecurityGroup', {
      vpc,
      description: 'Security group for PREREQ RDS instance',
      allowAllOutbound: true,
    });

    // Allow PostgreSQL access from anywhere (for development)
    // In production, restrict to specific IPs or VPC
    dbSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(5432),
      'Allow PostgreSQL access'
    );

    // RDS PostgreSQL Instance
    const database = new rds.DatabaseInstance(this, 'PrereqDatabase', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_17_5,
      }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      securityGroups: [dbSecurityGroup],
      databaseName: 'prereq',
      credentials: rds.Credentials.fromGeneratedSecret('prereq_admin'),
      backupRetention: cdk.Duration.days(7),
      deletionProtection: false, // Set to true for production
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Set to RETAIN for production
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

    // Lambda Function for API
    const apiLambda = new lambda.Function(this, 'PrereqAPILambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'dist/main.handler',
      code: lambda.Code.fromAsset('../backend'),
      vpc,
      environment: {
        DB_SECRET_ARN: database.secret?.secretArn || '',
        JWT_SECRET: 'your-jwt-secret-change-in-production',
        COGNITO_USER_POOL_ID: userPool.userPoolId,
        COGNITO_CLIENT_ID: userPoolClient.userPoolClientId,
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
    });

    // Grant Lambda access to RDS and Secrets Manager
    database.grantConnect(apiLambda);
    database.secret?.grantRead(apiLambda);

    // API Gateway
    const api = new apigateway.RestApi(this, 'PrereqAPI', {
      restApiName: 'PREREQ API',
      description: 'PREREQ Project Management API',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    // API Gateway Integration
    const integration = new apigateway.LambdaIntegration(apiLambda);

    // API Routes
    api.root.addProxy({
      defaultIntegration: integration,
      anyMethod: true,
    });

    // S3 Bucket for Frontend
    const frontendBucket = new s3.Bucket(this, 'PrereqFrontendBucket', {
      bucketName: `prereq-frontend-${this.account}-${this.region}`,
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'index.html',
      publicReadAccess: true,
      blockPublicAccess: new s3.BlockPublicAccess({
        blockPublicAcls: false,
        ignorePublicAcls: false,
        blockPublicPolicy: false,
        restrictPublicBuckets: false,
      }),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // CloudFront Distribution
    const distribution = new cloudfront.Distribution(this, 'PrereqDistribution', {
      defaultBehavior: {
        origin: new origins.S3Origin(frontendBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
        },
      ],
    });

    // Outputs
    new cdk.CfnOutput(this, 'DatabaseEndpoint', {
      value: database.instanceEndpoint.hostname,
      description: 'RDS Database Endpoint',
    });

    new cdk.CfnOutput(this, 'DatabasePort', {
      value: database.instanceEndpoint.port.toString(),
      description: 'RDS Database Port',
    });

    new cdk.CfnOutput(this, 'DatabaseName', {
      value: database.instanceEndpoint.hostname,
      description: 'RDS Database Name',
    });

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
      value: distribution.distributionDomainName,
      description: 'CloudFront Distribution URL',
    });
  }
} 