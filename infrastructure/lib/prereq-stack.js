"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrereqStack = void 0;
const cdk = require("aws-cdk-lib");
const rds = require("aws-cdk-lib/aws-rds");
const ec2 = require("aws-cdk-lib/aws-ec2");
const lambda = require("aws-cdk-lib/aws-lambda");
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
const path = require("path");
class PrereqStack extends cdk.Stack {
    constructor(scope, id, props) {
        var _a, _b, _c;
        super(scope, id, props);
        // Environment context flags
        const env = (_a = this.node.tryGetContext('env')) !== null && _a !== void 0 ? _a : 'dev';
        const isProd = env === 'prod';
        const isStage = env === 'stage';
        // Developer IP for dev environment database access
        const devIP = this.node.tryGetContext('devIP') || '70.30.4.207/32';
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
        dbSecurityGroup.addIngressRule(lambdaSg, ec2.Port.tcp(5432), 'Allow PostgreSQL access from Lambda');
        // Dev only: Allow direct access from developer IP
        if (env === 'dev') {
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
        let dbProxy;
        let dbEndpoint;
        if (env !== 'dev') {
            // Create environment-specific security groups for proxy
            let proxySecurityGroups;
            if (isStage) {
                // Stage: Create public security group for proxy
                const proxyPublicSg = new ec2.SecurityGroup(this, 'PrereqProxyPublicSG', {
                    vpc,
                    description: 'Public access security group for RDS Proxy (stage only)',
                    allowAllOutbound: true,
                });
                // Allow access to proxy in stage from your IP (change to anyIpv4() for demo clients)
                proxyPublicSg.addIngressRule(ec2.Peer.ipv4(devIP), ec2.Port.tcp(5432), 'Allow access to RDS Proxy from dev IP (stage only)');
                // Stage: Use both DB security group and public security group
                proxySecurityGroups = [dbSecurityGroup, proxyPublicSg];
            }
            else {
                // Prod: Use only the private DB security group
                proxySecurityGroups = [dbSecurityGroup];
            }
            // Stage/Prod: Create RDS Proxy with appropriate security groups
            dbProxy = new rds.DatabaseProxy(this, 'PrereqDatabaseProxy', {
                proxyTarget: rds.ProxyTarget.fromInstance(database),
                secrets: [database.secret],
                vpc,
                vpcSubnets: {
                    subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
                },
                securityGroups: proxySecurityGroups,
                requireTLS: true,
            });
            dbEndpoint = dbProxy.endpoint;
        }
        else {
            // Dev: Direct database connection
            dbEndpoint = database.instanceEndpoint.hostname;
        }
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
        const currentThrottle = throttleConfig[env];
        // Lambda Function using regular Function (no Docker required)
        // When switching back to NodejsFunction, consider:
        // bundling: { externalModules: ['@nestjs/*', 'pg'] }
        const apiLambda = new lambda.Function(this, 'PrereqAPILambda', {
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'main.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
            vpc,
            securityGroups: [lambdaSg],
            environment: {
                DB_SECRET_ARN: database.secret.secretArn,
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
        }
        else {
            database.grantConnect(apiLambda);
        }
        (_b = database.secret) === null || _b === void 0 ? void 0 : _b.grantRead(apiLambda);
        jwtSecret.grantRead(apiLambda);
        // Access-log group
        const apiLogs = new logs.LogGroup(this, 'PrereqApiLogs', {
            retention: logs.RetentionDays.ONE_MONTH,
        });
        // API Gateway with environment-specific throttling
        const deployOptions = {
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
                                limit: 2000, // 2000 requests in 5 min per IP
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
                origin: origins.S3BucketOrigin.withOriginAccessIdentity(frontendBucket, {
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
            stringValue: ((_c = database.secret) === null || _c === void 0 ? void 0 : _c.secretArn) || '',
            description: `RDS Database Secret ARN (${env})`,
        });
        new ssm.StringParameter(this, 'JwtSecretArnParam', {
            parameterName: `/prereq/${env}/jwt/secret-arn`,
            stringValue: jwtSecret.secretArn,
            description: `JWT Secret ARN (${env})`,
        });
        new ssm.StringParameter(this, 'CognitoUserPoolIdParam', {
            parameterName: `/prereq/${env}/cognito/user-pool-id`,
            stringValue: userPool.userPoolId,
            description: `Cognito User Pool ID (${env})`,
        });
        new ssm.StringParameter(this, 'CognitoClientIdParam', {
            parameterName: `/prereq/${env}/cognito/client-id`,
            stringValue: userPoolClient.userPoolClientId,
            description: `Cognito User Pool Client ID (${env})`,
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
        }
        else {
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
exports.PrereqStack = PrereqStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJlcmVxLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsicHJlcmVxLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLG1DQUFtQztBQUNuQywyQ0FBMkM7QUFDM0MsMkNBQTJDO0FBQzNDLGlEQUFpRDtBQUNqRCx5REFBeUQ7QUFDekQsbURBQW1EO0FBQ25ELHlDQUF5QztBQUN6Qyx5REFBeUQ7QUFDekQsOERBQThEO0FBQzlELGlFQUFpRTtBQUNqRSwrQ0FBK0M7QUFDL0MsMkNBQTJDO0FBQzNDLDJDQUEyQztBQUMzQyw2Q0FBNkM7QUFFN0MsNkJBQTZCO0FBRTdCLE1BQWEsV0FBWSxTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQ3hDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBc0I7O1FBQzlELEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLDRCQUE0QjtRQUM1QixNQUFNLEdBQUcsR0FBRyxNQUFBLElBQUksQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxtQ0FBSSxLQUFLLENBQUM7UUFDcEQsTUFBTSxNQUFNLEdBQUcsR0FBRyxLQUFLLE1BQU0sQ0FBQztRQUM5QixNQUFNLE9BQU8sR0FBRyxHQUFHLEtBQUssT0FBTyxDQUFDO1FBRWhDLG1EQUFtRDtRQUNuRCxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxPQUFPLENBQUMsSUFBSSxnQkFBZ0IsQ0FBQztRQUVuRSx5Q0FBeUM7UUFDekMsTUFBTSxHQUFHLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxXQUFXLEVBQUU7WUFDekMsTUFBTSxFQUFFLENBQUM7WUFDVCxrRUFBa0U7WUFDbEUsV0FBVyxFQUFFLEdBQUcsS0FBSyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNsQyxtQkFBbUIsRUFBRTtn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QUFFO2dCQUMvQyxLQUFLLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxRQUFRO2dCQUMvQyxXQUFXLEVBQUUsb0JBQW9CO2FBQ2xDLENBQUMsQ0FBQztRQUNMLENBQUM7UUFFRCxtQkFBbUI7UUFDbkIsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxZQUFZLEVBQUU7WUFDcEMsS0FBSyxFQUFFLFFBQVEsQ0FBQyxVQUFVO1lBQzFCLFdBQVcsRUFBRSxzQkFBc0I7U0FDcEMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxrQkFBa0IsRUFBRTtZQUMxQyxLQUFLLEVBQUUsY0FBYyxDQUFDLGdCQUFnQjtZQUN0QyxXQUFXLEVBQUUsNkJBQTZCO1NBQzNDLENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsUUFBUSxFQUFFO1lBQ2hDLEtBQUssRUFBRSxHQUFHLENBQUMsR0FBRztZQUNkLFdBQVcsRUFBRSxpQkFBaUI7U0FDL0IsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxhQUFhLEVBQUU7WUFDckMsS0FBSyxFQUFFLFdBQVcsWUFBWSxDQUFDLHNCQUFzQixFQUFFO1lBQ3ZELFdBQVcsRUFBRSw2QkFBNkI7U0FDM0MsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBemhCRCxrQ0F5aEJDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCAqIGFzIHJkcyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtcmRzJztcbmltcG9ydCAqIGFzIGVjMiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWMyJztcbmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhJztcbmltcG9ydCAqIGFzIGFwaWdhdGV3YXkgZnJvbSAnYXdzLWNkay1saWIvYXdzLWFwaWdhdGV3YXknO1xuaW1wb3J0ICogYXMgY29nbml0byBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY29nbml0byc7XG5pbXBvcnQgKiBhcyBzMyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtczMnO1xuaW1wb3J0ICogYXMgY2xvdWRmcm9udCBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY2xvdWRmcm9udCc7XG5pbXBvcnQgKiBhcyBvcmlnaW5zIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jbG91ZGZyb250LW9yaWdpbnMnO1xuaW1wb3J0ICogYXMgc2VjcmV0c21hbmFnZXIgZnJvbSAnYXdzLWNkay1saWIvYXdzLXNlY3JldHNtYW5hZ2VyJztcbmltcG9ydCAqIGFzIHdhZnYyIGZyb20gJ2F3cy1jZGstbGliL2F3cy13YWZ2Mic7XG5pbXBvcnQgKiBhcyBzc20gZnJvbSAnYXdzLWNkay1saWIvYXdzLXNzbSc7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XG5pbXBvcnQgKiBhcyBsb2dzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sb2dzJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcblxuZXhwb3J0IGNsYXNzIFByZXJlcVN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM/OiBjZGsuU3RhY2tQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuXG4gICAgLy8gRW52aXJvbm1lbnQgY29udGV4dCBmbGFnc1xuICAgIGNvbnN0IGVudiA9IHRoaXMubm9kZS50cnlHZXRDb250ZXh0KCdlbnYnKSA/PyAnZGV2JztcbiAgICBjb25zdCBpc1Byb2QgPSBlbnYgPT09ICdwcm9kJztcbiAgICBjb25zdCBpc1N0YWdlID0gZW52ID09PSAnc3RhZ2UnO1xuICAgIFxuICAgIC8vIERldmVsb3BlciBJUCBmb3IgZGV2IGVudmlyb25tZW50IGRhdGFiYXNlIGFjY2Vzc1xuICAgIGNvbnN0IGRldklQID0gdGhpcy5ub2RlLnRyeUdldENvbnRleHQoJ2RldklQJykgfHwgJzcwLjMwLjQuMjA3LzMyJztcblxuICAgIC8vIFZQQyBjb25maWd1cmF0aW9uIGJhc2VkIG9uIGVudmlyb25tZW50XG4gICAgY29uc3QgdnBjID0gbmV3IGVjMi5WcGModGhpcywgJ1ByZXJlcVZQQycsIHtcbiAgICAgIG1heEF6czogMixcbiAgICAgIC8vIERldjogbm8gTkFUIChjb3N0IHNhdmluZ3MpLCBTdGFnZS9Qcm9kOiBOQVQgZm9yIG91dGJvdW5kIGFjY2Vzc1xuICAgICAgbmF0R2F0ZXdheXM6IGVudiA9PT0gJ2RldicgPyAwIDogMSxcbiAgICAgIHN1Ym5ldENvbmZpZ3VyYXRpb246IFtcbiAgICAgICAgeyBuYW1lOiAnUHVibGljJywgc3VibmV0VHlwZTogZWMyLlN1Ym5ldFR5cGUuUFVCTElDLCBjaWRyTWFzazogMjQgfSxcbiAgICAgICAgeyBuYW1lOiAnUHJpdmF0ZScsIHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBSSVZBVEVfSVNPTEFURUQsIGNpZHJNYXNrOiAyNCB9LFxuICAgICAgXSxcbiAgICB9KTtcblxuICAgIC8vIFZQQyBFbmRwb2ludHMgZm9yIGRldiBlbnZpcm9ubWVudCAobm8gTkFUKVxuICAgIGlmIChlbnYgPT09ICdkZXYnKSB7XG4gICAgICB2cGMuYWRkR2F0ZXdheUVuZHBvaW50KCdTM0VuZHBvaW50JywgeyBzZXJ2aWNlOiBlYzIuR2F0ZXdheVZwY0VuZHBvaW50QXdzU2VydmljZS5TMyB9KTtcbiAgICAgIHZwYy5hZGRJbnRlcmZhY2VFbmRwb2ludCgnU2VjcmV0c0VuZHBvaW50Jywge1xuICAgICAgICBzZXJ2aWNlOiBlYzIuSW50ZXJmYWNlVnBjRW5kcG9pbnRBd3NTZXJ2aWNlLlNFQ1JFVFNfTUFOQUdFUixcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIExhbWJkYSBTZWN1cml0eSBHcm91cFxuICAgIGNvbnN0IGxhbWJkYVNnID0gbmV3IGVjMi5TZWN1cml0eUdyb3VwKHRoaXMsICdQcmVyZXFMYW1iZGFTRycsIHtcbiAgICAgIHZwYyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnU2VjdXJpdHkgZ3JvdXAgZm9yIFBSRVJFUSBMYW1iZGEgZnVuY3Rpb25zJyxcbiAgICAgIGFsbG93QWxsT3V0Ym91bmQ6IHRydWUsXG4gICAgfSk7XG5cbiAgICAvLyBEYXRhYmFzZSBTZWN1cml0eSBHcm91cCB3aXRoIGVudmlyb25tZW50LWF3YXJlIGFjY2Vzc1xuICAgIGNvbnN0IGRiU2VjdXJpdHlHcm91cCA9IG5ldyBlYzIuU2VjdXJpdHlHcm91cCh0aGlzLCAnUHJlcmVxREJTZWN1cml0eUdyb3VwJywge1xuICAgICAgdnBjLFxuICAgICAgZGVzY3JpcHRpb246ICdTZWN1cml0eSBncm91cCBmb3IgUFJFUkVRIFJEUyBpbnN0YW5jZScsXG4gICAgICBhbGxvd0FsbE91dGJvdW5kOiB0cnVlLFxuICAgIH0pO1xuXG4gICAgLy8gQWxsb3cgUG9zdGdyZVNRTCBhY2Nlc3MgZnJvbSBMYW1iZGEgKGFsbCBlbnZpcm9ubWVudHMpXG4gICAgZGJTZWN1cml0eUdyb3VwLmFkZEluZ3Jlc3NSdWxlKFxuICAgICAgbGFtYmRhU2csXG4gICAgICBlYzIuUG9ydC50Y3AoNTQzMiksXG4gICAgICAnQWxsb3cgUG9zdGdyZVNRTCBhY2Nlc3MgZnJvbSBMYW1iZGEnXG4gICAgKTtcblxuICAgIC8vIERldiBvbmx5OiBBbGxvdyBkaXJlY3QgYWNjZXNzIGZyb20gZGV2ZWxvcGVyIElQXG4gICAgaWYgKGVudiA9PT0gJ2RldicpIHtcbiAgICAgIGRiU2VjdXJpdHlHcm91cC5hZGRJbmdyZXNzUnVsZShcbiAgICAgICAgZWMyLlBlZXIuaXB2NChkZXZJUCksXG4gICAgICAgIGVjMi5Qb3J0LnRjcCg1NDMyKSxcbiAgICAgICAgJ0FsbG93IFBvc3RncmVTUUwgYWNjZXNzIGZyb20gZGV2ZWxvcGVyIElQIChkZXYgb25seSknXG4gICAgICApO1xuICAgIH1cblxuICAgIC8vIEVudmlyb25tZW50LWF3YXJlIFJEUyBjb25maWd1cmF0aW9uXG4gICAgY29uc3QgZGF0YWJhc2UgPSBuZXcgcmRzLkRhdGFiYXNlSW5zdGFuY2UodGhpcywgJ1ByZXJlcURhdGFiYXNlJywge1xuICAgICAgZW5naW5lOiByZHMuRGF0YWJhc2VJbnN0YW5jZUVuZ2luZS5wb3N0Z3Jlcyh7XG4gICAgICAgIHZlcnNpb246IHJkcy5Qb3N0Z3Jlc0VuZ2luZVZlcnNpb24uVkVSXzE3XzUsXG4gICAgICB9KSxcbiAgICAgIGluc3RhbmNlVHlwZTogZWMyLkluc3RhbmNlVHlwZS5vZihlYzIuSW5zdGFuY2VDbGFzcy5UMywgZWMyLkluc3RhbmNlU2l6ZS5NSUNSTyksXG4gICAgICB2cGMsXG4gICAgICB2cGNTdWJuZXRzOiB7XG4gICAgICAgIC8vIERldjogcHVibGljIHN1Ym5ldHMgZm9yIGRpcmVjdCBhY2Nlc3MsIFN0YWdlL1Byb2Q6IHByaXZhdGUgaXNvbGF0ZWRcbiAgICAgICAgc3VibmV0VHlwZTogZW52ID09PSAnZGV2JyA/IGVjMi5TdWJuZXRUeXBlLlBVQkxJQyA6IGVjMi5TdWJuZXRUeXBlLlBSSVZBVEVfSVNPTEFURUQsXG4gICAgICB9LFxuICAgICAgc2VjdXJpdHlHcm91cHM6IFtkYlNlY3VyaXR5R3JvdXBdLFxuICAgICAgZGF0YWJhc2VOYW1lOiAncHJlcmVxJyxcbiAgICAgIGNyZWRlbnRpYWxzOiByZHMuQ3JlZGVudGlhbHMuZnJvbUdlbmVyYXRlZFNlY3JldCgncHJlcmVxX2FkbWluJyksXG4gICAgICAvLyBEZXY6IHB1YmxpY2x5IGFjY2Vzc2libGUgZm9yIGxvY2FsIHRvb2xzLCBTdGFnZS9Qcm9kOiBwcml2YXRlXG4gICAgICBwdWJsaWNseUFjY2Vzc2libGU6IGVudiA9PT0gJ2RldicsXG4gICAgICBiYWNrdXBSZXRlbnRpb246IGNkay5EdXJhdGlvbi5kYXlzKDcpLFxuICAgICAgLy8gUHJvZDogZW5hYmxlIGRlbGV0aW9uIHByb3RlY3Rpb24sIERldi9TdGFnZTogYWxsb3cgZWFzeSBjbGVhbnVwXG4gICAgICBkZWxldGlvblByb3RlY3Rpb246IGlzUHJvZCxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGlzUHJvZCA/IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTiA6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgfSk7XG5cbiAgICAvLyBBZGQgYXV0b21hdGljIHNlY3JldCByb3RhdGlvbiBmb3IgZGF0YWJhc2VcbiAgICBkYXRhYmFzZS5hZGRSb3RhdGlvblNpbmdsZVVzZXIoKTtcblxuICAgIC8vIFJEUyBQcm94eSBjb25maWd1cmF0aW9uIGJhc2VkIG9uIGVudmlyb25tZW50XG4gICAgbGV0IGRiUHJveHk6IHJkcy5EYXRhYmFzZVByb3h5IHwgdW5kZWZpbmVkO1xuICAgIGxldCBkYkVuZHBvaW50OiBzdHJpbmc7XG4gICAgXG4gICAgaWYgKGVudiAhPT0gJ2RldicpIHtcbiAgICAgIC8vIENyZWF0ZSBlbnZpcm9ubWVudC1zcGVjaWZpYyBzZWN1cml0eSBncm91cHMgZm9yIHByb3h5XG4gICAgICBsZXQgcHJveHlTZWN1cml0eUdyb3VwczogZWMyLlNlY3VyaXR5R3JvdXBbXTtcbiAgICAgIFxuICAgICAgaWYgKGlzU3RhZ2UpIHtcbiAgICAgICAgLy8gU3RhZ2U6IENyZWF0ZSBwdWJsaWMgc2VjdXJpdHkgZ3JvdXAgZm9yIHByb3h5XG4gICAgICAgIGNvbnN0IHByb3h5UHVibGljU2cgPSBuZXcgZWMyLlNlY3VyaXR5R3JvdXAodGhpcywgJ1ByZXJlcVByb3h5UHVibGljU0cnLCB7XG4gICAgICAgICAgdnBjLFxuICAgICAgICAgIGRlc2NyaXB0aW9uOiAnUHVibGljIGFjY2VzcyBzZWN1cml0eSBncm91cCBmb3IgUkRTIFByb3h5IChzdGFnZSBvbmx5KScsXG4gICAgICAgICAgYWxsb3dBbGxPdXRib3VuZDogdHJ1ZSxcbiAgICAgICAgfSk7XG4gICAgICAgIFxuICAgICAgICAvLyBBbGxvdyBhY2Nlc3MgdG8gcHJveHkgaW4gc3RhZ2UgZnJvbSB5b3VyIElQIChjaGFuZ2UgdG8gYW55SXB2NCgpIGZvciBkZW1vIGNsaWVudHMpXG4gICAgICAgIHByb3h5UHVibGljU2cuYWRkSW5ncmVzc1J1bGUoXG4gICAgICAgICAgZWMyLlBlZXIuaXB2NChkZXZJUCksXG4gICAgICAgICAgZWMyLlBvcnQudGNwKDU0MzIpLFxuICAgICAgICAgICdBbGxvdyBhY2Nlc3MgdG8gUkRTIFByb3h5IGZyb20gZGV2IElQIChzdGFnZSBvbmx5KSdcbiAgICAgICAgKTtcblxuICAgICAgICAvLyBTdGFnZTogVXNlIGJvdGggREIgc2VjdXJpdHkgZ3JvdXAgYW5kIHB1YmxpYyBzZWN1cml0eSBncm91cFxuICAgICAgICBwcm94eVNlY3VyaXR5R3JvdXBzID0gW2RiU2VjdXJpdHlHcm91cCwgcHJveHlQdWJsaWNTZ107XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBQcm9kOiBVc2Ugb25seSB0aGUgcHJpdmF0ZSBEQiBzZWN1cml0eSBncm91cFxuICAgICAgICBwcm94eVNlY3VyaXR5R3JvdXBzID0gW2RiU2VjdXJpdHlHcm91cF07XG4gICAgICB9XG5cbiAgICAgIC8vIFN0YWdlL1Byb2Q6IENyZWF0ZSBSRFMgUHJveHkgd2l0aCBhcHByb3ByaWF0ZSBzZWN1cml0eSBncm91cHNcbiAgICAgIGRiUHJveHkgPSBuZXcgcmRzLkRhdGFiYXNlUHJveHkodGhpcywgJ1ByZXJlcURhdGFiYXNlUHJveHknLCB7XG4gICAgICAgIHByb3h5VGFyZ2V0OiByZHMuUHJveHlUYXJnZXQuZnJvbUluc3RhbmNlKGRhdGFiYXNlKSxcbiAgICAgICAgc2VjcmV0czogW2RhdGFiYXNlLnNlY3JldCFdLFxuICAgICAgICB2cGMsXG4gICAgICAgIHZwY1N1Ym5ldHM6IHtcbiAgICAgICAgICBzdWJuZXRUeXBlOiBlYzIuU3VibmV0VHlwZS5QUklWQVRFX0lTT0xBVEVELFxuICAgICAgICB9LFxuICAgICAgICBzZWN1cml0eUdyb3VwczogcHJveHlTZWN1cml0eUdyb3VwcyxcbiAgICAgICAgcmVxdWlyZVRMUzogdHJ1ZSxcbiAgICAgIH0pO1xuICAgICAgXG4gICAgICBkYkVuZHBvaW50ID0gZGJQcm94eS5lbmRwb2ludDtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gRGV2OiBEaXJlY3QgZGF0YWJhc2UgY29ubmVjdGlvblxuICAgICAgZGJFbmRwb2ludCA9IGRhdGFiYXNlLmluc3RhbmNlRW5kcG9pbnQuaG9zdG5hbWU7XG4gICAgfVxuXG4gICAgLy8gT3B0aW9uYWw6IFNTTSBCYXN0aW9uIGZvciBwcm9kIGRlYnVnZ2luZyAodDMubmFubylcbiAgICBsZXQgYmFzdGlvbkluc3RhbmNlOiBlYzIuSW5zdGFuY2UgfCB1bmRlZmluZWQ7XG4gICAgaWYgKGlzUHJvZCkge1xuICAgICAgLy8gQmFzdGlvbiBzZWN1cml0eSBncm91cFxuICAgICAgY29uc3QgYmFzdGlvblNnID0gbmV3IGVjMi5TZWN1cml0eUdyb3VwKHRoaXMsICdQcmVyZXFCYXN0aW9uU0cnLCB7XG4gICAgICAgIHZwYyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdTZWN1cml0eSBncm91cCBmb3IgUFJFUkVRIFNTTSBiYXN0aW9uJyxcbiAgICAgICAgYWxsb3dBbGxPdXRib3VuZDogdHJ1ZSxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBCYXN0aW9uIGluc3RhbmNlIGZvciBwb3J0IGZvcndhcmRpbmcgaW4gcHJvZFxuICAgICAgYmFzdGlvbkluc3RhbmNlID0gbmV3IGVjMi5JbnN0YW5jZSh0aGlzLCAnUHJlcmVxQmFzdGlvbicsIHtcbiAgICAgICAgaW5zdGFuY2VUeXBlOiBlYzIuSW5zdGFuY2VUeXBlLm9mKGVjMi5JbnN0YW5jZUNsYXNzLlQzLCBlYzIuSW5zdGFuY2VTaXplLk5BTk8pLFxuICAgICAgICBtYWNoaW5lSW1hZ2U6IGVjMi5NYWNoaW5lSW1hZ2UubGF0ZXN0QW1hem9uTGludXgyMDIzKCksXG4gICAgICAgIHZwYyxcbiAgICAgICAgdnBjU3VibmV0czoge1xuICAgICAgICAgIHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBSSVZBVEVfSVNPTEFURUQsXG4gICAgICAgIH0sXG4gICAgICAgIHNlY3VyaXR5R3JvdXA6IGJhc3Rpb25TZyxcbiAgICAgICAgcm9sZTogbmV3IGlhbS5Sb2xlKHRoaXMsICdQcmVyZXFCYXN0aW9uUm9sZScsIHtcbiAgICAgICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnZWMyLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgICAgICBtYW5hZ2VkUG9saWNpZXM6IFtcbiAgICAgICAgICAgIGlhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZSgnQW1hem9uU1NNTWFuYWdlZEluc3RhbmNlQ29yZScpLFxuICAgICAgICAgIF0sXG4gICAgICAgIH0pLFxuICAgICAgICB1c2VyRGF0YTogZWMyLlVzZXJEYXRhLmZvckxpbnV4KCksXG4gICAgICB9KTtcblxuICAgICAgLy8gQWxsb3cgYmFzdGlvbiB0byBhY2Nlc3MgZGF0YWJhc2VcbiAgICAgIGRiU2VjdXJpdHlHcm91cC5hZGRJbmdyZXNzUnVsZShcbiAgICAgICAgYmFzdGlvblNnLFxuICAgICAgICBlYzIuUG9ydC50Y3AoNTQzMiksXG4gICAgICAgICdBbGxvdyBQb3N0Z3JlU1FMIGFjY2VzcyBmcm9tIGJhc3Rpb24gKHByb2Qgb25seSknXG4gICAgICApO1xuICAgIH1cblxuICAgIC8vIEpXVCBTZWNyZXQgaW4gU2VjcmV0cyBNYW5hZ2VyXG4gICAgY29uc3Qgand0U2VjcmV0ID0gbmV3IHNlY3JldHNtYW5hZ2VyLlNlY3JldCh0aGlzLCAnSnd0U2VjcmV0Jywge1xuICAgICAgZGVzY3JpcHRpb246ICdKV1Qgc2lnbmluZyBzZWNyZXQgZm9yIFBSRVJFUSBBUEknLFxuICAgICAgZ2VuZXJhdGVTZWNyZXRTdHJpbmc6IHtcbiAgICAgICAgZXhjbHVkZVB1bmN0dWF0aW9uOiB0cnVlLFxuICAgICAgICBwYXNzd29yZExlbmd0aDogMzIsXG4gICAgICB9LFxuICAgICAgcmVtb3ZhbFBvbGljeTogaXNQcm9kID8gY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOIDogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICB9KTtcblxuICAgIC8vIEFkZCBtb250aGx5IHJvdGF0aW9uIGZvciBKV1Qgc2VjcmV0IGluIHByb2R1Y3Rpb25cbiAgICBpZiAoaXNQcm9kKSB7XG4gICAgICBqd3RTZWNyZXQuYWRkUm90YXRpb25TY2hlZHVsZSgnUm90YXRlTW9udGhseScsIHtcbiAgICAgICAgYXV0b21hdGljYWxseUFmdGVyOiBjZGsuRHVyYXRpb24uZGF5cygzMCksXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBDb2duaXRvIFVzZXIgUG9vbFxuICAgIGNvbnN0IHVzZXJQb29sID0gbmV3IGNvZ25pdG8uVXNlclBvb2wodGhpcywgJ1ByZXJlcVVzZXJQb29sJywge1xuICAgICAgdXNlclBvb2xOYW1lOiAncHJlcmVxLXVzZXJzJyxcbiAgICAgIHNlbGZTaWduVXBFbmFibGVkOiB0cnVlLFxuICAgICAgc2lnbkluQWxpYXNlczoge1xuICAgICAgICBlbWFpbDogdHJ1ZSxcbiAgICAgIH0sXG4gICAgICBzdGFuZGFyZEF0dHJpYnV0ZXM6IHtcbiAgICAgICAgZW1haWw6IHtcbiAgICAgICAgICByZXF1aXJlZDogdHJ1ZSxcbiAgICAgICAgICBtdXRhYmxlOiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgICBmdWxsbmFtZToge1xuICAgICAgICAgIHJlcXVpcmVkOiBmYWxzZSxcbiAgICAgICAgICBtdXRhYmxlOiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIHBhc3N3b3JkUG9saWN5OiB7XG4gICAgICAgIG1pbkxlbmd0aDogOCxcbiAgICAgICAgcmVxdWlyZUxvd2VyY2FzZTogdHJ1ZSxcbiAgICAgICAgcmVxdWlyZVVwcGVyY2FzZTogdHJ1ZSxcbiAgICAgICAgcmVxdWlyZURpZ2l0czogdHJ1ZSxcbiAgICAgICAgcmVxdWlyZVN5bWJvbHM6IHRydWUsXG4gICAgICB9LFxuICAgICAgYWNjb3VudFJlY292ZXJ5OiBjb2duaXRvLkFjY291bnRSZWNvdmVyeS5FTUFJTF9PTkxZLFxuICAgIH0pO1xuXG4gICAgLy8gQ29nbml0byBVc2VyIFBvb2wgQ2xpZW50XG4gICAgY29uc3QgdXNlclBvb2xDbGllbnQgPSBuZXcgY29nbml0by5Vc2VyUG9vbENsaWVudCh0aGlzLCAnUHJlcmVxVXNlclBvb2xDbGllbnQnLCB7XG4gICAgICB1c2VyUG9vbCxcbiAgICAgIHVzZXJQb29sQ2xpZW50TmFtZTogJ3ByZXJlcS1jbGllbnQnLFxuICAgICAgZ2VuZXJhdGVTZWNyZXQ6IGZhbHNlLFxuICAgICAgYXV0aEZsb3dzOiB7XG4gICAgICAgIGFkbWluVXNlclBhc3N3b3JkOiB0cnVlLFxuICAgICAgICB1c2VyUGFzc3dvcmQ6IHRydWUsXG4gICAgICAgIHVzZXJTcnA6IHRydWUsXG4gICAgICB9LFxuICAgICAgb0F1dGg6IHtcbiAgICAgICAgZmxvd3M6IHtcbiAgICAgICAgICBhdXRob3JpemF0aW9uQ29kZUdyYW50OiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgICBzY29wZXM6IFtjb2duaXRvLk9BdXRoU2NvcGUuRU1BSUwsIGNvZ25pdG8uT0F1dGhTY29wZS5PUEVOSUQsIGNvZ25pdG8uT0F1dGhTY29wZS5QUk9GSUxFXSxcbiAgICAgICAgY2FsbGJhY2tVcmxzOiBbJ2h0dHA6Ly9sb2NhbGhvc3Q6NTE3My9jYWxsYmFjaycsICdodHRwczovL3lvdXItZG9tYWluLmNvbS9jYWxsYmFjayddLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIEVudmlyb25tZW50LXNwZWNpZmljIHRocm90dGxpbmcgcmF0ZXNcbiAgICBjb25zdCB0aHJvdHRsZUNvbmZpZyA9IHtcbiAgICAgIGRldjogeyByYXRlOiB1bmRlZmluZWQsIGJ1cnN0OiB1bmRlZmluZWQgfSwgLy8gVW5saW1pdGVkXG4gICAgICBzdGFnZTogeyByYXRlOiAyMCwgYnVyc3Q6IDEwIH0sXG4gICAgICBwcm9kOiB7IHJhdGU6IDUwLCBidXJzdDogMjAgfVxuICAgIH07XG5cbiAgICBjb25zdCBjdXJyZW50VGhyb3R0bGUgPSB0aHJvdHRsZUNvbmZpZ1tlbnYgYXMga2V5b2YgdHlwZW9mIHRocm90dGxlQ29uZmlnXTtcblxuICAgIC8vIExhbWJkYSBGdW5jdGlvbiB1c2luZyByZWd1bGFyIEZ1bmN0aW9uIChubyBEb2NrZXIgcmVxdWlyZWQpXG4gICAgLy8gV2hlbiBzd2l0Y2hpbmcgYmFjayB0byBOb2RlanNGdW5jdGlvbiwgY29uc2lkZXI6XG4gICAgLy8gYnVuZGxpbmc6IHsgZXh0ZXJuYWxNb2R1bGVzOiBbJ0BuZXN0anMvKicsICdwZyddIH1cbiAgICBjb25zdCBhcGlMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdQcmVyZXFBUElMYW1iZGEnLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMThfWCxcbiAgICAgIGhhbmRsZXI6ICdtYWluLmhhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi8uLi9iYWNrZW5kL2Rpc3QnKSksXG4gICAgICB2cGMsXG4gICAgICBzZWN1cml0eUdyb3VwczogW2xhbWJkYVNnXSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIERCX1NFQ1JFVF9BUk46IGRhdGFiYXNlLnNlY3JldCEuc2VjcmV0QXJuLFxuICAgICAgICBEQl9IT1NUOiBkYkVuZHBvaW50LFxuICAgICAgICAuLi4oZGJQcm94eSAmJiB7IERCX1BST1hZX0VORFBPSU5UOiBkYlByb3h5LmVuZHBvaW50IH0pLFxuICAgICAgICBKV1RfU0VDUkVUX0FSTjogand0U2VjcmV0LnNlY3JldEFybixcbiAgICAgICAgQ09HTklUT19VU0VSX1BPT0xfSUQ6IHVzZXJQb29sLnVzZXJQb29sSWQsXG4gICAgICAgIENPR05JVE9fQ0xJRU5UX0lEOiB1c2VyUG9vbENsaWVudC51c2VyUG9vbENsaWVudElkLFxuICAgICAgICBOT0RFX0VOVjogZW52LFxuICAgICAgfSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgIG1lbW9yeVNpemU6IDUxMixcbiAgICB9KTtcblxuICAgIC8vIExhbWJkYSBsb2cgZ3JvdXAgd2l0aCBzeW1tZXRyaWMgcmV0ZW50aW9uXG4gICAgbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ1ByZXJlcUFQSUxhbWJkYUxvZ3MnLCB7XG4gICAgICBsb2dHcm91cE5hbWU6IGAvYXdzL2xhbWJkYS8ke2FwaUxhbWJkYS5mdW5jdGlvbk5hbWV9YCxcbiAgICAgIHJldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9NT05USCxcbiAgICB9KTtcblxuICAgIC8vIEdyYW50IExhbWJkYSBhY2Nlc3MgdG8gZGF0YWJhc2UvcHJveHkgYW5kIHNlY3JldHNcbiAgICBpZiAoZGJQcm94eSkge1xuICAgICAgZGJQcm94eS5ncmFudENvbm5lY3QoYXBpTGFtYmRhLCAncHJlcmVxX2FkbWluJyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGRhdGFiYXNlLmdyYW50Q29ubmVjdChhcGlMYW1iZGEpO1xuICAgIH1cbiAgICBkYXRhYmFzZS5zZWNyZXQ/LmdyYW50UmVhZChhcGlMYW1iZGEpO1xuICAgIGp3dFNlY3JldC5ncmFudFJlYWQoYXBpTGFtYmRhKTtcblxuICAgIC8vIEFjY2Vzcy1sb2cgZ3JvdXBcbiAgICBjb25zdCBhcGlMb2dzID0gbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ1ByZXJlcUFwaUxvZ3MnLCB7XG4gICAgICByZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfTU9OVEgsXG4gICAgfSk7XG5cbiAgICAvLyBBUEkgR2F0ZXdheSB3aXRoIGVudmlyb25tZW50LXNwZWNpZmljIHRocm90dGxpbmdcbiAgICBjb25zdCBkZXBsb3lPcHRpb25zOiBhbnkgPSB7XG4gICAgICBzdGFnZU5hbWU6IGVudixcbiAgICAgIG1ldHJpY3NFbmFibGVkOiB0cnVlLFxuICAgICAgbG9nZ2luZ0xldmVsOiBhcGlnYXRld2F5Lk1ldGhvZExvZ2dpbmdMZXZlbC5JTkZPLFxuICAgICAgYWNjZXNzTG9nRGVzdGluYXRpb246IG5ldyBhcGlnYXRld2F5LkxvZ0dyb3VwTG9nRGVzdGluYXRpb24oYXBpTG9ncyksXG4gICAgICBhY2Nlc3NMb2dGb3JtYXQ6IGFwaWdhdGV3YXkuQWNjZXNzTG9nRm9ybWF0Lmpzb25XaXRoU3RhbmRhcmRGaWVsZHMoe1xuICAgICAgICBjYWxsZXI6IHRydWUsXG4gICAgICAgIGh0dHBNZXRob2Q6IHRydWUsXG4gICAgICAgIGlwOiB0cnVlLFxuICAgICAgICBwcm90b2NvbDogdHJ1ZSxcbiAgICAgICAgcmVxdWVzdFRpbWU6IHRydWUsXG4gICAgICAgIHJlc291cmNlUGF0aDogdHJ1ZSxcbiAgICAgICAgcmVzcG9uc2VMZW5ndGg6IHRydWUsXG4gICAgICAgIHN0YXR1czogdHJ1ZSxcbiAgICAgICAgdXNlcjogdHJ1ZSxcbiAgICAgIH0pLFxuICAgIH07XG5cbiAgICAvLyBBZGQgdGhyb3R0bGluZyBvbmx5IGZvciBzdGFnZS9wcm9kXG4gICAgaWYgKGN1cnJlbnRUaHJvdHRsZS5yYXRlICYmIGN1cnJlbnRUaHJvdHRsZS5idXJzdCkge1xuICAgICAgZGVwbG95T3B0aW9ucy50aHJvdHRsaW5nUmF0ZUxpbWl0ID0gY3VycmVudFRocm90dGxlLnJhdGU7XG4gICAgICBkZXBsb3lPcHRpb25zLnRocm90dGxpbmdCdXJzdExpbWl0ID0gY3VycmVudFRocm90dGxlLmJ1cnN0O1xuICAgIH1cblxuICAgIGNvbnN0IGFwaSA9IG5ldyBhcGlnYXRld2F5LlJlc3RBcGkodGhpcywgJ1ByZXJlcUFQSScsIHtcbiAgICAgIHJlc3RBcGlOYW1lOiAnUFJFUkVRIEFQSScsXG4gICAgICBkZXNjcmlwdGlvbjogJ1BSRVJFUSBQcm9qZWN0IE1hbmFnZW1lbnQgQVBJJyxcbiAgICAgIGRlZmF1bHRDb3JzUHJlZmxpZ2h0T3B0aW9uczoge1xuICAgICAgICBhbGxvd09yaWdpbnM6IGFwaWdhdGV3YXkuQ29ycy5BTExfT1JJR0lOUyxcbiAgICAgICAgYWxsb3dNZXRob2RzOiBhcGlnYXRld2F5LkNvcnMuQUxMX01FVEhPRFMsXG4gICAgICAgIGFsbG93SGVhZGVyczogWydDb250ZW50LVR5cGUnLCAnQXV0aG9yaXphdGlvbiddLFxuICAgICAgfSxcbiAgICAgIGRlcGxveU9wdGlvbnMsXG4gICAgfSk7XG5cbiAgICAvLyBBUEkgR2F0ZXdheSBJbnRlZ3JhdGlvblxuICAgIGNvbnN0IGludGVncmF0aW9uID0gbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oYXBpTGFtYmRhKTtcblxuICAgIC8vIEFQSSBSb3V0ZXNcbiAgICBhcGkucm9vdC5hZGRQcm94eSh7XG4gICAgICBkZWZhdWx0SW50ZWdyYXRpb246IGludGVncmF0aW9uLFxuICAgICAgYW55TWV0aG9kOiB0cnVlLFxuICAgIH0pO1xuXG4gICAgLy8gV0FGIGZvciBzdGFnZS9wcm9kIG9ubHkgKGRldiBoYXMgbm8gV0FGKVxuICAgIGlmIChlbnYgIT09ICdkZXYnKSB7XG4gICAgICBjb25zdCB3ZWJBY2wgPSBuZXcgd2FmdjIuQ2ZuV2ViQUNMKHRoaXMsICdBcGlXYWYnLCB7XG4gICAgICAgIGRlZmF1bHRBY3Rpb246IHsgYWxsb3c6IHt9IH0sXG4gICAgICAgIHNjb3BlOiAnUkVHSU9OQUwnLFxuICAgICAgICB2aXNpYmlsaXR5Q29uZmlnOiB7XG4gICAgICAgICAgY2xvdWRXYXRjaE1ldHJpY3NFbmFibGVkOiB0cnVlLFxuICAgICAgICAgIG1ldHJpY05hbWU6ICdQcmVyZXFBcGlXYWYnLFxuICAgICAgICAgIHNhbXBsZWRSZXF1ZXN0c0VuYWJsZWQ6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICAgIG5hbWU6ICdQcmVyZXFBcGlXYWYnLFxuICAgICAgICBydWxlczogW1xuICAgICAgICAgIHtcbiAgICAgICAgICAgIG5hbWU6ICdBV1MtQVdTTWFuYWdlZENvbW1vblJ1bGVTZXQnLFxuICAgICAgICAgICAgcHJpb3JpdHk6IDAsXG4gICAgICAgICAgICBzdGF0ZW1lbnQ6IHsgbWFuYWdlZFJ1bGVHcm91cFN0YXRlbWVudDoge1xuICAgICAgICAgICAgICBuYW1lOiAnQVdTTWFuYWdlZFJ1bGVzQ29tbW9uUnVsZVNldCcsXG4gICAgICAgICAgICAgIHZlbmRvck5hbWU6ICdBV1MnLFxuICAgICAgICAgICAgfX0sXG4gICAgICAgICAgICBvdmVycmlkZUFjdGlvbjogeyBub25lOiB7fSB9LFxuICAgICAgICAgICAgdmlzaWJpbGl0eUNvbmZpZzoge1xuICAgICAgICAgICAgICBjbG91ZFdhdGNoTWV0cmljc0VuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgICAgIG1ldHJpY05hbWU6ICdDb21tb25SdWxlcycsXG4gICAgICAgICAgICAgIHNhbXBsZWRSZXF1ZXN0c0VuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgICAge1xuICAgICAgICAgICAgbmFtZTogJ0lwUmF0ZUxpbWl0JyxcbiAgICAgICAgICAgIHByaW9yaXR5OiAxLFxuICAgICAgICAgICAgc3RhdGVtZW50OiB7XG4gICAgICAgICAgICAgIHJhdGVCYXNlZFN0YXRlbWVudDoge1xuICAgICAgICAgICAgICAgIGxpbWl0OiAyMDAwLCAgICAgICAgIC8vIDIwMDAgcmVxdWVzdHMgaW4gNSBtaW4gcGVyIElQXG4gICAgICAgICAgICAgICAgYWdncmVnYXRlS2V5VHlwZTogJ0lQJyxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBhY3Rpb246IHsgYmxvY2s6IHt9IH0sXG4gICAgICAgICAgICB2aXNpYmlsaXR5Q29uZmlnOiB7XG4gICAgICAgICAgICAgIGNsb3VkV2F0Y2hNZXRyaWNzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICAgICAgbWV0cmljTmFtZTogJ0lwUmF0ZUxpbWl0JyxcbiAgICAgICAgICAgICAgc2FtcGxlZFJlcXVlc3RzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgXSxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBBc3NvY2lhdGUgV0FGIHdpdGggQVBJIEdhdGV3YXlcbiAgICAgIG5ldyB3YWZ2Mi5DZm5XZWJBQ0xBc3NvY2lhdGlvbih0aGlzLCAnQXBpV2FmQXNzb2MnLCB7XG4gICAgICAgIHdlYkFjbEFybjogd2ViQWNsLmF0dHJBcm4sXG4gICAgICAgIHJlc291cmNlQXJuOiBhcGkuZGVwbG95bWVudFN0YWdlLnN0YWdlQXJuLFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gUHJpdmF0ZSBTMyBCdWNrZXQgZm9yIEZyb250ZW5kXG4gICAgY29uc3QgZnJvbnRlbmRCdWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsICdQcmVyZXFGcm9udGVuZEJ1Y2tldCcsIHtcbiAgICAgIGJ1Y2tldE5hbWU6IGBwcmVyZXEtZnJvbnRlbmQtJHtlbnZ9LSR7dGhpcy5hY2NvdW50fS0ke3RoaXMucmVnaW9ufWAsXG4gICAgICBwdWJsaWNSZWFkQWNjZXNzOiBmYWxzZSxcbiAgICAgIGJsb2NrUHVibGljQWNjZXNzOiBzMy5CbG9ja1B1YmxpY0FjY2Vzcy5CTE9DS19BTEwsXG4gICAgICByZW1vdmFsUG9saWN5OiBpc1Byb2QgPyBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4gOiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgYXV0b0RlbGV0ZU9iamVjdHM6ICFpc1Byb2QsXG4gICAgfSk7XG5cbiAgICAvLyBDbG91ZEZyb250IE9yaWdpbiBBY2Nlc3MgSWRlbnRpdHlcbiAgICBjb25zdCBvcmlnaW5BY2Nlc3NJZGVudGl0eSA9IG5ldyBjbG91ZGZyb250Lk9yaWdpbkFjY2Vzc0lkZW50aXR5KHRoaXMsICdQcmVyZXFPQUknLCB7XG4gICAgICBjb21tZW50OiAnT0FJIGZvciBQUkVSRVEgZnJvbnRlbmQgYnVja2V0JyxcbiAgICB9KTtcblxuICAgIC8vIEdyYW50IENsb3VkRnJvbnQgcmVhZCBhY2Nlc3MgdG8gdGhlIGJ1Y2tldFxuICAgIGZyb250ZW5kQnVja2V0LmdyYW50UmVhZChvcmlnaW5BY2Nlc3NJZGVudGl0eSk7XG5cbiAgICAvLyBDbG91ZEZyb250IERpc3RyaWJ1dGlvbiB3aXRoIFNQQS1vcHRpbWl6ZWQgY2FjaGluZ1xuICAgIGNvbnN0IGRpc3RyaWJ1dGlvbiA9IG5ldyBjbG91ZGZyb250LkRpc3RyaWJ1dGlvbih0aGlzLCAnUHJlcmVxRGlzdHJpYnV0aW9uJywge1xuICAgICAgZGVmYXVsdEJlaGF2aW9yOiB7XG4gICAgICAgIG9yaWdpbjogb3JpZ2lucy5TM0J1Y2tldE9yaWdpbi53aXRoT3JpZ2luQWNjZXNzSWRlbnRpdHkoZnJvbnRlbmRCdWNrZXQsIHtcbiAgICAgICAgICBvcmlnaW5BY2Nlc3NJZGVudGl0eSxcbiAgICAgICAgfSksXG4gICAgICAgIHZpZXdlclByb3RvY29sUG9saWN5OiBjbG91ZGZyb250LlZpZXdlclByb3RvY29sUG9saWN5LlJFRElSRUNUX1RPX0hUVFBTLFxuICAgICAgICBhbGxvd2VkTWV0aG9kczogY2xvdWRmcm9udC5BbGxvd2VkTWV0aG9kcy5BTExPV19BTEwsXG4gICAgICAgIGNhY2hlZE1ldGhvZHM6IGNsb3VkZnJvbnQuQ2FjaGVkTWV0aG9kcy5DQUNIRV9HRVRfSEVBRF9PUFRJT05TLFxuICAgICAgICBjYWNoZVBvbGljeTogY2xvdWRmcm9udC5DYWNoZVBvbGljeS5DQUNISU5HX0RJU0FCTEVELFxuICAgICAgfSxcbiAgICAgIGRlZmF1bHRSb290T2JqZWN0OiAnaW5kZXguaHRtbCcsXG4gICAgICBlcnJvclJlc3BvbnNlczogW1xuICAgICAgICB7XG4gICAgICAgICAgaHR0cFN0YXR1czogNDA0LFxuICAgICAgICAgIHJlc3BvbnNlSHR0cFN0YXR1czogMjAwLFxuICAgICAgICAgIHJlc3BvbnNlUGFnZVBhdGg6ICcvaW5kZXguaHRtbCcsXG4gICAgICAgICAgdHRsOiBjZGsuRHVyYXRpb24uc2Vjb25kcygwKSwgLy8gTm8gY2FjaGluZyBmb3IgU1BBIHJvdXRlc1xuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgaHR0cFN0YXR1czogNDAzLFxuICAgICAgICAgIHJlc3BvbnNlSHR0cFN0YXR1czogMjAwLFxuICAgICAgICAgIHJlc3BvbnNlUGFnZVBhdGg6ICcvaW5kZXguaHRtbCcsXG4gICAgICAgICAgdHRsOiBjZGsuRHVyYXRpb24uc2Vjb25kcygwKSwgLy8gTm8gY2FjaGluZyBmb3IgU1BBIHJvdXRlc1xuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KTtcblxuICAgIC8vIFN0b3JlIHNlbnNpdGl2ZSB2YWx1ZXMgaW4gU1NNIFBhcmFtZXRlcnNcbiAgICBuZXcgc3NtLlN0cmluZ1BhcmFtZXRlcih0aGlzLCAnRGF0YWJhc2VFbmRwb2ludFBhcmFtJywge1xuICAgICAgcGFyYW1ldGVyTmFtZTogYC9wcmVyZXEvJHtlbnZ9L2RhdGFiYXNlL2VuZHBvaW50YCxcbiAgICAgIHN0cmluZ1ZhbHVlOiBkYXRhYmFzZS5pbnN0YW5jZUVuZHBvaW50Lmhvc3RuYW1lLFxuICAgICAgZGVzY3JpcHRpb246IGBSRFMgRGF0YWJhc2UgRW5kcG9pbnQgKCR7ZW52fSlgLFxuICAgIH0pO1xuXG4gICAgaWYgKGRiUHJveHkpIHtcbiAgICAgIG5ldyBzc20uU3RyaW5nUGFyYW1ldGVyKHRoaXMsICdEYXRhYmFzZVByb3h5RW5kcG9pbnRQYXJhbScsIHtcbiAgICAgICAgcGFyYW1ldGVyTmFtZTogYC9wcmVyZXEvJHtlbnZ9L2RhdGFiYXNlL3Byb3h5LWVuZHBvaW50YCxcbiAgICAgICAgc3RyaW5nVmFsdWU6IGRiUHJveHkuZW5kcG9pbnQsXG4gICAgICAgIGRlc2NyaXB0aW9uOiBgUkRTIFByb3h5IEVuZHBvaW50ICgke2Vudn0pYCxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIG5ldyBzc20uU3RyaW5nUGFyYW1ldGVyKHRoaXMsICdEYXRhYmFzZVNlY3JldEFyblBhcmFtJywge1xuICAgICAgcGFyYW1ldGVyTmFtZTogYC9wcmVyZXEvJHtlbnZ9L2RhdGFiYXNlL3NlY3JldC1hcm5gLFxuICAgICAgc3RyaW5nVmFsdWU6IGRhdGFiYXNlLnNlY3JldD8uc2VjcmV0QXJuIHx8ICcnLFxuICAgICAgZGVzY3JpcHRpb246IGBSRFMgRGF0YWJhc2UgU2VjcmV0IEFSTiAoJHtlbnZ9KWAsXG4gICAgfSk7XG5cbiAgICBuZXcgc3NtLlN0cmluZ1BhcmFtZXRlcih0aGlzLCAnSnd0U2VjcmV0QXJuUGFyYW0nLCB7XG4gICAgICBwYXJhbWV0ZXJOYW1lOiBgL3ByZXJlcS8ke2Vudn0vand0L3NlY3JldC1hcm5gLFxuICAgICAgc3RyaW5nVmFsdWU6IGp3dFNlY3JldC5zZWNyZXRBcm4sXG4gICAgICBkZXNjcmlwdGlvbjogYEpXVCBTZWNyZXQgQVJOICgke2Vudn0pYCxcbiAgICB9KTtcblxuICAgIG5ldyBzc20uU3RyaW5nUGFyYW1ldGVyKHRoaXMsICdDb2duaXRvVXNlclBvb2xJZFBhcmFtJywge1xuICAgICAgcGFyYW1ldGVyTmFtZTogYC9wcmVyZXEvJHtlbnZ9L2NvZ25pdG8vdXNlci1wb29sLWlkYCxcbiAgICAgIHN0cmluZ1ZhbHVlOiB1c2VyUG9vbC51c2VyUG9vbElkLFxuICAgICAgZGVzY3JpcHRpb246IGBDb2duaXRvIFVzZXIgUG9vbCBJRCAoJHtlbnZ9KWAsXG4gICAgfSk7XG5cbiAgICBuZXcgc3NtLlN0cmluZ1BhcmFtZXRlcih0aGlzLCAnQ29nbml0b0NsaWVudElkUGFyYW0nLCB7XG4gICAgICBwYXJhbWV0ZXJOYW1lOiBgL3ByZXJlcS8ke2Vudn0vY29nbml0by9jbGllbnQtaWRgLFxuICAgICAgc3RyaW5nVmFsdWU6IHVzZXJQb29sQ2xpZW50LnVzZXJQb29sQ2xpZW50SWQsXG4gICAgICBkZXNjcmlwdGlvbjogYENvZ25pdG8gVXNlciBQb29sIENsaWVudCBJRCAoJHtlbnZ9KWAsXG4gICAgfSk7XG5cbiAgICAvLyBFbnZpcm9ubWVudC1zcGVjaWZpYyBvdXRwdXRzXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0Vudmlyb25tZW50Jywge1xuICAgICAgdmFsdWU6IGVudixcbiAgICAgIGRlc2NyaXB0aW9uOiAnRGVwbG95bWVudCBlbnZpcm9ubWVudCcsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnRGF0YWJhc2VDb25maWd1cmF0aW9uJywge1xuICAgICAgdmFsdWU6IGVudiA9PT0gJ2RldicgXG4gICAgICAgID8gJ1B1YmxpYyBkYXRhYmFzZSAoZGlyZWN0IGFjY2VzcyknIFxuICAgICAgICA6IGlzU3RhZ2UgXG4gICAgICAgICAgPyAnUHJpdmF0ZSBkYXRhYmFzZSArIHB1YmxpYyBwcm94eSdcbiAgICAgICAgICA6ICdQcml2YXRlIGRhdGFiYXNlICsgcHJpdmF0ZSBwcm94eScsXG4gICAgICBkZXNjcmlwdGlvbjogJ0RhdGFiYXNlIGFjY2VzcyBjb25maWd1cmF0aW9uJyxcbiAgICB9KTtcblxuICAgIGlmIChjdXJyZW50VGhyb3R0bGUucmF0ZSAmJiBjdXJyZW50VGhyb3R0bGUuYnVyc3QpIHtcbiAgICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdUaHJvdHRsaW5nQ29uZmlndXJhdGlvbicsIHtcbiAgICAgICAgdmFsdWU6IGAke2N1cnJlbnRUaHJvdHRsZS5yYXRlfS8ke2N1cnJlbnRUaHJvdHRsZS5idXJzdH0gKHJhdGUvYnVyc3QpYCxcbiAgICAgICAgZGVzY3JpcHRpb246ICdBUEkgR2F0ZXdheSB0aHJvdHRsaW5nIGxpbWl0cycsXG4gICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1Rocm90dGxpbmdDb25maWd1cmF0aW9uJywge1xuICAgICAgICB2YWx1ZTogJ1VubGltaXRlZCcsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnQVBJIEdhdGV3YXkgdGhyb3R0bGluZyBsaW1pdHMnLFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1dBRlByb3RlY3Rpb24nLCB7XG4gICAgICB2YWx1ZTogZW52ID09PSAnZGV2JyA/ICdEaXNhYmxlZCcgOiAnRW5hYmxlZCcsXG4gICAgICBkZXNjcmlwdGlvbjogJ1dBRiBwcm90ZWN0aW9uIHN0YXR1cycsXG4gICAgfSk7XG5cbiAgICBpZiAoYmFzdGlvbkluc3RhbmNlKSB7XG4gICAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQmFzdGlvbkluc3RhbmNlSWQnLCB7XG4gICAgICAgIHZhbHVlOiBiYXN0aW9uSW5zdGFuY2UuaW5zdGFuY2VJZCxcbiAgICAgICAgZGVzY3JpcHRpb246ICdCYXN0aW9uIGluc3RhbmNlIElEIGZvciBTU00gcG9ydCBmb3J3YXJkaW5nIChwcm9kIG9ubHkpJyxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdEYXRhYmFzZUVuZHBvaW50Jywge1xuICAgICAgdmFsdWU6IGlzUHJvZCA/ICc8cmVkYWN0ZWQ+JyA6IGRhdGFiYXNlLmluc3RhbmNlRW5kcG9pbnQuaG9zdG5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ0RpcmVjdCBkYXRhYmFzZSBlbmRwb2ludCcsXG4gICAgfSk7XG5cbiAgICBpZiAoZGJQcm94eSkge1xuICAgICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0RhdGFiYXNlUHJveHlFbmRwb2ludCcsIHtcbiAgICAgICAgdmFsdWU6IGlzUHJvZCA/ICc8cmVkYWN0ZWQ+JyA6IGRiUHJveHkuZW5kcG9pbnQsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnUkRTIFByb3h5IGVuZHBvaW50JyxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIFN0YW5kYXJkIG91dHB1dHNcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnVXNlclBvb2xJZCcsIHtcbiAgICAgIHZhbHVlOiB1c2VyUG9vbC51c2VyUG9vbElkLFxuICAgICAgZGVzY3JpcHRpb246ICdDb2duaXRvIFVzZXIgUG9vbCBJRCcsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnVXNlclBvb2xDbGllbnRJZCcsIHtcbiAgICAgIHZhbHVlOiB1c2VyUG9vbENsaWVudC51c2VyUG9vbENsaWVudElkLFxuICAgICAgZGVzY3JpcHRpb246ICdDb2duaXRvIFVzZXIgUG9vbCBDbGllbnQgSUQnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0FwaVVybCcsIHtcbiAgICAgIHZhbHVlOiBhcGkudXJsLFxuICAgICAgZGVzY3JpcHRpb246ICdBUEkgR2F0ZXdheSBVUkwnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0Zyb250ZW5kVXJsJywge1xuICAgICAgdmFsdWU6IGBodHRwczovLyR7ZGlzdHJpYnV0aW9uLmRpc3RyaWJ1dGlvbkRvbWFpbk5hbWV9YCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ2xvdWRGcm9udCBEaXN0cmlidXRpb24gVVJMJyxcbiAgICB9KTtcbiAgfVxufSAiXX0=