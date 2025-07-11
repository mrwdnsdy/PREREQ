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
            code: lambda.Code.fromAsset('../backend/dist'),
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJlcmVxLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsicHJlcmVxLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLG1DQUFtQztBQUNuQywyQ0FBMkM7QUFDM0MsMkNBQTJDO0FBQzNDLGlEQUFpRDtBQUNqRCx5REFBeUQ7QUFDekQsbURBQW1EO0FBQ25ELHlDQUF5QztBQUN6Qyx5REFBeUQ7QUFDekQsOERBQThEO0FBQzlELGlFQUFpRTtBQUNqRSwrQ0FBK0M7QUFDL0MsMkNBQTJDO0FBQzNDLDJDQUEyQztBQUMzQyw2Q0FBNkM7QUFHN0MsTUFBYSxXQUFZLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFDeEMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFzQjs7UUFDOUQsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsNEJBQTRCO1FBQzVCLE1BQU0sR0FBRyxHQUFHLE1BQUEsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLG1DQUFJLEtBQUssQ0FBQztRQUNwRCxNQUFNLE1BQU0sR0FBRyxHQUFHLEtBQUssTUFBTSxDQUFDO1FBQzlCLE1BQU0sT0FBTyxHQUFHLEdBQUcsS0FBSyxPQUFPLENBQUM7UUFFaEMsbURBQW1EO1FBQ25ELE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLE9BQU8sQ0FBQyxJQUFJLGdCQUFnQixDQUFDO1FBRW5FLHlDQUF5QztRQUN6QyxNQUFNLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLFdBQVcsRUFBRTtZQUN6QyxNQUFNLEVBQUUsQ0FBQztZQUNULGtFQUFrRTtZQUNsRSxXQUFXLEVBQUUsR0FBRyxLQUFLLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ2xDLG1CQUFtQixFQUFFO2dCQUNuQixFQUFFLElB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QUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxRQUFRO2dCQUMvQyxXQUFXLEVBQUUsb0JBQW9CO2FBQ2xDLENBQUMsQ0FBQztRQUNMLENBQUM7UUFFRCxtQkFBbUI7UUFDbkIsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxZQUFZLEVBQUU7WUFDcEMsS0FBSyxFQUFFLFFBQVEsQ0FBQyxVQUFVO1lBQzFCLFdBQVcsRUFBRSxzQkFBc0I7U0FDcEMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxrQkFBa0IsRUFBRTtZQUMxQyxLQUFLLEVBQUUsY0FBYyxDQUFDLGdCQUFnQjtZQUN0QyxXQUFXLEVBQUUsNkJBQTZCO1NBQzNDLENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsUUFBUSxFQUFFO1lBQ2hDLEtBQUssRUFBRSxHQUFHLENBQUMsR0FBRztZQUNkLFdBQVcsRUFBRSxpQkFBaUI7U0FDL0IsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxhQUFhLEVBQUU7WUFDckMsS0FBSyxFQUFFLFdBQVcsWUFBWSxDQUFDLHNCQUFzQixFQUFFO1lBQ3ZELFdBQVcsRUFBRSw2QkFBNkI7U0FDM0MsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBemhCRCxrQ0F5aEJDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCAqIGFzIHJkcyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtcmRzJztcbmltcG9ydCAqIGFzIGVjMiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWMyJztcbmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhJztcbmltcG9ydCAqIGFzIGFwaWdhdGV3YXkgZnJvbSAnYXdzLWNkay1saWIvYXdzLWFwaWdhdGV3YXknO1xuaW1wb3J0ICogYXMgY29nbml0byBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY29nbml0byc7XG5pbXBvcnQgKiBhcyBzMyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtczMnO1xuaW1wb3J0ICogYXMgY2xvdWRmcm9udCBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY2xvdWRmcm9udCc7XG5pbXBvcnQgKiBhcyBvcmlnaW5zIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jbG91ZGZyb250LW9yaWdpbnMnO1xuaW1wb3J0ICogYXMgc2VjcmV0c21hbmFnZXIgZnJvbSAnYXdzLWNkay1saWIvYXdzLXNlY3JldHNtYW5hZ2VyJztcbmltcG9ydCAqIGFzIHdhZnYyIGZyb20gJ2F3cy1jZGstbGliL2F3cy13YWZ2Mic7XG5pbXBvcnQgKiBhcyBzc20gZnJvbSAnYXdzLWNkay1saWIvYXdzLXNzbSc7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XG5pbXBvcnQgKiBhcyBsb2dzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sb2dzJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuXG5leHBvcnQgY2xhc3MgUHJlcmVxU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wcz86IGNkay5TdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICAvLyBFbnZpcm9ubWVudCBjb250ZXh0IGZsYWdzXG4gICAgY29uc3QgZW52ID0gdGhpcy5ub2RlLnRyeUdldENvbnRleHQoJ2VudicpID8/ICdkZXYnO1xuICAgIGNvbnN0IGlzUHJvZCA9IGVudiA9PT0gJ3Byb2QnO1xuICAgIGNvbnN0IGlzU3RhZ2UgPSBlbnYgPT09ICdzdGFnZSc7XG4gICAgXG4gICAgLy8gRGV2ZWxvcGVyIElQIGZvciBkZXYgZW52aXJvbm1lbnQgZGF0YWJhc2UgYWNjZXNzXG4gICAgY29uc3QgZGV2SVAgPSB0aGlzLm5vZGUudHJ5R2V0Q29udGV4dCgnZGV2SVAnKSB8fCAnNzAuMzAuNC4yMDcvMzInO1xuXG4gICAgLy8gVlBDIGNvbmZpZ3VyYXRpb24gYmFzZWQgb24gZW52aXJvbm1lbnRcbiAgICBjb25zdCB2cGMgPSBuZXcgZWMyLlZwYyh0aGlzLCAnUHJlcmVxVlBDJywge1xuICAgICAgbWF4QXpzOiAyLFxuICAgICAgLy8gRGV2OiBubyBOQVQgKGNvc3Qgc2F2aW5ncyksIFN0YWdlL1Byb2Q6IE5BVCBmb3Igb3V0Ym91bmQgYWNjZXNzXG4gICAgICBuYXRHYXRld2F5czogZW52ID09PSAnZGV2JyA/IDAgOiAxLFxuICAgICAgc3VibmV0Q29uZmlndXJhdGlvbjogW1xuICAgICAgICB7IG5hbWU6ICdQdWJsaWMnLCBzdWJuZXRUeXBlOiBlYzIuU3VibmV0VHlwZS5QVUJMSUMsIGNpZHJNYXNrOiAyNCB9LFxuICAgICAgICB7IG5hbWU6ICdQcml2YXRlJywgc3VibmV0VHlwZTogZWMyLlN1Ym5ldFR5cGUuUFJJVkFURV9JU09MQVRFRCwgY2lkck1hc2s6IDI0IH0sXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgLy8gVlBDIEVuZHBvaW50cyBmb3IgZGV2IGVudmlyb25tZW50IChubyBOQVQpXG4gICAgaWYgKGVudiA9PT0gJ2RldicpIHtcbiAgICAgIHZwYy5hZGRHYXRld2F5RW5kcG9pbnQoJ1MzRW5kcG9pbnQnLCB7IHNlcnZpY2U6IGVjMi5HYXRld2F5VnBjRW5kcG9pbnRBd3NTZXJ2aWNlLlMzIH0pO1xuICAgICAgdnBjLmFkZEludGVyZmFjZUVuZHBvaW50KCdTZWNyZXRzRW5kcG9pbnQnLCB7XG4gICAgICAgIHNlcnZpY2U6IGVjMi5JbnRlcmZhY2VWcGNFbmRwb2ludEF3c1NlcnZpY2UuU0VDUkVUU19NQU5BR0VSLFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gTGFtYmRhIFNlY3VyaXR5IEdyb3VwXG4gICAgY29uc3QgbGFtYmRhU2cgPSBuZXcgZWMyLlNlY3VyaXR5R3JvdXAodGhpcywgJ1ByZXJlcUxhbWJkYVNHJywge1xuICAgICAgdnBjLFxuICAgICAgZGVzY3JpcHRpb246ICdTZWN1cml0eSBncm91cCBmb3IgUFJFUkVRIExhbWJkYSBmdW5jdGlvbnMnLFxuICAgICAgYWxsb3dBbGxPdXRib3VuZDogdHJ1ZSxcbiAgICB9KTtcblxuICAgIC8vIERhdGFiYXNlIFNlY3VyaXR5IEdyb3VwIHdpdGggZW52aXJvbm1lbnQtYXdhcmUgYWNjZXNzXG4gICAgY29uc3QgZGJTZWN1cml0eUdyb3VwID0gbmV3IGVjMi5TZWN1cml0eUdyb3VwKHRoaXMsICdQcmVyZXFEQlNlY3VyaXR5R3JvdXAnLCB7XG4gICAgICB2cGMsXG4gICAgICBkZXNjcmlwdGlvbjogJ1NlY3VyaXR5IGdyb3VwIGZvciBQUkVSRVEgUkRTIGluc3RhbmNlJyxcbiAgICAgIGFsbG93QWxsT3V0Ym91bmQ6IHRydWUsXG4gICAgfSk7XG5cbiAgICAvLyBBbGxvdyBQb3N0Z3JlU1FMIGFjY2VzcyBmcm9tIExhbWJkYSAoYWxsIGVudmlyb25tZW50cylcbiAgICBkYlNlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoXG4gICAgICBsYW1iZGFTZyxcbiAgICAgIGVjMi5Qb3J0LnRjcCg1NDMyKSxcbiAgICAgICdBbGxvdyBQb3N0Z3JlU1FMIGFjY2VzcyBmcm9tIExhbWJkYSdcbiAgICApO1xuXG4gICAgLy8gRGV2IG9ubHk6IEFsbG93IGRpcmVjdCBhY2Nlc3MgZnJvbSBkZXZlbG9wZXIgSVBcbiAgICBpZiAoZW52ID09PSAnZGV2Jykge1xuICAgICAgZGJTZWN1cml0eUdyb3VwLmFkZEluZ3Jlc3NSdWxlKFxuICAgICAgICBlYzIuUGVlci5pcHY0KGRldklQKSxcbiAgICAgICAgZWMyLlBvcnQudGNwKDU0MzIpLFxuICAgICAgICAnQWxsb3cgUG9zdGdyZVNRTCBhY2Nlc3MgZnJvbSBkZXZlbG9wZXIgSVAgKGRldiBvbmx5KSdcbiAgICAgICk7XG4gICAgfVxuXG4gICAgLy8gRW52aXJvbm1lbnQtYXdhcmUgUkRTIGNvbmZpZ3VyYXRpb25cbiAgICBjb25zdCBkYXRhYmFzZSA9IG5ldyByZHMuRGF0YWJhc2VJbnN0YW5jZSh0aGlzLCAnUHJlcmVxRGF0YWJhc2UnLCB7XG4gICAgICBlbmdpbmU6IHJkcy5EYXRhYmFzZUluc3RhbmNlRW5naW5lLnBvc3RncmVzKHtcbiAgICAgICAgdmVyc2lvbjogcmRzLlBvc3RncmVzRW5naW5lVmVyc2lvbi5WRVJfMTdfNSxcbiAgICAgIH0pLFxuICAgICAgaW5zdGFuY2VUeXBlOiBlYzIuSW5zdGFuY2VUeXBlLm9mKGVjMi5JbnN0YW5jZUNsYXNzLlQzLCBlYzIuSW5zdGFuY2VTaXplLk1JQ1JPKSxcbiAgICAgIHZwYyxcbiAgICAgIHZwY1N1Ym5ldHM6IHtcbiAgICAgICAgLy8gRGV2OiBwdWJsaWMgc3VibmV0cyBmb3IgZGlyZWN0IGFjY2VzcywgU3RhZ2UvUHJvZDogcHJpdmF0ZSBpc29sYXRlZFxuICAgICAgICBzdWJuZXRUeXBlOiBlbnYgPT09ICdkZXYnID8gZWMyLlN1Ym5ldFR5cGUuUFVCTElDIDogZWMyLlN1Ym5ldFR5cGUuUFJJVkFURV9JU09MQVRFRCxcbiAgICAgIH0sXG4gICAgICBzZWN1cml0eUdyb3VwczogW2RiU2VjdXJpdHlHcm91cF0sXG4gICAgICBkYXRhYmFzZU5hbWU6ICdwcmVyZXEnLFxuICAgICAgY3JlZGVudGlhbHM6IHJkcy5DcmVkZW50aWFscy5mcm9tR2VuZXJhdGVkU2VjcmV0KCdwcmVyZXFfYWRtaW4nKSxcbiAgICAgIC8vIERldjogcHVibGljbHkgYWNjZXNzaWJsZSBmb3IgbG9jYWwgdG9vbHMsIFN0YWdlL1Byb2Q6IHByaXZhdGVcbiAgICAgIHB1YmxpY2x5QWNjZXNzaWJsZTogZW52ID09PSAnZGV2JyxcbiAgICAgIGJhY2t1cFJldGVudGlvbjogY2RrLkR1cmF0aW9uLmRheXMoNyksXG4gICAgICAvLyBQcm9kOiBlbmFibGUgZGVsZXRpb24gcHJvdGVjdGlvbiwgRGV2L1N0YWdlOiBhbGxvdyBlYXN5IGNsZWFudXBcbiAgICAgIGRlbGV0aW9uUHJvdGVjdGlvbjogaXNQcm9kLFxuICAgICAgcmVtb3ZhbFBvbGljeTogaXNQcm9kID8gY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOIDogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICB9KTtcblxuICAgIC8vIEFkZCBhdXRvbWF0aWMgc2VjcmV0IHJvdGF0aW9uIGZvciBkYXRhYmFzZVxuICAgIGRhdGFiYXNlLmFkZFJvdGF0aW9uU2luZ2xlVXNlcigpO1xuXG4gICAgLy8gUkRTIFByb3h5IGNvbmZpZ3VyYXRpb24gYmFzZWQgb24gZW52aXJvbm1lbnRcbiAgICBsZXQgZGJQcm94eTogcmRzLkRhdGFiYXNlUHJveHkgfCB1bmRlZmluZWQ7XG4gICAgbGV0IGRiRW5kcG9pbnQ6IHN0cmluZztcbiAgICBcbiAgICBpZiAoZW52ICE9PSAnZGV2Jykge1xuICAgICAgLy8gQ3JlYXRlIGVudmlyb25tZW50LXNwZWNpZmljIHNlY3VyaXR5IGdyb3VwcyBmb3IgcHJveHlcbiAgICAgIGxldCBwcm94eVNlY3VyaXR5R3JvdXBzOiBlYzIuU2VjdXJpdHlHcm91cFtdO1xuICAgICAgXG4gICAgICBpZiAoaXNTdGFnZSkge1xuICAgICAgICAvLyBTdGFnZTogQ3JlYXRlIHB1YmxpYyBzZWN1cml0eSBncm91cCBmb3IgcHJveHlcbiAgICAgICAgY29uc3QgcHJveHlQdWJsaWNTZyA9IG5ldyBlYzIuU2VjdXJpdHlHcm91cCh0aGlzLCAnUHJlcmVxUHJveHlQdWJsaWNTRycsIHtcbiAgICAgICAgICB2cGMsXG4gICAgICAgICAgZGVzY3JpcHRpb246ICdQdWJsaWMgYWNjZXNzIHNlY3VyaXR5IGdyb3VwIGZvciBSRFMgUHJveHkgKHN0YWdlIG9ubHkpJyxcbiAgICAgICAgICBhbGxvd0FsbE91dGJvdW5kOiB0cnVlLFxuICAgICAgICB9KTtcbiAgICAgICAgXG4gICAgICAgIC8vIEFsbG93IGFjY2VzcyB0byBwcm94eSBpbiBzdGFnZSBmcm9tIHlvdXIgSVAgKGNoYW5nZSB0byBhbnlJcHY0KCkgZm9yIGRlbW8gY2xpZW50cylcbiAgICAgICAgcHJveHlQdWJsaWNTZy5hZGRJbmdyZXNzUnVsZShcbiAgICAgICAgICBlYzIuUGVlci5pcHY0KGRldklQKSxcbiAgICAgICAgICBlYzIuUG9ydC50Y3AoNTQzMiksXG4gICAgICAgICAgJ0FsbG93IGFjY2VzcyB0byBSRFMgUHJveHkgZnJvbSBkZXYgSVAgKHN0YWdlIG9ubHkpJ1xuICAgICAgICApO1xuXG4gICAgICAgIC8vIFN0YWdlOiBVc2UgYm90aCBEQiBzZWN1cml0eSBncm91cCBhbmQgcHVibGljIHNlY3VyaXR5IGdyb3VwXG4gICAgICAgIHByb3h5U2VjdXJpdHlHcm91cHMgPSBbZGJTZWN1cml0eUdyb3VwLCBwcm94eVB1YmxpY1NnXTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIFByb2Q6IFVzZSBvbmx5IHRoZSBwcml2YXRlIERCIHNlY3VyaXR5IGdyb3VwXG4gICAgICAgIHByb3h5U2VjdXJpdHlHcm91cHMgPSBbZGJTZWN1cml0eUdyb3VwXTtcbiAgICAgIH1cblxuICAgICAgLy8gU3RhZ2UvUHJvZDogQ3JlYXRlIFJEUyBQcm94eSB3aXRoIGFwcHJvcHJpYXRlIHNlY3VyaXR5IGdyb3Vwc1xuICAgICAgZGJQcm94eSA9IG5ldyByZHMuRGF0YWJhc2VQcm94eSh0aGlzLCAnUHJlcmVxRGF0YWJhc2VQcm94eScsIHtcbiAgICAgICAgcHJveHlUYXJnZXQ6IHJkcy5Qcm94eVRhcmdldC5mcm9tSW5zdGFuY2UoZGF0YWJhc2UpLFxuICAgICAgICBzZWNyZXRzOiBbZGF0YWJhc2Uuc2VjcmV0IV0sXG4gICAgICAgIHZwYyxcbiAgICAgICAgdnBjU3VibmV0czoge1xuICAgICAgICAgIHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBSSVZBVEVfSVNPTEFURUQsXG4gICAgICAgIH0sXG4gICAgICAgIHNlY3VyaXR5R3JvdXBzOiBwcm94eVNlY3VyaXR5R3JvdXBzLFxuICAgICAgICByZXF1aXJlVExTOiB0cnVlLFxuICAgICAgfSk7XG4gICAgICBcbiAgICAgIGRiRW5kcG9pbnQgPSBkYlByb3h5LmVuZHBvaW50O1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBEZXY6IERpcmVjdCBkYXRhYmFzZSBjb25uZWN0aW9uXG4gICAgICBkYkVuZHBvaW50ID0gZGF0YWJhc2UuaW5zdGFuY2VFbmRwb2ludC5ob3N0bmFtZTtcbiAgICB9XG5cbiAgICAvLyBPcHRpb25hbDogU1NNIEJhc3Rpb24gZm9yIHByb2QgZGVidWdnaW5nICh0My5uYW5vKVxuICAgIGxldCBiYXN0aW9uSW5zdGFuY2U6IGVjMi5JbnN0YW5jZSB8IHVuZGVmaW5lZDtcbiAgICBpZiAoaXNQcm9kKSB7XG4gICAgICAvLyBCYXN0aW9uIHNlY3VyaXR5IGdyb3VwXG4gICAgICBjb25zdCBiYXN0aW9uU2cgPSBuZXcgZWMyLlNlY3VyaXR5R3JvdXAodGhpcywgJ1ByZXJlcUJhc3Rpb25TRycsIHtcbiAgICAgICAgdnBjLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ1NlY3VyaXR5IGdyb3VwIGZvciBQUkVSRVEgU1NNIGJhc3Rpb24nLFxuICAgICAgICBhbGxvd0FsbE91dGJvdW5kOiB0cnVlLFxuICAgICAgfSk7XG5cbiAgICAgIC8vIEJhc3Rpb24gaW5zdGFuY2UgZm9yIHBvcnQgZm9yd2FyZGluZyBpbiBwcm9kXG4gICAgICBiYXN0aW9uSW5zdGFuY2UgPSBuZXcgZWMyLkluc3RhbmNlKHRoaXMsICdQcmVyZXFCYXN0aW9uJywge1xuICAgICAgICBpbnN0YW5jZVR5cGU6IGVjMi5JbnN0YW5jZVR5cGUub2YoZWMyLkluc3RhbmNlQ2xhc3MuVDMsIGVjMi5JbnN0YW5jZVNpemUuTkFOTyksXG4gICAgICAgIG1hY2hpbmVJbWFnZTogZWMyLk1hY2hpbmVJbWFnZS5sYXRlc3RBbWF6b25MaW51eDIwMjMoKSxcbiAgICAgICAgdnBjLFxuICAgICAgICB2cGNTdWJuZXRzOiB7XG4gICAgICAgICAgc3VibmV0VHlwZTogZWMyLlN1Ym5ldFR5cGUuUFJJVkFURV9JU09MQVRFRCxcbiAgICAgICAgfSxcbiAgICAgICAgc2VjdXJpdHlHcm91cDogYmFzdGlvblNnLFxuICAgICAgICByb2xlOiBuZXcgaWFtLlJvbGUodGhpcywgJ1ByZXJlcUJhc3Rpb25Sb2xlJywge1xuICAgICAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdlYzIuYW1hem9uYXdzLmNvbScpLFxuICAgICAgICAgIG1hbmFnZWRQb2xpY2llczogW1xuICAgICAgICAgICAgaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKCdBbWF6b25TU01NYW5hZ2VkSW5zdGFuY2VDb3JlJyksXG4gICAgICAgICAgXSxcbiAgICAgICAgfSksXG4gICAgICAgIHVzZXJEYXRhOiBlYzIuVXNlckRhdGEuZm9yTGludXgoKSxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBBbGxvdyBiYXN0aW9uIHRvIGFjY2VzcyBkYXRhYmFzZVxuICAgICAgZGJTZWN1cml0eUdyb3VwLmFkZEluZ3Jlc3NSdWxlKFxuICAgICAgICBiYXN0aW9uU2csXG4gICAgICAgIGVjMi5Qb3J0LnRjcCg1NDMyKSxcbiAgICAgICAgJ0FsbG93IFBvc3RncmVTUUwgYWNjZXNzIGZyb20gYmFzdGlvbiAocHJvZCBvbmx5KSdcbiAgICAgICk7XG4gICAgfVxuXG4gICAgLy8gSldUIFNlY3JldCBpbiBTZWNyZXRzIE1hbmFnZXJcbiAgICBjb25zdCBqd3RTZWNyZXQgPSBuZXcgc2VjcmV0c21hbmFnZXIuU2VjcmV0KHRoaXMsICdKd3RTZWNyZXQnLCB7XG4gICAgICBkZXNjcmlwdGlvbjogJ0pXVCBzaWduaW5nIHNlY3JldCBmb3IgUFJFUkVRIEFQSScsXG4gICAgICBnZW5lcmF0ZVNlY3JldFN0cmluZzoge1xuICAgICAgICBleGNsdWRlUHVuY3R1YXRpb246IHRydWUsXG4gICAgICAgIHBhc3N3b3JkTGVuZ3RoOiAzMixcbiAgICAgIH0sXG4gICAgICByZW1vdmFsUG9saWN5OiBpc1Byb2QgPyBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4gOiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgIH0pO1xuXG4gICAgLy8gQWRkIG1vbnRobHkgcm90YXRpb24gZm9yIEpXVCBzZWNyZXQgaW4gcHJvZHVjdGlvblxuICAgIGlmIChpc1Byb2QpIHtcbiAgICAgIGp3dFNlY3JldC5hZGRSb3RhdGlvblNjaGVkdWxlKCdSb3RhdGVNb250aGx5Jywge1xuICAgICAgICBhdXRvbWF0aWNhbGx5QWZ0ZXI6IGNkay5EdXJhdGlvbi5kYXlzKDMwKSxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIENvZ25pdG8gVXNlciBQb29sXG4gICAgY29uc3QgdXNlclBvb2wgPSBuZXcgY29nbml0by5Vc2VyUG9vbCh0aGlzLCAnUHJlcmVxVXNlclBvb2wnLCB7XG4gICAgICB1c2VyUG9vbE5hbWU6ICdwcmVyZXEtdXNlcnMnLFxuICAgICAgc2VsZlNpZ25VcEVuYWJsZWQ6IHRydWUsXG4gICAgICBzaWduSW5BbGlhc2VzOiB7XG4gICAgICAgIGVtYWlsOiB0cnVlLFxuICAgICAgfSxcbiAgICAgIHN0YW5kYXJkQXR0cmlidXRlczoge1xuICAgICAgICBlbWFpbDoge1xuICAgICAgICAgIHJlcXVpcmVkOiB0cnVlLFxuICAgICAgICAgIG11dGFibGU6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICAgIGZ1bGxuYW1lOiB7XG4gICAgICAgICAgcmVxdWlyZWQ6IGZhbHNlLFxuICAgICAgICAgIG11dGFibGU6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgcGFzc3dvcmRQb2xpY3k6IHtcbiAgICAgICAgbWluTGVuZ3RoOiA4LFxuICAgICAgICByZXF1aXJlTG93ZXJjYXNlOiB0cnVlLFxuICAgICAgICByZXF1aXJlVXBwZXJjYXNlOiB0cnVlLFxuICAgICAgICByZXF1aXJlRGlnaXRzOiB0cnVlLFxuICAgICAgICByZXF1aXJlU3ltYm9sczogdHJ1ZSxcbiAgICAgIH0sXG4gICAgICBhY2NvdW50UmVjb3Zlcnk6IGNvZ25pdG8uQWNjb3VudFJlY292ZXJ5LkVNQUlMX09OTFksXG4gICAgfSk7XG5cbiAgICAvLyBDb2duaXRvIFVzZXIgUG9vbCBDbGllbnRcbiAgICBjb25zdCB1c2VyUG9vbENsaWVudCA9IG5ldyBjb2duaXRvLlVzZXJQb29sQ2xpZW50KHRoaXMsICdQcmVyZXFVc2VyUG9vbENsaWVudCcsIHtcbiAgICAgIHVzZXJQb29sLFxuICAgICAgdXNlclBvb2xDbGllbnROYW1lOiAncHJlcmVxLWNsaWVudCcsXG4gICAgICBnZW5lcmF0ZVNlY3JldDogZmFsc2UsXG4gICAgICBhdXRoRmxvd3M6IHtcbiAgICAgICAgYWRtaW5Vc2VyUGFzc3dvcmQ6IHRydWUsXG4gICAgICAgIHVzZXJQYXNzd29yZDogdHJ1ZSxcbiAgICAgICAgdXNlclNycDogdHJ1ZSxcbiAgICAgIH0sXG4gICAgICBvQXV0aDoge1xuICAgICAgICBmbG93czoge1xuICAgICAgICAgIGF1dGhvcml6YXRpb25Db2RlR3JhbnQ6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICAgIHNjb3BlczogW2NvZ25pdG8uT0F1dGhTY29wZS5FTUFJTCwgY29nbml0by5PQXV0aFNjb3BlLk9QRU5JRCwgY29nbml0by5PQXV0aFNjb3BlLlBST0ZJTEVdLFxuICAgICAgICBjYWxsYmFja1VybHM6IFsnaHR0cDovL2xvY2FsaG9zdDo1MTczL2NhbGxiYWNrJywgJ2h0dHBzOi8veW91ci1kb21haW4uY29tL2NhbGxiYWNrJ10sXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gRW52aXJvbm1lbnQtc3BlY2lmaWMgdGhyb3R0bGluZyByYXRlc1xuICAgIGNvbnN0IHRocm90dGxlQ29uZmlnID0ge1xuICAgICAgZGV2OiB7IHJhdGU6IHVuZGVmaW5lZCwgYnVyc3Q6IHVuZGVmaW5lZCB9LCAvLyBVbmxpbWl0ZWRcbiAgICAgIHN0YWdlOiB7IHJhdGU6IDIwLCBidXJzdDogMTAgfSxcbiAgICAgIHByb2Q6IHsgcmF0ZTogNTAsIGJ1cnN0OiAyMCB9XG4gICAgfTtcblxuICAgIGNvbnN0IGN1cnJlbnRUaHJvdHRsZSA9IHRocm90dGxlQ29uZmlnW2VudiBhcyBrZXlvZiB0eXBlb2YgdGhyb3R0bGVDb25maWddO1xuXG4gICAgLy8gTGFtYmRhIEZ1bmN0aW9uIHVzaW5nIHJlZ3VsYXIgRnVuY3Rpb24gKG5vIERvY2tlciByZXF1aXJlZClcbiAgICAvLyBXaGVuIHN3aXRjaGluZyBiYWNrIHRvIE5vZGVqc0Z1bmN0aW9uLCBjb25zaWRlcjpcbiAgICAvLyBidW5kbGluZzogeyBleHRlcm5hbE1vZHVsZXM6IFsnQG5lc3Rqcy8qJywgJ3BnJ10gfVxuICAgIGNvbnN0IGFwaUxhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ1ByZXJlcUFQSUxhbWJkYScsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xOF9YLFxuICAgICAgaGFuZGxlcjogJ21haW4uaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJy4uL2JhY2tlbmQvZGlzdCcpLFxuICAgICAgdnBjLFxuICAgICAgc2VjdXJpdHlHcm91cHM6IFtsYW1iZGFTZ10sXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBEQl9TRUNSRVRfQVJOOiBkYXRhYmFzZS5zZWNyZXQhLnNlY3JldEFybixcbiAgICAgICAgREJfSE9TVDogZGJFbmRwb2ludCxcbiAgICAgICAgLi4uKGRiUHJveHkgJiYgeyBEQl9QUk9YWV9FTkRQT0lOVDogZGJQcm94eS5lbmRwb2ludCB9KSxcbiAgICAgICAgSldUX1NFQ1JFVF9BUk46IGp3dFNlY3JldC5zZWNyZXRBcm4sXG4gICAgICAgIENPR05JVE9fVVNFUl9QT09MX0lEOiB1c2VyUG9vbC51c2VyUG9vbElkLFxuICAgICAgICBDT0dOSVRPX0NMSUVOVF9JRDogdXNlclBvb2xDbGllbnQudXNlclBvb2xDbGllbnRJZCxcbiAgICAgICAgTk9ERV9FTlY6IGVudixcbiAgICAgIH0sXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICBtZW1vcnlTaXplOiA1MTIsXG4gICAgfSk7XG5cbiAgICAvLyBMYW1iZGEgbG9nIGdyb3VwIHdpdGggc3ltbWV0cmljIHJldGVudGlvblxuICAgIG5ldyBsb2dzLkxvZ0dyb3VwKHRoaXMsICdQcmVyZXFBUElMYW1iZGFMb2dzJywge1xuICAgICAgbG9nR3JvdXBOYW1lOiBgL2F3cy9sYW1iZGEvJHthcGlMYW1iZGEuZnVuY3Rpb25OYW1lfWAsXG4gICAgICByZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfTU9OVEgsXG4gICAgfSk7XG5cbiAgICAvLyBHcmFudCBMYW1iZGEgYWNjZXNzIHRvIGRhdGFiYXNlL3Byb3h5IGFuZCBzZWNyZXRzXG4gICAgaWYgKGRiUHJveHkpIHtcbiAgICAgIGRiUHJveHkuZ3JhbnRDb25uZWN0KGFwaUxhbWJkYSwgJ3ByZXJlcV9hZG1pbicpO1xuICAgIH0gZWxzZSB7XG4gICAgICBkYXRhYmFzZS5ncmFudENvbm5lY3QoYXBpTGFtYmRhKTtcbiAgICB9XG4gICAgZGF0YWJhc2Uuc2VjcmV0Py5ncmFudFJlYWQoYXBpTGFtYmRhKTtcbiAgICBqd3RTZWNyZXQuZ3JhbnRSZWFkKGFwaUxhbWJkYSk7XG5cbiAgICAvLyBBY2Nlc3MtbG9nIGdyb3VwXG4gICAgY29uc3QgYXBpTG9ncyA9IG5ldyBsb2dzLkxvZ0dyb3VwKHRoaXMsICdQcmVyZXFBcGlMb2dzJywge1xuICAgICAgcmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX01PTlRILFxuICAgIH0pO1xuXG4gICAgLy8gQVBJIEdhdGV3YXkgd2l0aCBlbnZpcm9ubWVudC1zcGVjaWZpYyB0aHJvdHRsaW5nXG4gICAgY29uc3QgZGVwbG95T3B0aW9uczogYW55ID0ge1xuICAgICAgc3RhZ2VOYW1lOiBlbnYsXG4gICAgICBtZXRyaWNzRW5hYmxlZDogdHJ1ZSxcbiAgICAgIGxvZ2dpbmdMZXZlbDogYXBpZ2F0ZXdheS5NZXRob2RMb2dnaW5nTGV2ZWwuSU5GTyxcbiAgICAgIGFjY2Vzc0xvZ0Rlc3RpbmF0aW9uOiBuZXcgYXBpZ2F0ZXdheS5Mb2dHcm91cExvZ0Rlc3RpbmF0aW9uKGFwaUxvZ3MpLFxuICAgICAgYWNjZXNzTG9nRm9ybWF0OiBhcGlnYXRld2F5LkFjY2Vzc0xvZ0Zvcm1hdC5qc29uV2l0aFN0YW5kYXJkRmllbGRzKHtcbiAgICAgICAgY2FsbGVyOiB0cnVlLFxuICAgICAgICBodHRwTWV0aG9kOiB0cnVlLFxuICAgICAgICBpcDogdHJ1ZSxcbiAgICAgICAgcHJvdG9jb2w6IHRydWUsXG4gICAgICAgIHJlcXVlc3RUaW1lOiB0cnVlLFxuICAgICAgICByZXNvdXJjZVBhdGg6IHRydWUsXG4gICAgICAgIHJlc3BvbnNlTGVuZ3RoOiB0cnVlLFxuICAgICAgICBzdGF0dXM6IHRydWUsXG4gICAgICAgIHVzZXI6IHRydWUsXG4gICAgICB9KSxcbiAgICB9O1xuXG4gICAgLy8gQWRkIHRocm90dGxpbmcgb25seSBmb3Igc3RhZ2UvcHJvZFxuICAgIGlmIChjdXJyZW50VGhyb3R0bGUucmF0ZSAmJiBjdXJyZW50VGhyb3R0bGUuYnVyc3QpIHtcbiAgICAgIGRlcGxveU9wdGlvbnMudGhyb3R0bGluZ1JhdGVMaW1pdCA9IGN1cnJlbnRUaHJvdHRsZS5yYXRlO1xuICAgICAgZGVwbG95T3B0aW9ucy50aHJvdHRsaW5nQnVyc3RMaW1pdCA9IGN1cnJlbnRUaHJvdHRsZS5idXJzdDtcbiAgICB9XG5cbiAgICBjb25zdCBhcGkgPSBuZXcgYXBpZ2F0ZXdheS5SZXN0QXBpKHRoaXMsICdQcmVyZXFBUEknLCB7XG4gICAgICByZXN0QXBpTmFtZTogJ1BSRVJFUSBBUEknLFxuICAgICAgZGVzY3JpcHRpb246ICdQUkVSRVEgUHJvamVjdCBNYW5hZ2VtZW50IEFQSScsXG4gICAgICBkZWZhdWx0Q29yc1ByZWZsaWdodE9wdGlvbnM6IHtcbiAgICAgICAgYWxsb3dPcmlnaW5zOiBhcGlnYXRld2F5LkNvcnMuQUxMX09SSUdJTlMsXG4gICAgICAgIGFsbG93TWV0aG9kczogYXBpZ2F0ZXdheS5Db3JzLkFMTF9NRVRIT0RTLFxuICAgICAgICBhbGxvd0hlYWRlcnM6IFsnQ29udGVudC1UeXBlJywgJ0F1dGhvcml6YXRpb24nXSxcbiAgICAgIH0sXG4gICAgICBkZXBsb3lPcHRpb25zLFxuICAgIH0pO1xuXG4gICAgLy8gQVBJIEdhdGV3YXkgSW50ZWdyYXRpb25cbiAgICBjb25zdCBpbnRlZ3JhdGlvbiA9IG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGFwaUxhbWJkYSk7XG5cbiAgICAvLyBBUEkgUm91dGVzXG4gICAgYXBpLnJvb3QuYWRkUHJveHkoe1xuICAgICAgZGVmYXVsdEludGVncmF0aW9uOiBpbnRlZ3JhdGlvbixcbiAgICAgIGFueU1ldGhvZDogdHJ1ZSxcbiAgICB9KTtcblxuICAgIC8vIFdBRiBmb3Igc3RhZ2UvcHJvZCBvbmx5IChkZXYgaGFzIG5vIFdBRilcbiAgICBpZiAoZW52ICE9PSAnZGV2Jykge1xuICAgICAgY29uc3Qgd2ViQWNsID0gbmV3IHdhZnYyLkNmbldlYkFDTCh0aGlzLCAnQXBpV2FmJywge1xuICAgICAgICBkZWZhdWx0QWN0aW9uOiB7IGFsbG93OiB7fSB9LFxuICAgICAgICBzY29wZTogJ1JFR0lPTkFMJyxcbiAgICAgICAgdmlzaWJpbGl0eUNvbmZpZzoge1xuICAgICAgICAgIGNsb3VkV2F0Y2hNZXRyaWNzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICBtZXRyaWNOYW1lOiAnUHJlcmVxQXBpV2FmJyxcbiAgICAgICAgICBzYW1wbGVkUmVxdWVzdHNFbmFibGVkOiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgICBuYW1lOiAnUHJlcmVxQXBpV2FmJyxcbiAgICAgICAgcnVsZXM6IFtcbiAgICAgICAgICB7XG4gICAgICAgICAgICBuYW1lOiAnQVdTLUFXU01hbmFnZWRDb21tb25SdWxlU2V0JyxcbiAgICAgICAgICAgIHByaW9yaXR5OiAwLFxuICAgICAgICAgICAgc3RhdGVtZW50OiB7IG1hbmFnZWRSdWxlR3JvdXBTdGF0ZW1lbnQ6IHtcbiAgICAgICAgICAgICAgbmFtZTogJ0FXU01hbmFnZWRSdWxlc0NvbW1vblJ1bGVTZXQnLFxuICAgICAgICAgICAgICB2ZW5kb3JOYW1lOiAnQVdTJyxcbiAgICAgICAgICAgIH19LFxuICAgICAgICAgICAgb3ZlcnJpZGVBY3Rpb246IHsgbm9uZToge30gfSxcbiAgICAgICAgICAgIHZpc2liaWxpdHlDb25maWc6IHtcbiAgICAgICAgICAgICAgY2xvdWRXYXRjaE1ldHJpY3NFbmFibGVkOiB0cnVlLFxuICAgICAgICAgICAgICBtZXRyaWNOYW1lOiAnQ29tbW9uUnVsZXMnLFxuICAgICAgICAgICAgICBzYW1wbGVkUmVxdWVzdHNFbmFibGVkOiB0cnVlLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIG5hbWU6ICdJcFJhdGVMaW1pdCcsXG4gICAgICAgICAgICBwcmlvcml0eTogMSxcbiAgICAgICAgICAgIHN0YXRlbWVudDoge1xuICAgICAgICAgICAgICByYXRlQmFzZWRTdGF0ZW1lbnQ6IHtcbiAgICAgICAgICAgICAgICBsaW1pdDogMjAwMCwgICAgICAgICAvLyAyMDAwIHJlcXVlc3RzIGluIDUgbWluIHBlciBJUFxuICAgICAgICAgICAgICAgIGFnZ3JlZ2F0ZUtleVR5cGU6ICdJUCcsXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgYWN0aW9uOiB7IGJsb2NrOiB7fSB9LFxuICAgICAgICAgICAgdmlzaWJpbGl0eUNvbmZpZzoge1xuICAgICAgICAgICAgICBjbG91ZFdhdGNoTWV0cmljc0VuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgICAgIG1ldHJpY05hbWU6ICdJcFJhdGVMaW1pdCcsXG4gICAgICAgICAgICAgIHNhbXBsZWRSZXF1ZXN0c0VuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIF0sXG4gICAgICB9KTtcblxuICAgICAgLy8gQXNzb2NpYXRlIFdBRiB3aXRoIEFQSSBHYXRld2F5XG4gICAgICBuZXcgd2FmdjIuQ2ZuV2ViQUNMQXNzb2NpYXRpb24odGhpcywgJ0FwaVdhZkFzc29jJywge1xuICAgICAgICB3ZWJBY2xBcm46IHdlYkFjbC5hdHRyQXJuLFxuICAgICAgICByZXNvdXJjZUFybjogYXBpLmRlcGxveW1lbnRTdGFnZS5zdGFnZUFybixcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIFByaXZhdGUgUzMgQnVja2V0IGZvciBGcm9udGVuZFxuICAgIGNvbnN0IGZyb250ZW5kQnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCAnUHJlcmVxRnJvbnRlbmRCdWNrZXQnLCB7XG4gICAgICBidWNrZXROYW1lOiBgcHJlcmVxLWZyb250ZW5kLSR7ZW52fS0ke3RoaXMuYWNjb3VudH0tJHt0aGlzLnJlZ2lvbn1gLFxuICAgICAgcHVibGljUmVhZEFjY2VzczogZmFsc2UsXG4gICAgICBibG9ja1B1YmxpY0FjY2VzczogczMuQmxvY2tQdWJsaWNBY2Nlc3MuQkxPQ0tfQUxMLFxuICAgICAgcmVtb3ZhbFBvbGljeTogaXNQcm9kID8gY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOIDogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIGF1dG9EZWxldGVPYmplY3RzOiAhaXNQcm9kLFxuICAgIH0pO1xuXG4gICAgLy8gQ2xvdWRGcm9udCBPcmlnaW4gQWNjZXNzIElkZW50aXR5XG4gICAgY29uc3Qgb3JpZ2luQWNjZXNzSWRlbnRpdHkgPSBuZXcgY2xvdWRmcm9udC5PcmlnaW5BY2Nlc3NJZGVudGl0eSh0aGlzLCAnUHJlcmVxT0FJJywge1xuICAgICAgY29tbWVudDogJ09BSSBmb3IgUFJFUkVRIGZyb250ZW5kIGJ1Y2tldCcsXG4gICAgfSk7XG5cbiAgICAvLyBHcmFudCBDbG91ZEZyb250IHJlYWQgYWNjZXNzIHRvIHRoZSBidWNrZXRcbiAgICBmcm9udGVuZEJ1Y2tldC5ncmFudFJlYWQob3JpZ2luQWNjZXNzSWRlbnRpdHkpO1xuXG4gICAgLy8gQ2xvdWRGcm9udCBEaXN0cmlidXRpb24gd2l0aCBTUEEtb3B0aW1pemVkIGNhY2hpbmdcbiAgICBjb25zdCBkaXN0cmlidXRpb24gPSBuZXcgY2xvdWRmcm9udC5EaXN0cmlidXRpb24odGhpcywgJ1ByZXJlcURpc3RyaWJ1dGlvbicsIHtcbiAgICAgIGRlZmF1bHRCZWhhdmlvcjoge1xuICAgICAgICBvcmlnaW46IG9yaWdpbnMuUzNCdWNrZXRPcmlnaW4ud2l0aE9yaWdpbkFjY2Vzc0lkZW50aXR5KGZyb250ZW5kQnVja2V0LCB7XG4gICAgICAgICAgb3JpZ2luQWNjZXNzSWRlbnRpdHksXG4gICAgICAgIH0pLFxuICAgICAgICB2aWV3ZXJQcm90b2NvbFBvbGljeTogY2xvdWRmcm9udC5WaWV3ZXJQcm90b2NvbFBvbGljeS5SRURJUkVDVF9UT19IVFRQUyxcbiAgICAgICAgYWxsb3dlZE1ldGhvZHM6IGNsb3VkZnJvbnQuQWxsb3dlZE1ldGhvZHMuQUxMT1dfQUxMLFxuICAgICAgICBjYWNoZWRNZXRob2RzOiBjbG91ZGZyb250LkNhY2hlZE1ldGhvZHMuQ0FDSEVfR0VUX0hFQURfT1BUSU9OUyxcbiAgICAgICAgY2FjaGVQb2xpY3k6IGNsb3VkZnJvbnQuQ2FjaGVQb2xpY3kuQ0FDSElOR19ESVNBQkxFRCxcbiAgICAgIH0sXG4gICAgICBkZWZhdWx0Um9vdE9iamVjdDogJ2luZGV4Lmh0bWwnLFxuICAgICAgZXJyb3JSZXNwb25zZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIGh0dHBTdGF0dXM6IDQwNCxcbiAgICAgICAgICByZXNwb25zZUh0dHBTdGF0dXM6IDIwMCxcbiAgICAgICAgICByZXNwb25zZVBhZ2VQYXRoOiAnL2luZGV4Lmh0bWwnLFxuICAgICAgICAgIHR0bDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMCksIC8vIE5vIGNhY2hpbmcgZm9yIFNQQSByb3V0ZXNcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIGh0dHBTdGF0dXM6IDQwMyxcbiAgICAgICAgICByZXNwb25zZUh0dHBTdGF0dXM6IDIwMCxcbiAgICAgICAgICByZXNwb25zZVBhZ2VQYXRoOiAnL2luZGV4Lmh0bWwnLFxuICAgICAgICAgIHR0bDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMCksIC8vIE5vIGNhY2hpbmcgZm9yIFNQQSByb3V0ZXNcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICAvLyBTdG9yZSBzZW5zaXRpdmUgdmFsdWVzIGluIFNTTSBQYXJhbWV0ZXJzXG4gICAgbmV3IHNzbS5TdHJpbmdQYXJhbWV0ZXIodGhpcywgJ0RhdGFiYXNlRW5kcG9pbnRQYXJhbScsIHtcbiAgICAgIHBhcmFtZXRlck5hbWU6IGAvcHJlcmVxLyR7ZW52fS9kYXRhYmFzZS9lbmRwb2ludGAsXG4gICAgICBzdHJpbmdWYWx1ZTogZGF0YWJhc2UuaW5zdGFuY2VFbmRwb2ludC5ob3N0bmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiBgUkRTIERhdGFiYXNlIEVuZHBvaW50ICgke2Vudn0pYCxcbiAgICB9KTtcblxuICAgIGlmIChkYlByb3h5KSB7XG4gICAgICBuZXcgc3NtLlN0cmluZ1BhcmFtZXRlcih0aGlzLCAnRGF0YWJhc2VQcm94eUVuZHBvaW50UGFyYW0nLCB7XG4gICAgICAgIHBhcmFtZXRlck5hbWU6IGAvcHJlcmVxLyR7ZW52fS9kYXRhYmFzZS9wcm94eS1lbmRwb2ludGAsXG4gICAgICAgIHN0cmluZ1ZhbHVlOiBkYlByb3h5LmVuZHBvaW50LFxuICAgICAgICBkZXNjcmlwdGlvbjogYFJEUyBQcm94eSBFbmRwb2ludCAoJHtlbnZ9KWAsXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBuZXcgc3NtLlN0cmluZ1BhcmFtZXRlcih0aGlzLCAnRGF0YWJhc2VTZWNyZXRBcm5QYXJhbScsIHtcbiAgICAgIHBhcmFtZXRlck5hbWU6IGAvcHJlcmVxLyR7ZW52fS9kYXRhYmFzZS9zZWNyZXQtYXJuYCxcbiAgICAgIHN0cmluZ1ZhbHVlOiBkYXRhYmFzZS5zZWNyZXQ/LnNlY3JldEFybiB8fCAnJyxcbiAgICAgIGRlc2NyaXB0aW9uOiBgUkRTIERhdGFiYXNlIFNlY3JldCBBUk4gKCR7ZW52fSlgLFxuICAgIH0pO1xuXG4gICAgbmV3IHNzbS5TdHJpbmdQYXJhbWV0ZXIodGhpcywgJ0p3dFNlY3JldEFyblBhcmFtJywge1xuICAgICAgcGFyYW1ldGVyTmFtZTogYC9wcmVyZXEvJHtlbnZ9L2p3dC9zZWNyZXQtYXJuYCxcbiAgICAgIHN0cmluZ1ZhbHVlOiBqd3RTZWNyZXQuc2VjcmV0QXJuLFxuICAgICAgZGVzY3JpcHRpb246IGBKV1QgU2VjcmV0IEFSTiAoJHtlbnZ9KWAsXG4gICAgfSk7XG5cbiAgICBuZXcgc3NtLlN0cmluZ1BhcmFtZXRlcih0aGlzLCAnQ29nbml0b1VzZXJQb29sSWRQYXJhbScsIHtcbiAgICAgIHBhcmFtZXRlck5hbWU6IGAvcHJlcmVxLyR7ZW52fS9jb2duaXRvL3VzZXItcG9vbC1pZGAsXG4gICAgICBzdHJpbmdWYWx1ZTogdXNlclBvb2wudXNlclBvb2xJZCxcbiAgICAgIGRlc2NyaXB0aW9uOiBgQ29nbml0byBVc2VyIFBvb2wgSUQgKCR7ZW52fSlgLFxuICAgIH0pO1xuXG4gICAgbmV3IHNzbS5TdHJpbmdQYXJhbWV0ZXIodGhpcywgJ0NvZ25pdG9DbGllbnRJZFBhcmFtJywge1xuICAgICAgcGFyYW1ldGVyTmFtZTogYC9wcmVyZXEvJHtlbnZ9L2NvZ25pdG8vY2xpZW50LWlkYCxcbiAgICAgIHN0cmluZ1ZhbHVlOiB1c2VyUG9vbENsaWVudC51c2VyUG9vbENsaWVudElkLFxuICAgICAgZGVzY3JpcHRpb246IGBDb2duaXRvIFVzZXIgUG9vbCBDbGllbnQgSUQgKCR7ZW52fSlgLFxuICAgIH0pO1xuXG4gICAgLy8gRW52aXJvbm1lbnQtc3BlY2lmaWMgb3V0cHV0c1xuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdFbnZpcm9ubWVudCcsIHtcbiAgICAgIHZhbHVlOiBlbnYsXG4gICAgICBkZXNjcmlwdGlvbjogJ0RlcGxveW1lbnQgZW52aXJvbm1lbnQnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0RhdGFiYXNlQ29uZmlndXJhdGlvbicsIHtcbiAgICAgIHZhbHVlOiBlbnYgPT09ICdkZXYnIFxuICAgICAgICA/ICdQdWJsaWMgZGF0YWJhc2UgKGRpcmVjdCBhY2Nlc3MpJyBcbiAgICAgICAgOiBpc1N0YWdlIFxuICAgICAgICAgID8gJ1ByaXZhdGUgZGF0YWJhc2UgKyBwdWJsaWMgcHJveHknXG4gICAgICAgICAgOiAnUHJpdmF0ZSBkYXRhYmFzZSArIHByaXZhdGUgcHJveHknLFxuICAgICAgZGVzY3JpcHRpb246ICdEYXRhYmFzZSBhY2Nlc3MgY29uZmlndXJhdGlvbicsXG4gICAgfSk7XG5cbiAgICBpZiAoY3VycmVudFRocm90dGxlLnJhdGUgJiYgY3VycmVudFRocm90dGxlLmJ1cnN0KSB7XG4gICAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnVGhyb3R0bGluZ0NvbmZpZ3VyYXRpb24nLCB7XG4gICAgICAgIHZhbHVlOiBgJHtjdXJyZW50VGhyb3R0bGUucmF0ZX0vJHtjdXJyZW50VGhyb3R0bGUuYnVyc3R9IChyYXRlL2J1cnN0KWAsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnQVBJIEdhdGV3YXkgdGhyb3R0bGluZyBsaW1pdHMnLFxuICAgICAgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdUaHJvdHRsaW5nQ29uZmlndXJhdGlvbicsIHtcbiAgICAgICAgdmFsdWU6ICdVbmxpbWl0ZWQnLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ0FQSSBHYXRld2F5IHRocm90dGxpbmcgbGltaXRzJyxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdXQUZQcm90ZWN0aW9uJywge1xuICAgICAgdmFsdWU6IGVudiA9PT0gJ2RldicgPyAnRGlzYWJsZWQnIDogJ0VuYWJsZWQnLFxuICAgICAgZGVzY3JpcHRpb246ICdXQUYgcHJvdGVjdGlvbiBzdGF0dXMnLFxuICAgIH0pO1xuXG4gICAgaWYgKGJhc3Rpb25JbnN0YW5jZSkge1xuICAgICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0Jhc3Rpb25JbnN0YW5jZUlkJywge1xuICAgICAgICB2YWx1ZTogYmFzdGlvbkluc3RhbmNlLmluc3RhbmNlSWQsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnQmFzdGlvbiBpbnN0YW5jZSBJRCBmb3IgU1NNIHBvcnQgZm9yd2FyZGluZyAocHJvZCBvbmx5KScsXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnRGF0YWJhc2VFbmRwb2ludCcsIHtcbiAgICAgIHZhbHVlOiBpc1Byb2QgPyAnPHJlZGFjdGVkPicgOiBkYXRhYmFzZS5pbnN0YW5jZUVuZHBvaW50Lmhvc3RuYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdEaXJlY3QgZGF0YWJhc2UgZW5kcG9pbnQnLFxuICAgIH0pO1xuXG4gICAgaWYgKGRiUHJveHkpIHtcbiAgICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdEYXRhYmFzZVByb3h5RW5kcG9pbnQnLCB7XG4gICAgICAgIHZhbHVlOiBpc1Byb2QgPyAnPHJlZGFjdGVkPicgOiBkYlByb3h5LmVuZHBvaW50LFxuICAgICAgICBkZXNjcmlwdGlvbjogJ1JEUyBQcm94eSBlbmRwb2ludCcsXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBTdGFuZGFyZCBvdXRwdXRzXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1VzZXJQb29sSWQnLCB7XG4gICAgICB2YWx1ZTogdXNlclBvb2wudXNlclBvb2xJZCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ29nbml0byBVc2VyIFBvb2wgSUQnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1VzZXJQb29sQ2xpZW50SWQnLCB7XG4gICAgICB2YWx1ZTogdXNlclBvb2xDbGllbnQudXNlclBvb2xDbGllbnRJZCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ29nbml0byBVc2VyIFBvb2wgQ2xpZW50IElEJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdBcGlVcmwnLCB7XG4gICAgICB2YWx1ZTogYXBpLnVybCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQVBJIEdhdGV3YXkgVVJMJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdGcm9udGVuZFVybCcsIHtcbiAgICAgIHZhbHVlOiBgaHR0cHM6Ly8ke2Rpc3RyaWJ1dGlvbi5kaXN0cmlidXRpb25Eb21haW5OYW1lfWAsXG4gICAgICBkZXNjcmlwdGlvbjogJ0Nsb3VkRnJvbnQgRGlzdHJpYnV0aW9uIFVSTCcsXG4gICAgfSk7XG4gIH1cbn0gIl19