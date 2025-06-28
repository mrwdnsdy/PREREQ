"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrereqStack = void 0;
const cdk = require("aws-cdk-lib");
const rds = require("aws-cdk-lib/aws-rds");
const ec2 = require("aws-cdk-lib/aws-ec2");
const lambda = require("aws-cdk-lib/aws-lambda");
const aws_lambda_nodejs_1 = require("aws-cdk-lib/aws-lambda-nodejs");
const apigateway = require("aws-cdk-lib/aws-apigateway");
const cognito = require("aws-cdk-lib/aws-cognito");
const s3 = require("aws-cdk-lib/aws-s3");
const cloudfront = require("aws-cdk-lib/aws-cloudfront");
const origins = require("aws-cdk-lib/aws-cloudfront-origins");
const secretsmanager = require("aws-cdk-lib/aws-secretsmanager");
const wafv2 = require("aws-cdk-lib/aws-wafv2");
const ssm = require("aws-cdk-lib/aws-ssm");
const iam = require("aws-cdk-lib/aws-iam");
const logs = require("aws-cdk-lib/aws-logs");
class PrereqStack extends cdk.Stack {
    constructor(scope, id, props) {
        var _a, _b;
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
        dbSecurityGroup.addIngressRule(lambdaSg, ec2.Port.tcp(5432), 'Allow PostgreSQL access from Lambda');
        // Dev only: Allow direct access from developer IP
        if (!isProd) {
            dbSecurityGroup.addIngressRule(ec2.Peer.ipv4(devIP), ec2.Port.tcp(5432), 'Allow PostgreSQL access from developer IP (dev only)');
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
            secrets: [database.secret],
            vpc,
            vpcSubnets: {
                subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
            },
            securityGroups: [dbSecurityGroup],
            requireTLS: true,
        });
        // Optional: SSM Bastion for prod debugging (t3.nano)
        let bastionInstance;
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
            dbSecurityGroup.addIngressRule(bastionSg, ec2.Port.tcp(5432), 'Allow PostgreSQL access from bastion (prod only)');
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
        const apiLambda = new aws_lambda_nodejs_1.NodejsFunction(this, 'PrereqAPILambda', {
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
                DB_SECRET_ARN: database.secret.secretArn,
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
        (_a = database.secret) === null || _a === void 0 ? void 0 : _a.grantRead(apiLambda);
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
                        } },
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
                            limit: 2000, // 2 000 requests in 5 min per IP
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
            stringValue: ((_b = database.secret) === null || _b === void 0 ? void 0 : _b.secretArn) || '',
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
exports.PrereqStack = PrereqStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJlcmVxLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsicHJlcmVxLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLG1DQUFtQztBQUNuQywyQ0FBMkM7QUFDM0MsMkNBQTJDO0FBQzNDLGlEQUFpRDtBQUNqRCxxRUFBK0Q7QUFDL0QseURBQXlEO0FBQ3pELG1EQUFtRDtBQUNuRCx5Q0FBeUM7QUFDekMseURBQXlEO0FBQ3pELDhEQUE4RDtBQUM5RCxpRUFBaUU7QUFDakUsK0NBQStDO0FBQy9DLDJDQUEyQztBQUMzQywyQ0FBMkM7QUFDM0MsNkNBQTZDO0FBRzdDLE1BQWEsV0FBWSxTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQ3hDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBc0I7O1FBQzlELEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLDhDQUE4QztRQUM5QyxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsS0FBSyxNQUFNLENBQUM7UUFFekQscUVBQXFFO1FBQ3JFLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLE9BQU8sQ0FBQyxJQUFJLFdBQVcsQ0FBQyxDQUFDLDBCQUEwQjtRQUV6RiwrQ0FBK0M7UUFDL0MsTUFBTSxHQUFHLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxXQUFXLEVBQUU7WUFDekMsTUFBTSxFQUFFLENBQUM7WUFDVCxXQUFXLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDM0IsbUJBQW1CLEVBQUU7Z0JBQ25CLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxVQUFVLEVBQUUsR0FBRyxDQUFDLFVBQVUsQ0FBQyxNQUFNLEVBQUUsUUFBUSxFQUFFLEVBQUUsRUFBRTtnQkFDbkUsRUFB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LEVBQUUsWUFBWSxFQUFFO1lBQ3BDLEtBQUssRUFBRSxRQUFRLENBQUMsVUFBVTtZQUMxQixXQUFXLEVBQUUsc0JBQXNCO1NBQ3BDLENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsa0JBQWtCLEVBQUU7WUFDMUMsS0FBSyxFQUFFLGNBQWMsQ0FBQyxnQkFBZ0I7WUFDdEMsV0FBVyxFQUFFLDZCQUE2QjtTQUMzQyxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLFFBQVEsRUFBRTtZQUNoQyxLQUFLLEVBQUUsR0FBRyxDQUFDLEdBQUc7WUFDZCxXQUFXLEVBQUUsaUJBQWlCO1NBQy9CLENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsYUFBYSxFQUFFO1lBQ3JDLEtBQUssRUFBRSxXQUFXLFlBQVksQ0FBQyxzQkFBc0IsRUFBRTtZQUN2RCxXQUFXLEVBQUUsNkJBQTZCO1NBQzNDLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQTlhRCxrQ0E4YUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0ICogYXMgcmRzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1yZHMnO1xuaW1wb3J0ICogYXMgZWMyIGZyb20gJ2F3cy1jZGstbGliL2F3cy1lYzInO1xuaW1wb3J0ICogYXMgbGFtYmRhIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sYW1iZGEnO1xuaW1wb3J0IHsgTm9kZWpzRnVuY3Rpb24gfSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhLW5vZGVqcyc7XG5pbXBvcnQgKiBhcyBhcGlnYXRld2F5IGZyb20gJ2F3cy1jZGstbGliL2F3cy1hcGlnYXRld2F5JztcbmltcG9ydCAqIGFzIGNvZ25pdG8gZnJvbSAnYXdzLWNkay1saWIvYXdzLWNvZ25pdG8nO1xuaW1wb3J0ICogYXMgczMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzJztcbmltcG9ydCAqIGFzIGNsb3VkZnJvbnQgZnJvbSAnYXdzLWNkay1saWIvYXdzLWNsb3VkZnJvbnQnO1xuaW1wb3J0ICogYXMgb3JpZ2lucyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY2xvdWRmcm9udC1vcmlnaW5zJztcbmltcG9ydCAqIGFzIHNlY3JldHNtYW5hZ2VyIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zZWNyZXRzbWFuYWdlcic7XG5pbXBvcnQgKiBhcyB3YWZ2MiBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtd2FmdjInO1xuaW1wb3J0ICogYXMgc3NtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zc20nO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1pYW0nO1xuaW1wb3J0ICogYXMgbG9ncyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbG9ncyc7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcblxuZXhwb3J0IGNsYXNzIFByZXJlcVN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM/OiBjZGsuU3RhY2tQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuXG4gICAgLy8gRGV0ZXJtaW5lIGlmIHRoaXMgaXMgcHJvZHVjdGlvbiBlbnZpcm9ubWVudFxuICAgIGNvbnN0IGlzUHJvZCA9IHRoaXMubm9kZS50cnlHZXRDb250ZXh0KCdlbnYnKSA9PT0gJ3Byb2QnO1xuICAgIFxuICAgIC8vIERldmVsb3BlciBJUCBmb3IgZGV2IGVudmlyb25tZW50IGRhdGFiYXNlIGFjY2VzcyAoY29uZmlndXJlIHRoaXMhKVxuICAgIGNvbnN0IGRldklQID0gdGhpcy5ub2RlLnRyeUdldENvbnRleHQoJ2RldklQJykgfHwgJzAuMC4wLjAvMCc7IC8vIFJlcGxhY2Ugd2l0aCB5b3VyIElQLzMyXG5cbiAgICAvLyBWUEMgd2l0aCBlbnZpcm9ubWVudC1hd2FyZSBOQVQgY29uZmlndXJhdGlvblxuICAgIGNvbnN0IHZwYyA9IG5ldyBlYzIuVnBjKHRoaXMsICdQcmVyZXFWUEMnLCB7XG4gICAgICBtYXhBenM6IDIsXG4gICAgICBuYXRHYXRld2F5czogaXNQcm9kID8gMSA6IDAsXG4gICAgICBzdWJuZXRDb25maWd1cmF0aW9uOiBbXG4gICAgICAgIHsgbmFtZTogJ1B1YmxpYycsIHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBVQkxJQywgY2lkck1hc2s6IDI0IH0sXG4gICAgICAgIHsgbmFtZTogJ1ByaXZhdGUnLCBzdWJuZXRUeXBlOiBlYzIuU3VibmV0VHlwZS5QUklWQVRFX0lTT0xBVEVELCBjaWRyTWFzazogMjQgfSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICAvLyBWUEMgRW5kcG9pbnRzIGZvciBkZXYgZW52aXJvbm1lbnQgKG5vIE5BVClcbiAgICBpZiAoIWlzUHJvZCkge1xuICAgICAgdnBjLmFkZEdhdGV3YXlFbmRwb2ludCgnUzNFbmRwb2ludCcsIHsgc2VydmljZTogZWMyLkdhdGV3YXlWcGNFbmRwb2ludEF3c1NlcnZpY2UuUzMgfSk7XG4gICAgICB2cGMuYWRkSW50ZXJmYWNlRW5kcG9pbnQoJ1NlY3JldHNFbmRwb2ludCcsIHtcbiAgICAgICAgc2VydmljZTogZWMyLkludGVyZmFjZVZwY0VuZHBvaW50QXdzU2VydmljZS5TRUNSRVRTX01BTkFHRVIsXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBMYW1iZGEgU2VjdXJpdHkgR3JvdXBcbiAgICBjb25zdCBsYW1iZGFTZyA9IG5ldyBlYzIuU2VjdXJpdHlHcm91cCh0aGlzLCAnUHJlcmVxTGFtYmRhU0cnLCB7XG4gICAgICB2cGMsXG4gICAgICBkZXNjcmlwdGlvbjogJ1NlY3VyaXR5IGdyb3VwIGZvciBQUkVSRVEgTGFtYmRhIGZ1bmN0aW9ucycsXG4gICAgICBhbGxvd0FsbE91dGJvdW5kOiB0cnVlLFxuICAgIH0pO1xuXG4gICAgLy8gRGF0YWJhc2UgU2VjdXJpdHkgR3JvdXAgd2l0aCBlbnZpcm9ubWVudC1hd2FyZSBhY2Nlc3NcbiAgICBjb25zdCBkYlNlY3VyaXR5R3JvdXAgPSBuZXcgZWMyLlNlY3VyaXR5R3JvdXAodGhpcywgJ1ByZXJlcURCU2VjdXJpdHlHcm91cCcsIHtcbiAgICAgIHZwYyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnU2VjdXJpdHkgZ3JvdXAgZm9yIFBSRVJFUSBSRFMgaW5zdGFuY2UnLFxuICAgICAgYWxsb3dBbGxPdXRib3VuZDogdHJ1ZSxcbiAgICB9KTtcblxuICAgIC8vIEFsbG93IFBvc3RncmVTUUwgYWNjZXNzIGZyb20gTGFtYmRhIChhbGwgZW52aXJvbm1lbnRzKVxuICAgIGRiU2VjdXJpdHlHcm91cC5hZGRJbmdyZXNzUnVsZShcbiAgICAgIGxhbWJkYVNnLFxuICAgICAgZWMyLlBvcnQudGNwKDU0MzIpLFxuICAgICAgJ0FsbG93IFBvc3RncmVTUUwgYWNjZXNzIGZyb20gTGFtYmRhJ1xuICAgICk7XG5cbiAgICAvLyBEZXYgb25seTogQWxsb3cgZGlyZWN0IGFjY2VzcyBmcm9tIGRldmVsb3BlciBJUFxuICAgIGlmICghaXNQcm9kKSB7XG4gICAgICBkYlNlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoXG4gICAgICAgIGVjMi5QZWVyLmlwdjQoZGV2SVApLFxuICAgICAgICBlYzIuUG9ydC50Y3AoNTQzMiksXG4gICAgICAgICdBbGxvdyBQb3N0Z3JlU1FMIGFjY2VzcyBmcm9tIGRldmVsb3BlciBJUCAoZGV2IG9ubHkpJ1xuICAgICAgKTtcbiAgICB9XG5cbiAgICAvLyBFbnZpcm9ubWVudC1hd2FyZSBSRFMgY29uZmlndXJhdGlvblxuICAgIGNvbnN0IGRhdGFiYXNlID0gbmV3IHJkcy5EYXRhYmFzZUluc3RhbmNlKHRoaXMsICdQcmVyZXFEYXRhYmFzZScsIHtcbiAgICAgIGVuZ2luZTogcmRzLkRhdGFiYXNlSW5zdGFuY2VFbmdpbmUucG9zdGdyZXMoe1xuICAgICAgICB2ZXJzaW9uOiByZHMuUG9zdGdyZXNFbmdpbmVWZXJzaW9uLlZFUl8xN181LFxuICAgICAgfSksXG4gICAgICBpbnN0YW5jZVR5cGU6IGVjMi5JbnN0YW5jZVR5cGUub2YoZWMyLkluc3RhbmNlQ2xhc3MuVDMsIGVjMi5JbnN0YW5jZVNpemUuTUlDUk8pLFxuICAgICAgdnBjLFxuICAgICAgdnBjU3VibmV0czoge1xuICAgICAgICAvLyBEZXY6IHB1YmxpYyBzdWJuZXRzIGZvciBkaXJlY3QgYWNjZXNzLCBQcm9kOiBwcml2YXRlIGlzb2xhdGVkXG4gICAgICAgIHN1Ym5ldFR5cGU6IGlzUHJvZCA/IGVjMi5TdWJuZXRUeXBlLlBSSVZBVEVfSVNPTEFURUQgOiBlYzIuU3VibmV0VHlwZS5QVUJMSUMsXG4gICAgICB9LFxuICAgICAgc2VjdXJpdHlHcm91cHM6IFtkYlNlY3VyaXR5R3JvdXBdLFxuICAgICAgZGF0YWJhc2VOYW1lOiAncHJlcmVxJyxcbiAgICAgIGNyZWRlbnRpYWxzOiByZHMuQ3JlZGVudGlhbHMuZnJvbUdlbmVyYXRlZFNlY3JldCgncHJlcmVxX2FkbWluJyksXG4gICAgICAvLyBEZXY6IHB1YmxpY2x5IGFjY2Vzc2libGUgZm9yIGxvY2FsIHRvb2xzLCBQcm9kOiBwcml2YXRlXG4gICAgICBwdWJsaWNseUFjY2Vzc2libGU6ICFpc1Byb2QsXG4gICAgICBiYWNrdXBSZXRlbnRpb246IGNkay5EdXJhdGlvbi5kYXlzKDcpLFxuICAgICAgLy8gUHJvZDogZW5hYmxlIGRlbGV0aW9uIHByb3RlY3Rpb24sIERldjogYWxsb3cgZWFzeSBjbGVhbnVwXG4gICAgICBkZWxldGlvblByb3RlY3Rpb246IGlzUHJvZCxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGlzUHJvZCA/IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTiA6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgfSk7XG5cbiAgICAvLyBBZGQgYXV0b21hdGljIHNlY3JldCByb3RhdGlvbiBmb3IgZGF0YWJhc2VcbiAgICBkYXRhYmFzZS5hZGRSb3RhdGlvblNpbmdsZVVzZXIoKTtcblxuICAgIC8vIFJEUyBQcm94eSBmb3IgY29ubmVjdGlvbiBwb29saW5nIGFuZCBlbmhhbmNlZCBzZWN1cml0eVxuICAgIGNvbnN0IGRiUHJveHkgPSBuZXcgcmRzLkRhdGFiYXNlUHJveHkodGhpcywgJ1ByZXJlcURhdGFiYXNlUHJveHknLCB7XG4gICAgICBwcm94eVRhcmdldDogcmRzLlByb3h5VGFyZ2V0LmZyb21JbnN0YW5jZShkYXRhYmFzZSksXG4gICAgICBzZWNyZXRzOiBbZGF0YWJhc2Uuc2VjcmV0IV0sXG4gICAgICB2cGMsXG4gICAgICB2cGNTdWJuZXRzOiB7XG4gICAgICAgIHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBSSVZBVEVfSVNPTEFURUQsXG4gICAgICB9LFxuICAgICAgc2VjdXJpdHlHcm91cHM6IFtkYlNlY3VyaXR5R3JvdXBdLFxuICAgICAgcmVxdWlyZVRMUzogdHJ1ZSxcbiAgICB9KTtcblxuICAgIC8vIE9wdGlvbmFsOiBTU00gQmFzdGlvbiBmb3IgcHJvZCBkZWJ1Z2dpbmcgKHQzLm5hbm8pXG4gICAgbGV0IGJhc3Rpb25JbnN0YW5jZTogZWMyLkluc3RhbmNlIHwgdW5kZWZpbmVkO1xuICAgIGlmIChpc1Byb2QpIHtcbiAgICAgIC8vIEJhc3Rpb24gc2VjdXJpdHkgZ3JvdXBcbiAgICAgIGNvbnN0IGJhc3Rpb25TZyA9IG5ldyBlYzIuU2VjdXJpdHlHcm91cCh0aGlzLCAnUHJlcmVxQmFzdGlvblNHJywge1xuICAgICAgICB2cGMsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnU2VjdXJpdHkgZ3JvdXAgZm9yIFBSRVJFUSBTU00gYmFzdGlvbicsXG4gICAgICAgIGFsbG93QWxsT3V0Ym91bmQ6IHRydWUsXG4gICAgICB9KTtcblxuICAgICAgLy8gQmFzdGlvbiBpbnN0YW5jZSBmb3IgcG9ydCBmb3J3YXJkaW5nIGluIHByb2RcbiAgICAgIGJhc3Rpb25JbnN0YW5jZSA9IG5ldyBlYzIuSW5zdGFuY2UodGhpcywgJ1ByZXJlcUJhc3Rpb24nLCB7XG4gICAgICAgIGluc3RhbmNlVHlwZTogZWMyLkluc3RhbmNlVHlwZS5vZihlYzIuSW5zdGFuY2VDbGFzcy5UMywgZWMyLkluc3RhbmNlU2l6ZS5OQU5PKSxcbiAgICAgICAgbWFjaGluZUltYWdlOiBlYzIuTWFjaGluZUltYWdlLmxhdGVzdEFtYXpvbkxpbnV4MjAyMygpLFxuICAgICAgICB2cGMsXG4gICAgICAgIHZwY1N1Ym5ldHM6IHtcbiAgICAgICAgICBzdWJuZXRUeXBlOiBlYzIuU3VibmV0VHlwZS5QUklWQVRFX0lTT0xBVEVELFxuICAgICAgICB9LFxuICAgICAgICBzZWN1cml0eUdyb3VwOiBiYXN0aW9uU2csXG4gICAgICAgIHJvbGU6IG5ldyBpYW0uUm9sZSh0aGlzLCAnUHJlcmVxQmFzdGlvblJvbGUnLCB7XG4gICAgICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2VjMi5hbWF6b25hd3MuY29tJyksXG4gICAgICAgICAgbWFuYWdlZFBvbGljaWVzOiBbXG4gICAgICAgICAgICBpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoJ0FtYXpvblNTTU1hbmFnZWRJbnN0YW5jZUNvcmUnKSxcbiAgICAgICAgICBdLFxuICAgICAgICB9KSxcbiAgICAgICAgdXNlckRhdGE6IGVjMi5Vc2VyRGF0YS5mb3JMaW51eCgpLFxuICAgICAgfSk7XG5cbiAgICAgIC8vIEFsbG93IGJhc3Rpb24gdG8gYWNjZXNzIGRhdGFiYXNlXG4gICAgICBkYlNlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoXG4gICAgICAgIGJhc3Rpb25TZyxcbiAgICAgICAgZWMyLlBvcnQudGNwKDU0MzIpLFxuICAgICAgICAnQWxsb3cgUG9zdGdyZVNRTCBhY2Nlc3MgZnJvbSBiYXN0aW9uIChwcm9kIG9ubHkpJ1xuICAgICAgKTtcbiAgICB9XG5cbiAgICAvLyBKV1QgU2VjcmV0IGluIFNlY3JldHMgTWFuYWdlclxuICAgIGNvbnN0IGp3dFNlY3JldCA9IG5ldyBzZWNyZXRzbWFuYWdlci5TZWNyZXQodGhpcywgJ0p3dFNlY3JldCcsIHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnSldUIHNpZ25pbmcgc2VjcmV0IGZvciBQUkVSRVEgQVBJJyxcbiAgICAgIGdlbmVyYXRlU2VjcmV0U3RyaW5nOiB7XG4gICAgICAgIGV4Y2x1ZGVQdW5jdHVhdGlvbjogdHJ1ZSxcbiAgICAgICAgcGFzc3dvcmRMZW5ndGg6IDMyLFxuICAgICAgfSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGlzUHJvZCA/IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTiA6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgfSk7XG5cbiAgICAvLyBDb2duaXRvIFVzZXIgUG9vbFxuICAgIGNvbnN0IHVzZXJQb29sID0gbmV3IGNvZ25pdG8uVXNlclBvb2wodGhpcywgJ1ByZXJlcVVzZXJQb29sJywge1xuICAgICAgdXNlclBvb2xOYW1lOiAncHJlcmVxLXVzZXJzJyxcbiAgICAgIHNlbGZTaWduVXBFbmFibGVkOiB0cnVlLFxuICAgICAgc2lnbkluQWxpYXNlczoge1xuICAgICAgICBlbWFpbDogdHJ1ZSxcbiAgICAgIH0sXG4gICAgICBzdGFuZGFyZEF0dHJpYnV0ZXM6IHtcbiAgICAgICAgZW1haWw6IHtcbiAgICAgICAgICByZXF1aXJlZDogdHJ1ZSxcbiAgICAgICAgICBtdXRhYmxlOiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgICBmdWxsbmFtZToge1xuICAgICAgICAgIHJlcXVpcmVkOiBmYWxzZSxcbiAgICAgICAgICBtdXRhYmxlOiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIHBhc3N3b3JkUG9saWN5OiB7XG4gICAgICAgIG1pbkxlbmd0aDogOCxcbiAgICAgICAgcmVxdWlyZUxvd2VyY2FzZTogdHJ1ZSxcbiAgICAgICAgcmVxdWlyZVVwcGVyY2FzZTogdHJ1ZSxcbiAgICAgICAgcmVxdWlyZURpZ2l0czogdHJ1ZSxcbiAgICAgICAgcmVxdWlyZVN5bWJvbHM6IHRydWUsXG4gICAgICB9LFxuICAgICAgYWNjb3VudFJlY292ZXJ5OiBjb2duaXRvLkFjY291bnRSZWNvdmVyeS5FTUFJTF9PTkxZLFxuICAgIH0pO1xuXG4gICAgLy8gQ29nbml0byBVc2VyIFBvb2wgQ2xpZW50XG4gICAgY29uc3QgdXNlclBvb2xDbGllbnQgPSBuZXcgY29nbml0by5Vc2VyUG9vbENsaWVudCh0aGlzLCAnUHJlcmVxVXNlclBvb2xDbGllbnQnLCB7XG4gICAgICB1c2VyUG9vbCxcbiAgICAgIHVzZXJQb29sQ2xpZW50TmFtZTogJ3ByZXJlcS1jbGllbnQnLFxuICAgICAgZ2VuZXJhdGVTZWNyZXQ6IGZhbHNlLFxuICAgICAgYXV0aEZsb3dzOiB7XG4gICAgICAgIGFkbWluVXNlclBhc3N3b3JkOiB0cnVlLFxuICAgICAgICB1c2VyUGFzc3dvcmQ6IHRydWUsXG4gICAgICAgIHVzZXJTcnA6IHRydWUsXG4gICAgICB9LFxuICAgICAgb0F1dGg6IHtcbiAgICAgICAgZmxvd3M6IHtcbiAgICAgICAgICBhdXRob3JpemF0aW9uQ29kZUdyYW50OiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgICBzY29wZXM6IFtjb2duaXRvLk9BdXRoU2NvcGUuRU1BSUwsIGNvZ25pdG8uT0F1dGhTY29wZS5PUEVOSUQsIGNvZ25pdG8uT0F1dGhTY29wZS5QUk9GSUxFXSxcbiAgICAgICAgY2FsbGJhY2tVcmxzOiBbJ2h0dHA6Ly9sb2NhbGhvc3Q6NTE3My9jYWxsYmFjaycsICdodHRwczovL3lvdXItZG9tYWluLmNvbS9jYWxsYmFjayddLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIExhbWJkYSBGdW5jdGlvbiB1c2luZyBOb2RlanNGdW5jdGlvbiB3aXRoIHRyZWUtc2hha2luZ1xuICAgIGNvbnN0IGFwaUxhbWJkYSA9IG5ldyBOb2RlanNGdW5jdGlvbih0aGlzLCAnUHJlcmVxQVBJTGFtYmRhJywge1xuICAgICAgZW50cnk6ICcuLi9iYWNrZW5kL3NyYy9tYWluLnRzJyxcbiAgICAgIGhhbmRsZXI6ICdoYW5kbGVyJyxcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xOF9YLFxuICAgICAgYnVuZGxpbmc6IHtcbiAgICAgICAgZXh0ZXJuYWxNb2R1bGVzOiBbJ0BuZXN0anMvY29yZScsICdAbmVzdGpzL2NvbW1vbicsICdwZyddLFxuICAgICAgICBtaW5pZnk6IHRydWUsXG4gICAgICAgIHNvdXJjZU1hcDogdHJ1ZSxcbiAgICAgIH0sXG4gICAgICB2cGMsXG4gICAgICBzZWN1cml0eUdyb3VwczogW2xhbWJkYVNnXSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIC8vIFVzZSBSRFMgUHJveHkgZW5kcG9pbnQgZm9yIGJldHRlciBjb25uZWN0aW9uIG1hbmFnZW1lbnRcbiAgICAgICAgREJfU0VDUkVUX0FSTjogZGF0YWJhc2Uuc2VjcmV0IS5zZWNyZXRBcm4sXG4gICAgICAgIERCX1BST1hZX0VORFBPSU5UOiBkYlByb3h5LmVuZHBvaW50LFxuICAgICAgICBKV1RfU0VDUkVUX0FSTjogand0U2VjcmV0LnNlY3JldEFybixcbiAgICAgICAgQ09HTklUT19VU0VSX1BPT0xfSUQ6IHVzZXJQb29sLnVzZXJQb29sSWQsXG4gICAgICAgIENPR05JVE9fQ0xJRU5UX0lEOiB1c2VyUG9vbENsaWVudC51c2VyUG9vbENsaWVudElkLFxuICAgICAgfSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgIG1lbW9yeVNpemU6IDUxMixcbiAgICB9KTtcblxuICAgIC8vIExhbWJkYSBsb2cgZ3JvdXAgd2l0aCBzeW1tZXRyaWMgcmV0ZW50aW9uXG4gICAgbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ1ByZXJlcUFQSUxhbWJkYUxvZ3MnLCB7XG4gICAgICBsb2dHcm91cE5hbWU6IGAvYXdzL2xhbWJkYS8ke2FwaUxhbWJkYS5mdW5jdGlvbk5hbWV9YCxcbiAgICAgIHJldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9NT05USCxcbiAgICB9KTtcblxuICAgIC8vIEdyYW50IExhbWJkYSBhY2Nlc3MgdG8gUkRTIFByb3h5IGFuZCBTZWNyZXRzIE1hbmFnZXJcbiAgICBkYlByb3h5LmdyYW50Q29ubmVjdChhcGlMYW1iZGEsICdwcmVyZXFfYWRtaW4nKTtcbiAgICBkYXRhYmFzZS5zZWNyZXQ/LmdyYW50UmVhZChhcGlMYW1iZGEpO1xuICAgIGp3dFNlY3JldC5ncmFudFJlYWQoYXBpTGFtYmRhKTtcblxuICAgIC8vIEFjY2Vzcy1sb2cgZ3JvdXBcbiAgICBjb25zdCBhcGlMb2dzID0gbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ1ByZXJlcUFwaUxvZ3MnLCB7XG4gICAgICByZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfTU9OVEgsXG4gICAgfSk7XG5cbiAgICAvLyBBUEkgR2F0ZXdheSB3aXRoIHRocm90dGxpbmcgcHJvdGVjdGlvblxuICAgIGNvbnN0IGFwaSA9IG5ldyBhcGlnYXRld2F5LlJlc3RBcGkodGhpcywgJ1ByZXJlcUFQSScsIHtcbiAgICAgIHJlc3RBcGlOYW1lOiAnUFJFUkVRIEFQSScsXG4gICAgICBkZXNjcmlwdGlvbjogJ1BSRVJFUSBQcm9qZWN0IE1hbmFnZW1lbnQgQVBJJyxcbiAgICAgIGRlZmF1bHRDb3JzUHJlZmxpZ2h0T3B0aW9uczoge1xuICAgICAgICBhbGxvd09yaWdpbnM6IGFwaWdhdGV3YXkuQ29ycy5BTExfT1JJR0lOUyxcbiAgICAgICAgYWxsb3dNZXRob2RzOiBhcGlnYXRld2F5LkNvcnMuQUxMX01FVEhPRFMsXG4gICAgICAgIGFsbG93SGVhZGVyczogWydDb250ZW50LVR5cGUnLCAnQXV0aG9yaXphdGlvbiddLFxuICAgICAgfSxcbiAgICAgIGRlcGxveU9wdGlvbnM6IHtcbiAgICAgICAgc3RhZ2VOYW1lOiBpc1Byb2QgPyAncHJvZCcgOiAnZGV2JyxcbiAgICAgICAgdGhyb3R0bGluZ1JhdGVMaW1pdDogNTAsXG4gICAgICAgIHRocm90dGxpbmdCdXJzdExpbWl0OiAyMCxcbiAgICAgICAgbWV0cmljc0VuYWJsZWQ6IHRydWUsXG4gICAgICAgIGxvZ2dpbmdMZXZlbDogYXBpZ2F0ZXdheS5NZXRob2RMb2dnaW5nTGV2ZWwuSU5GTyxcbiAgICAgICAgYWNjZXNzTG9nRGVzdGluYXRpb246IG5ldyBhcGlnYXRld2F5LkxvZ0dyb3VwTG9nRGVzdGluYXRpb24oYXBpTG9ncyksXG4gICAgICAgIGFjY2Vzc0xvZ0Zvcm1hdDogYXBpZ2F0ZXdheS5BY2Nlc3NMb2dGb3JtYXQuanNvbldpdGhTdGFuZGFyZEZpZWxkcyh7XG4gICAgICAgICAgY2FsbGVyOiB0cnVlLFxuICAgICAgICAgIGh0dHBNZXRob2Q6IHRydWUsXG4gICAgICAgICAgaXA6IHRydWUsXG4gICAgICAgICAgcHJvdG9jb2w6IHRydWUsXG4gICAgICAgICAgcmVxdWVzdFRpbWU6IHRydWUsXG4gICAgICAgICAgcmVzb3VyY2VQYXRoOiB0cnVlLFxuICAgICAgICAgIHJlc3BvbnNlTGVuZ3RoOiB0cnVlLFxuICAgICAgICAgIHN0YXR1czogdHJ1ZSxcbiAgICAgICAgICB1c2VyOiB0cnVlLFxuICAgICAgICB9KSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBBUEkgR2F0ZXdheSBJbnRlZ3JhdGlvblxuICAgIGNvbnN0IGludGVncmF0aW9uID0gbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oYXBpTGFtYmRhKTtcblxuICAgIC8vIEFQSSBSb3V0ZXNcbiAgICBhcGkucm9vdC5hZGRQcm94eSh7XG4gICAgICBkZWZhdWx0SW50ZWdyYXRpb246IGludGVncmF0aW9uLFxuICAgICAgYW55TWV0aG9kOiB0cnVlLFxuICAgIH0pO1xuXG4gICAgLy8gV0FGdjIgV2ViQUNMIGZvciBBUEkgcHJvdGVjdGlvblxuICAgIGNvbnN0IHdlYkFjbCA9IG5ldyB3YWZ2Mi5DZm5XZWJBQ0wodGhpcywgJ0FwaVdhZicsIHtcbiAgICAgIGRlZmF1bHRBY3Rpb246IHsgYWxsb3c6IHt9IH0sXG4gICAgICBzY29wZTogJ1JFR0lPTkFMJyxcbiAgICAgIHZpc2liaWxpdHlDb25maWc6IHtcbiAgICAgICAgY2xvdWRXYXRjaE1ldHJpY3NFbmFibGVkOiB0cnVlLFxuICAgICAgICBtZXRyaWNOYW1lOiAnUHJlcmVxQXBpV2FmJyxcbiAgICAgICAgc2FtcGxlZFJlcXVlc3RzRW5hYmxlZDogdHJ1ZSxcbiAgICAgIH0sXG4gICAgICBuYW1lOiAnUHJlcmVxQXBpV2FmJyxcbiAgICAgIHJ1bGVzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBuYW1lOiAnQVdTLUFXU01hbmFnZWRDb21tb25SdWxlU2V0JyxcbiAgICAgICAgICBwcmlvcml0eTogMCxcbiAgICAgICAgICBzdGF0ZW1lbnQ6IHsgbWFuYWdlZFJ1bGVHcm91cFN0YXRlbWVudDoge1xuICAgICAgICAgICAgbmFtZTogJ0FXU01hbmFnZWRSdWxlc0NvbW1vblJ1bGVTZXQnLFxuICAgICAgICAgICAgdmVuZG9yTmFtZTogJ0FXUycsXG4gICAgICAgICAgfX0sXG4gICAgICAgICAgb3ZlcnJpZGVBY3Rpb246IHsgbm9uZToge30gfSxcbiAgICAgICAgICB2aXNpYmlsaXR5Q29uZmlnOiB7XG4gICAgICAgICAgICBjbG91ZFdhdGNoTWV0cmljc0VuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgICBtZXRyaWNOYW1lOiAnQ29tbW9uUnVsZXMnLFxuICAgICAgICAgICAgc2FtcGxlZFJlcXVlc3RzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgbmFtZTogJ0lwUmF0ZUxpbWl0JyxcbiAgICAgICAgICBwcmlvcml0eTogMSxcbiAgICAgICAgICBzdGF0ZW1lbnQ6IHtcbiAgICAgICAgICAgIHJhdGVCYXNlZFN0YXRlbWVudDoge1xuICAgICAgICAgICAgICBsaW1pdDogMjAwMCwgICAgICAgICAvLyAyIDAwMCByZXF1ZXN0cyBpbiA1IG1pbiBwZXIgSVBcbiAgICAgICAgICAgICAgYWdncmVnYXRlS2V5VHlwZTogJ0lQJyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgICBhY3Rpb246IHsgYmxvY2s6IHt9IH0sXG4gICAgICAgICAgdmlzaWJpbGl0eUNvbmZpZzoge1xuICAgICAgICAgICAgY2xvdWRXYXRjaE1ldHJpY3NFbmFibGVkOiB0cnVlLFxuICAgICAgICAgICAgbWV0cmljTmFtZTogJ0lwUmF0ZUxpbWl0JyxcbiAgICAgICAgICAgIHNhbXBsZWRSZXF1ZXN0c0VuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICAvLyBBc3NvY2lhdGUgV0FGIHdpdGggQVBJIEdhdGV3YXlcbiAgICBuZXcgd2FmdjIuQ2ZuV2ViQUNMQXNzb2NpYXRpb24odGhpcywgJ0FwaVdhZkFzc29jJywge1xuICAgICAgd2ViQWNsQXJuOiB3ZWJBY2wuYXR0ckFybixcbiAgICAgIHJlc291cmNlQXJuOiBhcGkuZGVwbG95bWVudFN0YWdlLnN0YWdlQXJuLFxuICAgIH0pO1xuXG4gICAgLy8gUHJpdmF0ZSBTMyBCdWNrZXQgZm9yIEZyb250ZW5kXG4gICAgY29uc3QgZnJvbnRlbmRCdWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsICdQcmVyZXFGcm9udGVuZEJ1Y2tldCcsIHtcbiAgICAgIGJ1Y2tldE5hbWU6IGBwcmVyZXEtZnJvbnRlbmQtJHt0aGlzLmFjY291bnR9LSR7dGhpcy5yZWdpb259YCxcbiAgICAgIHB1YmxpY1JlYWRBY2Nlc3M6IGZhbHNlLFxuICAgICAgYmxvY2tQdWJsaWNBY2Nlc3M6IHMzLkJsb2NrUHVibGljQWNjZXNzLkJMT0NLX0FMTCxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGlzUHJvZCA/IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTiA6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICBhdXRvRGVsZXRlT2JqZWN0czogIWlzUHJvZCxcbiAgICB9KTtcblxuICAgIC8vIENsb3VkRnJvbnQgT3JpZ2luIEFjY2VzcyBJZGVudGl0eVxuICAgIGNvbnN0IG9yaWdpbkFjY2Vzc0lkZW50aXR5ID0gbmV3IGNsb3VkZnJvbnQuT3JpZ2luQWNjZXNzSWRlbnRpdHkodGhpcywgJ1ByZXJlcU9BSScsIHtcbiAgICAgIGNvbW1lbnQ6ICdPQUkgZm9yIFBSRVJFUSBmcm9udGVuZCBidWNrZXQnLFxuICAgIH0pO1xuXG4gICAgLy8gR3JhbnQgQ2xvdWRGcm9udCByZWFkIGFjY2VzcyB0byB0aGUgYnVja2V0XG4gICAgZnJvbnRlbmRCdWNrZXQuZ3JhbnRSZWFkKG9yaWdpbkFjY2Vzc0lkZW50aXR5KTtcblxuICAgIC8vIENsb3VkRnJvbnQgRGlzdHJpYnV0aW9uIHdpdGggU1BBLW9wdGltaXplZCBjYWNoaW5nXG4gICAgY29uc3QgZGlzdHJpYnV0aW9uID0gbmV3IGNsb3VkZnJvbnQuRGlzdHJpYnV0aW9uKHRoaXMsICdQcmVyZXFEaXN0cmlidXRpb24nLCB7XG4gICAgICBkZWZhdWx0QmVoYXZpb3I6IHtcbiAgICAgICAgb3JpZ2luOiBuZXcgb3JpZ2lucy5TM09yaWdpbihmcm9udGVuZEJ1Y2tldCwge1xuICAgICAgICAgIG9yaWdpbkFjY2Vzc0lkZW50aXR5LFxuICAgICAgICB9KSxcbiAgICAgICAgdmlld2VyUHJvdG9jb2xQb2xpY3k6IGNsb3VkZnJvbnQuVmlld2VyUHJvdG9jb2xQb2xpY3kuUkVESVJFQ1RfVE9fSFRUUFMsXG4gICAgICAgIGFsbG93ZWRNZXRob2RzOiBjbG91ZGZyb250LkFsbG93ZWRNZXRob2RzLkFMTE9XX0FMTCxcbiAgICAgICAgY2FjaGVkTWV0aG9kczogY2xvdWRmcm9udC5DYWNoZWRNZXRob2RzLkNBQ0hFX0dFVF9IRUFEX09QVElPTlMsXG4gICAgICAgIGNhY2hlUG9saWN5OiBjbG91ZGZyb250LkNhY2hlUG9saWN5LkNBQ0hJTkdfRElTQUJMRUQsXG4gICAgICB9LFxuICAgICAgZGVmYXVsdFJvb3RPYmplY3Q6ICdpbmRleC5odG1sJyxcbiAgICAgIGVycm9yUmVzcG9uc2VzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBodHRwU3RhdHVzOiA0MDQsXG4gICAgICAgICAgcmVzcG9uc2VIdHRwU3RhdHVzOiAyMDAsXG4gICAgICAgICAgcmVzcG9uc2VQYWdlUGF0aDogJy9pbmRleC5odG1sJyxcbiAgICAgICAgICB0dGw6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDApLCAvLyBObyBjYWNoaW5nIGZvciBTUEEgcm91dGVzXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBodHRwU3RhdHVzOiA0MDMsXG4gICAgICAgICAgcmVzcG9uc2VIdHRwU3RhdHVzOiAyMDAsXG4gICAgICAgICAgcmVzcG9uc2VQYWdlUGF0aDogJy9pbmRleC5odG1sJyxcbiAgICAgICAgICB0dGw6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDApLCAvLyBObyBjYWNoaW5nIGZvciBTUEEgcm91dGVzXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgLy8gU3RvcmUgc2Vuc2l0aXZlIHZhbHVlcyBpbiBTU00gUGFyYW1ldGVycyBpbnN0ZWFkIG9mIG91dHB1dHNcbiAgICBuZXcgc3NtLlN0cmluZ1BhcmFtZXRlcih0aGlzLCAnRGF0YWJhc2VFbmRwb2ludFBhcmFtJywge1xuICAgICAgcGFyYW1ldGVyTmFtZTogJy9wcmVyZXEvZGF0YWJhc2UvZW5kcG9pbnQnLFxuICAgICAgc3RyaW5nVmFsdWU6IGRhdGFiYXNlLmluc3RhbmNlRW5kcG9pbnQuaG9zdG5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ1JEUyBEYXRhYmFzZSBFbmRwb2ludCcsXG4gICAgfSk7XG5cbiAgICBuZXcgc3NtLlN0cmluZ1BhcmFtZXRlcih0aGlzLCAnRGF0YWJhc2VQcm94eUVuZHBvaW50UGFyYW0nLCB7XG4gICAgICBwYXJhbWV0ZXJOYW1lOiAnL3ByZXJlcS9kYXRhYmFzZS9wcm94eS1lbmRwb2ludCcsXG4gICAgICBzdHJpbmdWYWx1ZTogZGJQcm94eS5lbmRwb2ludCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnUkRTIFByb3h5IEVuZHBvaW50JyxcbiAgICB9KTtcblxuICAgIG5ldyBzc20uU3RyaW5nUGFyYW1ldGVyKHRoaXMsICdEYXRhYmFzZVNlY3JldEFyblBhcmFtJywge1xuICAgICAgcGFyYW1ldGVyTmFtZTogJy9wcmVyZXEvZGF0YWJhc2Uvc2VjcmV0LWFybicsXG4gICAgICBzdHJpbmdWYWx1ZTogZGF0YWJhc2Uuc2VjcmV0Py5zZWNyZXRBcm4gfHwgJycsXG4gICAgICBkZXNjcmlwdGlvbjogJ1JEUyBEYXRhYmFzZSBTZWNyZXQgQVJOJyxcbiAgICB9KTtcblxuICAgIG5ldyBzc20uU3RyaW5nUGFyYW1ldGVyKHRoaXMsICdKd3RTZWNyZXRBcm5QYXJhbScsIHtcbiAgICAgIHBhcmFtZXRlck5hbWU6ICcvcHJlcmVxL2p3dC9zZWNyZXQtYXJuJyxcbiAgICAgIHN0cmluZ1ZhbHVlOiBqd3RTZWNyZXQuc2VjcmV0QXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdKV1QgU2VjcmV0IEFSTicsXG4gICAgfSk7XG5cbiAgICAvLyBFbnZpcm9ubWVudC1zcGVjaWZpYyBvdXRwdXRzXG4gICAgaWYgKGJhc3Rpb25JbnN0YW5jZSkge1xuICAgICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0Jhc3Rpb25JbnN0YW5jZUlkJywge1xuICAgICAgICB2YWx1ZTogYmFzdGlvbkluc3RhbmNlLmluc3RhbmNlSWQsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnQmFzdGlvbiBpbnN0YW5jZSBJRCBmb3IgU1NNIHBvcnQgZm9yd2FyZGluZyAocHJvZCBvbmx5KScsXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnRGF0YWJhc2VFbnZpcm9ubWVudCcsIHtcbiAgICAgIHZhbHVlOiBpc1Byb2QgPyAncHJvZHVjdGlvbiAocHJpdmF0ZSknIDogJ2RldmVsb3BtZW50IChwdWJsaWMpJyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnRGF0YWJhc2UgZW52aXJvbm1lbnQgY29uZmlndXJhdGlvbicsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnRGF0YWJhc2VFbmRwb2ludCcsIHtcbiAgICAgIHZhbHVlOiBkYXRhYmFzZS5pbnN0YW5jZUVuZHBvaW50Lmhvc3RuYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdEaXJlY3QgZGF0YWJhc2UgZW5kcG9pbnQnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0RhdGFiYXNlUHJveHlFbmRwb2ludCcsIHtcbiAgICAgIHZhbHVlOiBkYlByb3h5LmVuZHBvaW50LFxuICAgICAgZGVzY3JpcHRpb246ICdSRFMgUHJveHkgZW5kcG9pbnQgKHJlY29tbWVuZGVkIGZvciBhcHBsaWNhdGlvbnMpJyxcbiAgICB9KTtcblxuICAgIC8vIEtlZXAgZXhpc3RpbmcgcHVibGljLWZhY2luZyBvdXRwdXRzXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1VzZXJQb29sSWQnLCB7XG4gICAgICB2YWx1ZTogdXNlclBvb2wudXNlclBvb2xJZCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ29nbml0byBVc2VyIFBvb2wgSUQnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1VzZXJQb29sQ2xpZW50SWQnLCB7XG4gICAgICB2YWx1ZTogdXNlclBvb2xDbGllbnQudXNlclBvb2xDbGllbnRJZCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ29nbml0byBVc2VyIFBvb2wgQ2xpZW50IElEJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdBcGlVcmwnLCB7XG4gICAgICB2YWx1ZTogYXBpLnVybCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQVBJIEdhdGV3YXkgVVJMJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdGcm9udGVuZFVybCcsIHtcbiAgICAgIHZhbHVlOiBgaHR0cHM6Ly8ke2Rpc3RyaWJ1dGlvbi5kaXN0cmlidXRpb25Eb21haW5OYW1lfWAsXG4gICAgICBkZXNjcmlwdGlvbjogJ0Nsb3VkRnJvbnQgRGlzdHJpYnV0aW9uIFVSTCcsXG4gICAgfSk7XG4gIH1cbn0gIl19