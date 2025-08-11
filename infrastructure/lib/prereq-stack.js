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
            handler: 'lambda.handler',
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJlcmVxLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsicHJlcmVxLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLG1DQUFtQztBQUNuQywyQ0FBMkM7QUFDM0MsMkNBQTJDO0FBQzNDLGlEQUFpRDtBQUNqRCx5REFBeUQ7QUFDekQsbURBQW1EO0FBQ25ELHlDQUF5QztBQUN6Qyx5REFBeUQ7QUFDekQsOERBQThEO0FBQzlELGlFQUFpRTtBQUNqRSwrQ0FBK0M7QUFDL0MsMkNBQTJDO0FBQzNDLDJDQUEyQztBQUMzQyw2Q0FBNkM7QUFFN0MsNkJBQTZCO0FBRTdCLE1BQWEsV0FBWSxTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQ3hDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBc0I7O1FBQzlELEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLDRCQUE0QjtRQUM1QixNQUFNLEdBQUcsR0FBRyxNQUFBLElBQUksQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxtQ0FBSSxLQUFLLENBQUM7UUFDcEQsTUFBTSxNQUFNLEdBQUcsR0FBRyxLQUFLLE1BQU0sQ0FBQztRQUM5QixNQUFNLE9BQU8sR0FBRyxHQUFHLEtBQUssT0FBTyxDQUFDO1FBRWhDLG1EQUFtRDtRQUNuRCxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxPQUFPLENBQUMsSUFBSSxnQkFBZ0IsQ0FBQztRQUVuRSx5Q0FBeUM7UUFDekMsTUFBTSxHQUFHLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxXQUFXLEVBQUU7WUFDekMsTUFBTSxFQUFFLENBQUM7WUFDVCxrRUFBa0U7WUFDbEUsV0FBVyxFQUFFLEdBQUcsS0FBSyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNsQyxtQkFBbUIsRUFBRTtn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LEVBQUU7Z0JBQy9DLEtBQUssRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLFFBQVE7Z0JBQy9DLFdBQVcsRUFBRSxvQkFBb0I7YUFDbEMsQ0FBQyxDQUFDO1FBQ0wsQ0FBQztRQUVELG1CQUFtQjtRQUNuQixJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLFlBQVksRUFBRTtZQUNwQyxLQUFLLEVBQUUsUUFBUSxDQUFDLFVBQVU7WUFDMUIsV0FBVyxFQUFFLHNCQUFzQjtTQUNwQyxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLGtCQUFrQixFQUFFO1lBQzFDLEtBQUssRUFBRSxjQUFjLENBQUMsZ0JBQWdCO1lBQ3RDLFdBQVcsRUFBRSw2QkFBNkI7U0FDM0MsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxRQUFRLEVBQUU7WUFDaEMsS0FBSyxFQUFFLEdBQUcsQ0FBQyxHQUFHO1lBQ2QsV0FBVyxFQUFFLGlCQUFpQjtTQUMvQixDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLGFBQWEsRUFBRTtZQUNyQyxLQUFLLEVBQUUsV0FBVyxZQUFZLENBQUMsc0JBQXNCLEVBQUU7WUFDdkQsV0FBVyxFQUFFLDZCQUE2QjtTQUMzQyxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUF6aEJELGtDQXloQkMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0ICogYXMgcmRzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1yZHMnO1xuaW1wb3J0ICogYXMgZWMyIGZyb20gJ2F3cy1jZGstbGliL2F3cy1lYzInO1xuaW1wb3J0ICogYXMgbGFtYmRhIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sYW1iZGEnO1xuaW1wb3J0ICogYXMgYXBpZ2F0ZXdheSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtYXBpZ2F0ZXdheSc7XG5pbXBvcnQgKiBhcyBjb2duaXRvIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jb2duaXRvJztcbmltcG9ydCAqIGFzIHMzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zMyc7XG5pbXBvcnQgKiBhcyBjbG91ZGZyb250IGZyb20gJ2F3cy1jZGstbGliL2F3cy1jbG91ZGZyb250JztcbmltcG9ydCAqIGFzIG9yaWdpbnMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWNsb3VkZnJvbnQtb3JpZ2lucyc7XG5pbXBvcnQgKiBhcyBzZWNyZXRzbWFuYWdlciBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc2VjcmV0c21hbmFnZXInO1xuaW1wb3J0ICogYXMgd2FmdjIgZnJvbSAnYXdzLWNkay1saWIvYXdzLXdhZnYyJztcbmltcG9ydCAqIGFzIHNzbSBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc3NtJztcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcbmltcG9ydCAqIGFzIGxvZ3MgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxvZ3MnO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuXG5leHBvcnQgY2xhc3MgUHJlcmVxU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wcz86IGNkay5TdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICAvLyBFbnZpcm9ubWVudCBjb250ZXh0IGZsYWdzXG4gICAgY29uc3QgZW52ID0gdGhpcy5ub2RlLnRyeUdldENvbnRleHQoJ2VudicpID8/ICdkZXYnO1xuICAgIGNvbnN0IGlzUHJvZCA9IGVudiA9PT0gJ3Byb2QnO1xuICAgIGNvbnN0IGlzU3RhZ2UgPSBlbnYgPT09ICdzdGFnZSc7XG4gICAgXG4gICAgLy8gRGV2ZWxvcGVyIElQIGZvciBkZXYgZW52aXJvbm1lbnQgZGF0YWJhc2UgYWNjZXNzXG4gICAgY29uc3QgZGV2SVAgPSB0aGlzLm5vZGUudHJ5R2V0Q29udGV4dCgnZGV2SVAnKSB8fCAnNzAuMzAuNC4yMDcvMzInO1xuXG4gICAgLy8gVlBDIGNvbmZpZ3VyYXRpb24gYmFzZWQgb24gZW52aXJvbm1lbnRcbiAgICBjb25zdCB2cGMgPSBuZXcgZWMyLlZwYyh0aGlzLCAnUHJlcmVxVlBDJywge1xuICAgICAgbWF4QXpzOiAyLFxuICAgICAgLy8gRGV2OiBubyBOQVQgKGNvc3Qgc2F2aW5ncyksIFN0YWdlL1Byb2Q6IE5BVCBmb3Igb3V0Ym91bmQgYWNjZXNzXG4gICAgICBuYXRHYXRld2F5czogZW52ID09PSAnZGV2JyA/IDAgOiAxLFxuICAgICAgc3VibmV0Q29uZmlndXJhdGlvbjogW1xuICAgICAgICB7IG5hbWU6ICdQdWJsaWMnLCBzdWJuZXRUeXBlOiBlYzIuU3VibmV0VHlwZS5QVUJMSUMsIGNpZHJNYXNrOiAyNCB9LFxuICAgICAgICB7IG5hbWU6ICdQcml2YXRlJywgc3VibmV0VHlwZTogZWMyLlN1Ym5ldFR5cGUuUFJJVkFURV9JU09MQVRFRCwgY2lkck1hc2s6IDI0IH0sXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgLy8gVlBDIEVuZHBvaW50cyBmb3IgZGV2IGVudmlyb25tZW50IChubyBOQVQpXG4gICAgaWYgKGVudiA9PT0gJ2RldicpIHtcbiAgICAgIHZwYy5hZGRHYXRld2F5RW5kcG9pbnQoJ1MzRW5kcG9pbnQnLCB7IHNlcnZpY2U6IGVjMi5HYXRld2F5VnBjRW5kcG9pbnRBd3NTZXJ2aWNlLlMzIH0pO1xuICAgICAgdnBjLmFkZEludGVyZmFjZUVuZHBvaW50KCdTZWNyZXRzRW5kcG9pbnQnLCB7XG4gICAgICAgIHNlcnZpY2U6IGVjMi5JbnRlcmZhY2VWcGNFbmRwb2ludEF3c1NlcnZpY2UuU0VDUkVUU19NQU5BR0VSLFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gTGFtYmRhIFNlY3VyaXR5IEdyb3VwXG4gICAgY29uc3QgbGFtYmRhU2cgPSBuZXcgZWMyLlNlY3VyaXR5R3JvdXAodGhpcywgJ1ByZXJlcUxhbWJkYVNHJywge1xuICAgICAgdnBjLFxuICAgICAgZGVzY3JpcHRpb246ICdTZWN1cml0eSBncm91cCBmb3IgUFJFUkVRIExhbWJkYSBmdW5jdGlvbnMnLFxuICAgICAgYWxsb3dBbGxPdXRib3VuZDogdHJ1ZSxcbiAgICB9KTtcblxuICAgIC8vIERhdGFiYXNlIFNlY3VyaXR5IEdyb3VwIHdpdGggZW52aXJvbm1lbnQtYXdhcmUgYWNjZXNzXG4gICAgY29uc3QgZGJTZWN1cml0eUdyb3VwID0gbmV3IGVjMi5TZWN1cml0eUdyb3VwKHRoaXMsICdQcmVyZXFEQlNlY3VyaXR5R3JvdXAnLCB7XG4gICAgICB2cGMsXG4gICAgICBkZXNjcmlwdGlvbjogJ1NlY3VyaXR5IGdyb3VwIGZvciBQUkVSRVEgUkRTIGluc3RhbmNlJyxcbiAgICAgIGFsbG93QWxsT3V0Ym91bmQ6IHRydWUsXG4gICAgfSk7XG5cbiAgICAvLyBBbGxvdyBQb3N0Z3JlU1FMIGFjY2VzcyBmcm9tIExhbWJkYSAoYWxsIGVudmlyb25tZW50cylcbiAgICBkYlNlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoXG4gICAgICBsYW1iZGFTZyxcbiAgICAgIGVjMi5Qb3J0LnRjcCg1NDMyKSxcbiAgICAgICdBbGxvdyBQb3N0Z3JlU1FMIGFjY2VzcyBmcm9tIExhbWJkYSdcbiAgICApO1xuXG4gICAgLy8gRGV2IG9ubHk6IEFsbG93IGRpcmVjdCBhY2Nlc3MgZnJvbSBkZXZlbG9wZXIgSVBcbiAgICBpZiAoZW52ID09PSAnZGV2Jykge1xuICAgICAgZGJTZWN1cml0eUdyb3VwLmFkZEluZ3Jlc3NSdWxlKFxuICAgICAgICBlYzIuUGVlci5pcHY0KGRldklQKSxcbiAgICAgICAgZWMyLlBvcnQudGNwKDU0MzIpLFxuICAgICAgICAnQWxsb3cgUG9zdGdyZVNRTCBhY2Nlc3MgZnJvbSBkZXZlbG9wZXIgSVAgKGRldiBvbmx5KSdcbiAgICAgICk7XG4gICAgfVxuXG4gICAgLy8gRW52aXJvbm1lbnQtYXdhcmUgUkRTIGNvbmZpZ3VyYXRpb25cbiAgICBjb25zdCBkYXRhYmFzZSA9IG5ldyByZHMuRGF0YWJhc2VJbnN0YW5jZSh0aGlzLCAnUHJlcmVxRGF0YWJhc2UnLCB7XG4gICAgICBlbmdpbmU6IHJkcy5EYXRhYmFzZUluc3RhbmNlRW5naW5lLnBvc3RncmVzKHtcbiAgICAgICAgdmVyc2lvbjogcmRzLlBvc3RncmVzRW5naW5lVmVyc2lvbi5WRVJfMTdfNSxcbiAgICAgIH0pLFxuICAgICAgaW5zdGFuY2VUeXBlOiBlYzIuSW5zdGFuY2VUeXBlLm9mKGVjMi5JbnN0YW5jZUNsYXNzLlQzLCBlYzIuSW5zdGFuY2VTaXplLk1JQ1JPKSxcbiAgICAgIHZwYyxcbiAgICAgIHZwY1N1Ym5ldHM6IHtcbiAgICAgICAgLy8gRGV2OiBwdWJsaWMgc3VibmV0cyBmb3IgZGlyZWN0IGFjY2VzcywgU3RhZ2UvUHJvZDogcHJpdmF0ZSBpc29sYXRlZFxuICAgICAgICBzdWJuZXRUeXBlOiBlbnYgPT09ICdkZXYnID8gZWMyLlN1Ym5ldFR5cGUuUFVCTElDIDogZWMyLlN1Ym5ldFR5cGUuUFJJVkFURV9JU09MQVRFRCxcbiAgICAgIH0sXG4gICAgICBzZWN1cml0eUdyb3VwczogW2RiU2VjdXJpdHlHcm91cF0sXG4gICAgICBkYXRhYmFzZU5hbWU6ICdwcmVyZXEnLFxuICAgICAgY3JlZGVudGlhbHM6IHJkcy5DcmVkZW50aWFscy5mcm9tR2VuZXJhdGVkU2VjcmV0KCdwcmVyZXFfYWRtaW4nKSxcbiAgICAgIC8vIERldjogcHVibGljbHkgYWNjZXNzaWJsZSBmb3IgbG9jYWwgdG9vbHMsIFN0YWdlL1Byb2Q6IHByaXZhdGVcbiAgICAgIHB1YmxpY2x5QWNjZXNzaWJsZTogZW52ID09PSAnZGV2JyxcbiAgICAgIGJhY2t1cFJldGVudGlvbjogY2RrLkR1cmF0aW9uLmRheXMoNyksXG4gICAgICAvLyBQcm9kOiBlbmFibGUgZGVsZXRpb24gcHJvdGVjdGlvbiwgRGV2L1N0YWdlOiBhbGxvdyBlYXN5IGNsZWFudXBcbiAgICAgIGRlbGV0aW9uUHJvdGVjdGlvbjogaXNQcm9kLFxuICAgICAgcmVtb3ZhbFBvbGljeTogaXNQcm9kID8gY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOIDogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICB9KTtcblxuICAgIC8vIEFkZCBhdXRvbWF0aWMgc2VjcmV0IHJvdGF0aW9uIGZvciBkYXRhYmFzZVxuICAgIGRhdGFiYXNlLmFkZFJvdGF0aW9uU2luZ2xlVXNlcigpO1xuXG4gICAgLy8gUkRTIFByb3h5IGNvbmZpZ3VyYXRpb24gYmFzZWQgb24gZW52aXJvbm1lbnRcbiAgICBsZXQgZGJQcm94eTogcmRzLkRhdGFiYXNlUHJveHkgfCB1bmRlZmluZWQ7XG4gICAgbGV0IGRiRW5kcG9pbnQ6IHN0cmluZztcbiAgICBcbiAgICBpZiAoZW52ICE9PSAnZGV2Jykge1xuICAgICAgLy8gQ3JlYXRlIGVudmlyb25tZW50LXNwZWNpZmljIHNlY3VyaXR5IGdyb3VwcyBmb3IgcHJveHlcbiAgICAgIGxldCBwcm94eVNlY3VyaXR5R3JvdXBzOiBlYzIuU2VjdXJpdHlHcm91cFtdO1xuICAgICAgXG4gICAgICBpZiAoaXNTdGFnZSkge1xuICAgICAgICAvLyBTdGFnZTogQ3JlYXRlIHB1YmxpYyBzZWN1cml0eSBncm91cCBmb3IgcHJveHlcbiAgICAgICAgY29uc3QgcHJveHlQdWJsaWNTZyA9IG5ldyBlYzIuU2VjdXJpdHlHcm91cCh0aGlzLCAnUHJlcmVxUHJveHlQdWJsaWNTRycsIHtcbiAgICAgICAgICB2cGMsXG4gICAgICAgICAgZGVzY3JpcHRpb246ICdQdWJsaWMgYWNjZXNzIHNlY3VyaXR5IGdyb3VwIGZvciBSRFMgUHJveHkgKHN0YWdlIG9ubHkpJyxcbiAgICAgICAgICBhbGxvd0FsbE91dGJvdW5kOiB0cnVlLFxuICAgICAgICB9KTtcbiAgICAgICAgXG4gICAgICAgIC8vIEFsbG93IGFjY2VzcyB0byBwcm94eSBpbiBzdGFnZSBmcm9tIHlvdXIgSVAgKGNoYW5nZSB0byBhbnlJcHY0KCkgZm9yIGRlbW8gY2xpZW50cylcbiAgICAgICAgcHJveHlQdWJsaWNTZy5hZGRJbmdyZXNzUnVsZShcbiAgICAgICAgICBlYzIuUGVlci5pcHY0KGRldklQKSxcbiAgICAgICAgICBlYzIuUG9ydC50Y3AoNTQzMiksXG4gICAgICAgICAgJ0FsbG93IGFjY2VzcyB0byBSRFMgUHJveHkgZnJvbSBkZXYgSVAgKHN0YWdlIG9ubHkpJ1xuICAgICAgICApO1xuXG4gICAgICAgIC8vIFN0YWdlOiBVc2UgYm90aCBEQiBzZWN1cml0eSBncm91cCBhbmQgcHVibGljIHNlY3VyaXR5IGdyb3VwXG4gICAgICAgIHByb3h5U2VjdXJpdHlHcm91cHMgPSBbZGJTZWN1cml0eUdyb3VwLCBwcm94eVB1YmxpY1NnXTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIFByb2Q6IFVzZSBvbmx5IHRoZSBwcml2YXRlIERCIHNlY3VyaXR5IGdyb3VwXG4gICAgICAgIHByb3h5U2VjdXJpdHlHcm91cHMgPSBbZGJTZWN1cml0eUdyb3VwXTtcbiAgICAgIH1cblxuICAgICAgLy8gU3RhZ2UvUHJvZDogQ3JlYXRlIFJEUyBQcm94eSB3aXRoIGFwcHJvcHJpYXRlIHNlY3VyaXR5IGdyb3Vwc1xuICAgICAgZGJQcm94eSA9IG5ldyByZHMuRGF0YWJhc2VQcm94eSh0aGlzLCAnUHJlcmVxRGF0YWJhc2VQcm94eScsIHtcbiAgICAgICAgcHJveHlUYXJnZXQ6IHJkcy5Qcm94eVRhcmdldC5mcm9tSW5zdGFuY2UoZGF0YWJhc2UpLFxuICAgICAgICBzZWNyZXRzOiBbZGF0YWJhc2Uuc2VjcmV0IV0sXG4gICAgICAgIHZwYyxcbiAgICAgICAgdnBjU3VibmV0czoge1xuICAgICAgICAgIHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBSSVZBVEVfSVNPTEFURUQsXG4gICAgICAgIH0sXG4gICAgICAgIHNlY3VyaXR5R3JvdXBzOiBwcm94eVNlY3VyaXR5R3JvdXBzLFxuICAgICAgICByZXF1aXJlVExTOiB0cnVlLFxuICAgICAgfSk7XG4gICAgICBcbiAgICAgIGRiRW5kcG9pbnQgPSBkYlByb3h5LmVuZHBvaW50O1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBEZXY6IERpcmVjdCBkYXRhYmFzZSBjb25uZWN0aW9uXG4gICAgICBkYkVuZHBvaW50ID0gZGF0YWJhc2UuaW5zdGFuY2VFbmRwb2ludC5ob3N0bmFtZTtcbiAgICB9XG5cbiAgICAvLyBPcHRpb25hbDogU1NNIEJhc3Rpb24gZm9yIHByb2QgZGVidWdnaW5nICh0My5uYW5vKVxuICAgIGxldCBiYXN0aW9uSW5zdGFuY2U6IGVjMi5JbnN0YW5jZSB8IHVuZGVmaW5lZDtcbiAgICBpZiAoaXNQcm9kKSB7XG4gICAgICAvLyBCYXN0aW9uIHNlY3VyaXR5IGdyb3VwXG4gICAgICBjb25zdCBiYXN0aW9uU2cgPSBuZXcgZWMyLlNlY3VyaXR5R3JvdXAodGhpcywgJ1ByZXJlcUJhc3Rpb25TRycsIHtcbiAgICAgICAgdnBjLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ1NlY3VyaXR5IGdyb3VwIGZvciBQUkVSRVEgU1NNIGJhc3Rpb24nLFxuICAgICAgICBhbGxvd0FsbE91dGJvdW5kOiB0cnVlLFxuICAgICAgfSk7XG5cbiAgICAgIC8vIEJhc3Rpb24gaW5zdGFuY2UgZm9yIHBvcnQgZm9yd2FyZGluZyBpbiBwcm9kXG4gICAgICBiYXN0aW9uSW5zdGFuY2UgPSBuZXcgZWMyLkluc3RhbmNlKHRoaXMsICdQcmVyZXFCYXN0aW9uJywge1xuICAgICAgICBpbnN0YW5jZVR5cGU6IGVjMi5JbnN0YW5jZVR5cGUub2YoZWMyLkluc3RhbmNlQ2xhc3MuVDMsIGVjMi5JbnN0YW5jZVNpemUuTkFOTyksXG4gICAgICAgIG1hY2hpbmVJbWFnZTogZWMyLk1hY2hpbmVJbWFnZS5sYXRlc3RBbWF6b25MaW51eDIwMjMoKSxcbiAgICAgICAgdnBjLFxuICAgICAgICB2cGNTdWJuZXRzOiB7XG4gICAgICAgICAgc3VibmV0VHlwZTogZWMyLlN1Ym5ldFR5cGUuUFJJVkFURV9JU09MQVRFRCxcbiAgICAgICAgfSxcbiAgICAgICAgc2VjdXJpdHlHcm91cDogYmFzdGlvblNnLFxuICAgICAgICByb2xlOiBuZXcgaWFtLlJvbGUodGhpcywgJ1ByZXJlcUJhc3Rpb25Sb2xlJywge1xuICAgICAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdlYzIuYW1hem9uYXdzLmNvbScpLFxuICAgICAgICAgIG1hbmFnZWRQb2xpY2llczogW1xuICAgICAgICAgICAgaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKCdBbWF6b25TU01NYW5hZ2VkSW5zdGFuY2VDb3JlJyksXG4gICAgICAgICAgXSxcbiAgICAgICAgfSksXG4gICAgICAgIHVzZXJEYXRhOiBlYzIuVXNlckRhdGEuZm9yTGludXgoKSxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBBbGxvdyBiYXN0aW9uIHRvIGFjY2VzcyBkYXRhYmFzZVxuICAgICAgZGJTZWN1cml0eUdyb3VwLmFkZEluZ3Jlc3NSdWxlKFxuICAgICAgICBiYXN0aW9uU2csXG4gICAgICAgIGVjMi5Qb3J0LnRjcCg1NDMyKSxcbiAgICAgICAgJ0FsbG93IFBvc3RncmVTUUwgYWNjZXNzIGZyb20gYmFzdGlvbiAocHJvZCBvbmx5KSdcbiAgICAgICk7XG4gICAgfVxuXG4gICAgLy8gSldUIFNlY3JldCBpbiBTZWNyZXRzIE1hbmFnZXJcbiAgICBjb25zdCBqd3RTZWNyZXQgPSBuZXcgc2VjcmV0c21hbmFnZXIuU2VjcmV0KHRoaXMsICdKd3RTZWNyZXQnLCB7XG4gICAgICBkZXNjcmlwdGlvbjogJ0pXVCBzaWduaW5nIHNlY3JldCBmb3IgUFJFUkVRIEFQSScsXG4gICAgICBnZW5lcmF0ZVNlY3JldFN0cmluZzoge1xuICAgICAgICBleGNsdWRlUHVuY3R1YXRpb246IHRydWUsXG4gICAgICAgIHBhc3N3b3JkTGVuZ3RoOiAzMixcbiAgICAgIH0sXG4gICAgICByZW1vdmFsUG9saWN5OiBpc1Byb2QgPyBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4gOiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgIH0pO1xuXG4gICAgLy8gQWRkIG1vbnRobHkgcm90YXRpb24gZm9yIEpXVCBzZWNyZXQgaW4gcHJvZHVjdGlvblxuICAgIGlmIChpc1Byb2QpIHtcbiAgICAgIGp3dFNlY3JldC5hZGRSb3RhdGlvblNjaGVkdWxlKCdSb3RhdGVNb250aGx5Jywge1xuICAgICAgICBhdXRvbWF0aWNhbGx5QWZ0ZXI6IGNkay5EdXJhdGlvbi5kYXlzKDMwKSxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIENvZ25pdG8gVXNlciBQb29sXG4gICAgY29uc3QgdXNlclBvb2wgPSBuZXcgY29nbml0by5Vc2VyUG9vbCh0aGlzLCAnUHJlcmVxVXNlclBvb2wnLCB7XG4gICAgICB1c2VyUG9vbE5hbWU6ICdwcmVyZXEtdXNlcnMnLFxuICAgICAgc2VsZlNpZ25VcEVuYWJsZWQ6IHRydWUsXG4gICAgICBzaWduSW5BbGlhc2VzOiB7XG4gICAgICAgIGVtYWlsOiB0cnVlLFxuICAgICAgfSxcbiAgICAgIHN0YW5kYXJkQXR0cmlidXRlczoge1xuICAgICAgICBlbWFpbDoge1xuICAgICAgICAgIHJlcXVpcmVkOiB0cnVlLFxuICAgICAgICAgIG11dGFibGU6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICAgIGZ1bGxuYW1lOiB7XG4gICAgICAgICAgcmVxdWlyZWQ6IGZhbHNlLFxuICAgICAgICAgIG11dGFibGU6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgcGFzc3dvcmRQb2xpY3k6IHtcbiAgICAgICAgbWluTGVuZ3RoOiA4LFxuICAgICAgICByZXF1aXJlTG93ZXJjYXNlOiB0cnVlLFxuICAgICAgICByZXF1aXJlVXBwZXJjYXNlOiB0cnVlLFxuICAgICAgICByZXF1aXJlRGlnaXRzOiB0cnVlLFxuICAgICAgICByZXF1aXJlU3ltYm9sczogdHJ1ZSxcbiAgICAgIH0sXG4gICAgICBhY2NvdW50UmVjb3Zlcnk6IGNvZ25pdG8uQWNjb3VudFJlY292ZXJ5LkVNQUlMX09OTFksXG4gICAgfSk7XG5cbiAgICAvLyBDb2duaXRvIFVzZXIgUG9vbCBDbGllbnRcbiAgICBjb25zdCB1c2VyUG9vbENsaWVudCA9IG5ldyBjb2duaXRvLlVzZXJQb29sQ2xpZW50KHRoaXMsICdQcmVyZXFVc2VyUG9vbENsaWVudCcsIHtcbiAgICAgIHVzZXJQb29sLFxuICAgICAgdXNlclBvb2xDbGllbnROYW1lOiAncHJlcmVxLWNsaWVudCcsXG4gICAgICBnZW5lcmF0ZVNlY3JldDogZmFsc2UsXG4gICAgICBhdXRoRmxvd3M6IHtcbiAgICAgICAgYWRtaW5Vc2VyUGFzc3dvcmQ6IHRydWUsXG4gICAgICAgIHVzZXJQYXNzd29yZDogdHJ1ZSxcbiAgICAgICAgdXNlclNycDogdHJ1ZSxcbiAgICAgIH0sXG4gICAgICBvQXV0aDoge1xuICAgICAgICBmbG93czoge1xuICAgICAgICAgIGF1dGhvcml6YXRpb25Db2RlR3JhbnQ6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICAgIHNjb3BlczogW2NvZ25pdG8uT0F1dGhTY29wZS5FTUFJTCwgY29nbml0by5PQXV0aFNjb3BlLk9QRU5JRCwgY29nbml0by5PQXV0aFNjb3BlLlBST0ZJTEVdLFxuICAgICAgICBjYWxsYmFja1VybHM6IFsnaHR0cDovL2xvY2FsaG9zdDo1MTczL2NhbGxiYWNrJywgJ2h0dHBzOi8veW91ci1kb21haW4uY29tL2NhbGxiYWNrJ10sXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gRW52aXJvbm1lbnQtc3BlY2lmaWMgdGhyb3R0bGluZyByYXRlc1xuICAgIGNvbnN0IHRocm90dGxlQ29uZmlnID0ge1xuICAgICAgZGV2OiB7IHJhdGU6IHVuZGVmaW5lZCwgYnVyc3Q6IHVuZGVmaW5lZCB9LCAvLyBVbmxpbWl0ZWRcbiAgICAgIHN0YWdlOiB7IHJhdGU6IDIwLCBidXJzdDogMTAgfSxcbiAgICAgIHByb2Q6IHsgcmF0ZTogNTAsIGJ1cnN0OiAyMCB9XG4gICAgfTtcblxuICAgIGNvbnN0IGN1cnJlbnRUaHJvdHRsZSA9IHRocm90dGxlQ29uZmlnW2VudiBhcyBrZXlvZiB0eXBlb2YgdGhyb3R0bGVDb25maWddO1xuXG4gICAgLy8gTGFtYmRhIEZ1bmN0aW9uIHVzaW5nIHJlZ3VsYXIgRnVuY3Rpb24gKG5vIERvY2tlciByZXF1aXJlZClcbiAgICAvLyBXaGVuIHN3aXRjaGluZyBiYWNrIHRvIE5vZGVqc0Z1bmN0aW9uLCBjb25zaWRlcjpcbiAgICAvLyBidW5kbGluZzogeyBleHRlcm5hbE1vZHVsZXM6IFsnQG5lc3Rqcy8qJywgJ3BnJ10gfVxuICAgIGNvbnN0IGFwaUxhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ1ByZXJlcUFQSUxhbWJkYScsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xOF9YLFxuICAgICAgaGFuZGxlcjogJ2xhbWJkYS5oYW5kbGVyJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vLi4vYmFja2VuZC9kaXN0JykpLFxuICAgICAgdnBjLFxuICAgICAgc2VjdXJpdHlHcm91cHM6IFtsYW1iZGFTZ10sXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBEQl9TRUNSRVRfQVJOOiBkYXRhYmFzZS5zZWNyZXQhLnNlY3JldEFybixcbiAgICAgICAgREJfSE9TVDogZGJFbmRwb2ludCxcbiAgICAgICAgLi4uKGRiUHJveHkgJiYgeyBEQl9QUk9YWV9FTkRQT0lOVDogZGJQcm94eS5lbmRwb2ludCB9KSxcbiAgICAgICAgSldUX1NFQ1JFVF9BUk46IGp3dFNlY3JldC5zZWNyZXRBcm4sXG4gICAgICAgIENPR05JVE9fVVNFUl9QT09MX0lEOiB1c2VyUG9vbC51c2VyUG9vbElkLFxuICAgICAgICBDT0dOSVRPX0NMSUVOVF9JRDogdXNlclBvb2xDbGllbnQudXNlclBvb2xDbGllbnRJZCxcbiAgICAgICAgTk9ERV9FTlY6IGVudixcbiAgICAgIH0sXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICBtZW1vcnlTaXplOiA1MTIsXG4gICAgfSk7XG5cbiAgICAvLyBMYW1iZGEgbG9nIGdyb3VwIHdpdGggc3ltbWV0cmljIHJldGVudGlvblxuICAgIG5ldyBsb2dzLkxvZ0dyb3VwKHRoaXMsICdQcmVyZXFBUElMYW1iZGFMb2dzJywge1xuICAgICAgbG9nR3JvdXBOYW1lOiBgL2F3cy9sYW1iZGEvJHthcGlMYW1iZGEuZnVuY3Rpb25OYW1lfWAsXG4gICAgICByZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfTU9OVEgsXG4gICAgfSk7XG5cbiAgICAvLyBHcmFudCBMYW1iZGEgYWNjZXNzIHRvIGRhdGFiYXNlL3Byb3h5IGFuZCBzZWNyZXRzXG4gICAgaWYgKGRiUHJveHkpIHtcbiAgICAgIGRiUHJveHkuZ3JhbnRDb25uZWN0KGFwaUxhbWJkYSwgJ3ByZXJlcV9hZG1pbicpO1xuICAgIH0gZWxzZSB7XG4gICAgICBkYXRhYmFzZS5ncmFudENvbm5lY3QoYXBpTGFtYmRhKTtcbiAgICB9XG4gICAgZGF0YWJhc2Uuc2VjcmV0Py5ncmFudFJlYWQoYXBpTGFtYmRhKTtcbiAgICBqd3RTZWNyZXQuZ3JhbnRSZWFkKGFwaUxhbWJkYSk7XG5cbiAgICAvLyBBY2Nlc3MtbG9nIGdyb3VwXG4gICAgY29uc3QgYXBpTG9ncyA9IG5ldyBsb2dzLkxvZ0dyb3VwKHRoaXMsICdQcmVyZXFBcGlMb2dzJywge1xuICAgICAgcmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX01PTlRILFxuICAgIH0pO1xuXG4gICAgLy8gQVBJIEdhdGV3YXkgd2l0aCBlbnZpcm9ubWVudC1zcGVjaWZpYyB0aHJvdHRsaW5nXG4gICAgY29uc3QgZGVwbG95T3B0aW9uczogYW55ID0ge1xuICAgICAgc3RhZ2VOYW1lOiBlbnYsXG4gICAgICBtZXRyaWNzRW5hYmxlZDogdHJ1ZSxcbiAgICAgIGxvZ2dpbmdMZXZlbDogYXBpZ2F0ZXdheS5NZXRob2RMb2dnaW5nTGV2ZWwuSU5GTyxcbiAgICAgIGFjY2Vzc0xvZ0Rlc3RpbmF0aW9uOiBuZXcgYXBpZ2F0ZXdheS5Mb2dHcm91cExvZ0Rlc3RpbmF0aW9uKGFwaUxvZ3MpLFxuICAgICAgYWNjZXNzTG9nRm9ybWF0OiBhcGlnYXRld2F5LkFjY2Vzc0xvZ0Zvcm1hdC5qc29uV2l0aFN0YW5kYXJkRmllbGRzKHtcbiAgICAgICAgY2FsbGVyOiB0cnVlLFxuICAgICAgICBodHRwTWV0aG9kOiB0cnVlLFxuICAgICAgICBpcDogdHJ1ZSxcbiAgICAgICAgcHJvdG9jb2w6IHRydWUsXG4gICAgICAgIHJlcXVlc3RUaW1lOiB0cnVlLFxuICAgICAgICByZXNvdXJjZVBhdGg6IHRydWUsXG4gICAgICAgIHJlc3BvbnNlTGVuZ3RoOiB0cnVlLFxuICAgICAgICBzdGF0dXM6IHRydWUsXG4gICAgICAgIHVzZXI6IHRydWUsXG4gICAgICB9KSxcbiAgICB9O1xuXG4gICAgLy8gQWRkIHRocm90dGxpbmcgb25seSBmb3Igc3RhZ2UvcHJvZFxuICAgIGlmIChjdXJyZW50VGhyb3R0bGUucmF0ZSAmJiBjdXJyZW50VGhyb3R0bGUuYnVyc3QpIHtcbiAgICAgIGRlcGxveU9wdGlvbnMudGhyb3R0bGluZ1JhdGVMaW1pdCA9IGN1cnJlbnRUaHJvdHRsZS5yYXRlO1xuICAgICAgZGVwbG95T3B0aW9ucy50aHJvdHRsaW5nQnVyc3RMaW1pdCA9IGN1cnJlbnRUaHJvdHRsZS5idXJzdDtcbiAgICB9XG5cbiAgICBjb25zdCBhcGkgPSBuZXcgYXBpZ2F0ZXdheS5SZXN0QXBpKHRoaXMsICdQcmVyZXFBUEknLCB7XG4gICAgICByZXN0QXBpTmFtZTogJ1BSRVJFUSBBUEknLFxuICAgICAgZGVzY3JpcHRpb246ICdQUkVSRVEgUHJvamVjdCBNYW5hZ2VtZW50IEFQSScsXG4gICAgICBkZWZhdWx0Q29yc1ByZWZsaWdodE9wdGlvbnM6IHtcbiAgICAgICAgYWxsb3dPcmlnaW5zOiBhcGlnYXRld2F5LkNvcnMuQUxMX09SSUdJTlMsXG4gICAgICAgIGFsbG93TWV0aG9kczogYXBpZ2F0ZXdheS5Db3JzLkFMTF9NRVRIT0RTLFxuICAgICAgICBhbGxvd0hlYWRlcnM6IFsnQ29udGVudC1UeXBlJywgJ0F1dGhvcml6YXRpb24nXSxcbiAgICAgIH0sXG4gICAgICBkZXBsb3lPcHRpb25zLFxuICAgIH0pO1xuXG4gICAgLy8gQVBJIEdhdGV3YXkgSW50ZWdyYXRpb25cbiAgICBjb25zdCBpbnRlZ3JhdGlvbiA9IG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGFwaUxhbWJkYSk7XG5cbiAgICAvLyBBUEkgUm91dGVzXG4gICAgYXBpLnJvb3QuYWRkUHJveHkoe1xuICAgICAgZGVmYXVsdEludGVncmF0aW9uOiBpbnRlZ3JhdGlvbixcbiAgICAgIGFueU1ldGhvZDogdHJ1ZSxcbiAgICB9KTtcblxuICAgIC8vIFdBRiBmb3Igc3RhZ2UvcHJvZCBvbmx5IChkZXYgaGFzIG5vIFdBRilcbiAgICBpZiAoZW52ICE9PSAnZGV2Jykge1xuICAgICAgY29uc3Qgd2ViQWNsID0gbmV3IHdhZnYyLkNmbldlYkFDTCh0aGlzLCAnQXBpV2FmJywge1xuICAgICAgICBkZWZhdWx0QWN0aW9uOiB7IGFsbG93OiB7fSB9LFxuICAgICAgICBzY29wZTogJ1JFR0lPTkFMJyxcbiAgICAgICAgdmlzaWJpbGl0eUNvbmZpZzoge1xuICAgICAgICAgIGNsb3VkV2F0Y2hNZXRyaWNzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICBtZXRyaWNOYW1lOiAnUHJlcmVxQXBpV2FmJyxcbiAgICAgICAgICBzYW1wbGVkUmVxdWVzdHNFbmFibGVkOiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgICBuYW1lOiAnUHJlcmVxQXBpV2FmJyxcbiAgICAgICAgcnVsZXM6IFtcbiAgICAgICAgICB7XG4gICAgICAgICAgICBuYW1lOiAnQVdTLUFXU01hbmFnZWRDb21tb25SdWxlU2V0JyxcbiAgICAgICAgICAgIHByaW9yaXR5OiAwLFxuICAgICAgICAgICAgc3RhdGVtZW50OiB7IG1hbmFnZWRSdWxlR3JvdXBTdGF0ZW1lbnQ6IHtcbiAgICAgICAgICAgICAgbmFtZTogJ0FXU01hbmFnZWRSdWxlc0NvbW1vblJ1bGVTZXQnLFxuICAgICAgICAgICAgICB2ZW5kb3JOYW1lOiAnQVdTJyxcbiAgICAgICAgICAgIH19LFxuICAgICAgICAgICAgb3ZlcnJpZGVBY3Rpb246IHsgbm9uZToge30gfSxcbiAgICAgICAgICAgIHZpc2liaWxpdHlDb25maWc6IHtcbiAgICAgICAgICAgICAgY2xvdWRXYXRjaE1ldHJpY3NFbmFibGVkOiB0cnVlLFxuICAgICAgICAgICAgICBtZXRyaWNOYW1lOiAnQ29tbW9uUnVsZXMnLFxuICAgICAgICAgICAgICBzYW1wbGVkUmVxdWVzdHNFbmFibGVkOiB0cnVlLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIG5hbWU6ICdJcFJhdGVMaW1pdCcsXG4gICAgICAgICAgICBwcmlvcml0eTogMSxcbiAgICAgICAgICAgIHN0YXRlbWVudDoge1xuICAgICAgICAgICAgICByYXRlQmFzZWRTdGF0ZW1lbnQ6IHtcbiAgICAgICAgICAgICAgICBsaW1pdDogMjAwMCwgICAgICAgICAvLyAyMDAwIHJlcXVlc3RzIGluIDUgbWluIHBlciBJUFxuICAgICAgICAgICAgICAgIGFnZ3JlZ2F0ZUtleVR5cGU6ICdJUCcsXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgYWN0aW9uOiB7IGJsb2NrOiB7fSB9LFxuICAgICAgICAgICAgdmlzaWJpbGl0eUNvbmZpZzoge1xuICAgICAgICAgICAgICBjbG91ZFdhdGNoTWV0cmljc0VuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgICAgIG1ldHJpY05hbWU6ICdJcFJhdGVMaW1pdCcsXG4gICAgICAgICAgICAgIHNhbXBsZWRSZXF1ZXN0c0VuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIF0sXG4gICAgICB9KTtcblxuICAgICAgLy8gQXNzb2NpYXRlIFdBRiB3aXRoIEFQSSBHYXRld2F5XG4gICAgICBuZXcgd2FmdjIuQ2ZuV2ViQUNMQXNzb2NpYXRpb24odGhpcywgJ0FwaVdhZkFzc29jJywge1xuICAgICAgICB3ZWJBY2xBcm46IHdlYkFjbC5hdHRyQXJuLFxuICAgICAgICByZXNvdXJjZUFybjogYXBpLmRlcGxveW1lbnRTdGFnZS5zdGFnZUFybixcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIFByaXZhdGUgUzMgQnVja2V0IGZvciBGcm9udGVuZFxuICAgIGNvbnN0IGZyb250ZW5kQnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCAnUHJlcmVxRnJvbnRlbmRCdWNrZXQnLCB7XG4gICAgICBidWNrZXROYW1lOiBgcHJlcmVxLWZyb250ZW5kLSR7ZW52fS0ke3RoaXMuYWNjb3VudH0tJHt0aGlzLnJlZ2lvbn1gLFxuICAgICAgcHVibGljUmVhZEFjY2VzczogZmFsc2UsXG4gICAgICBibG9ja1B1YmxpY0FjY2VzczogczMuQmxvY2tQdWJsaWNBY2Nlc3MuQkxPQ0tfQUxMLFxuICAgICAgcmVtb3ZhbFBvbGljeTogaXNQcm9kID8gY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOIDogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIGF1dG9EZWxldGVPYmplY3RzOiAhaXNQcm9kLFxuICAgIH0pO1xuXG4gICAgLy8gQ2xvdWRGcm9udCBPcmlnaW4gQWNjZXNzIElkZW50aXR5XG4gICAgY29uc3Qgb3JpZ2luQWNjZXNzSWRlbnRpdHkgPSBuZXcgY2xvdWRmcm9udC5PcmlnaW5BY2Nlc3NJZGVudGl0eSh0aGlzLCAnUHJlcmVxT0FJJywge1xuICAgICAgY29tbWVudDogJ09BSSBmb3IgUFJFUkVRIGZyb250ZW5kIGJ1Y2tldCcsXG4gICAgfSk7XG5cbiAgICAvLyBHcmFudCBDbG91ZEZyb250IHJlYWQgYWNjZXNzIHRvIHRoZSBidWNrZXRcbiAgICBmcm9udGVuZEJ1Y2tldC5ncmFudFJlYWQob3JpZ2luQWNjZXNzSWRlbnRpdHkpO1xuXG4gICAgLy8gQ2xvdWRGcm9udCBEaXN0cmlidXRpb24gd2l0aCBTUEEtb3B0aW1pemVkIGNhY2hpbmdcbiAgICBjb25zdCBkaXN0cmlidXRpb24gPSBuZXcgY2xvdWRmcm9udC5EaXN0cmlidXRpb24odGhpcywgJ1ByZXJlcURpc3RyaWJ1dGlvbicsIHtcbiAgICAgIGRlZmF1bHRCZWhhdmlvcjoge1xuICAgICAgICBvcmlnaW46IG9yaWdpbnMuUzNCdWNrZXRPcmlnaW4ud2l0aE9yaWdpbkFjY2Vzc0lkZW50aXR5KGZyb250ZW5kQnVja2V0LCB7XG4gICAgICAgICAgb3JpZ2luQWNjZXNzSWRlbnRpdHksXG4gICAgICAgIH0pLFxuICAgICAgICB2aWV3ZXJQcm90b2NvbFBvbGljeTogY2xvdWRmcm9udC5WaWV3ZXJQcm90b2NvbFBvbGljeS5SRURJUkVDVF9UT19IVFRQUyxcbiAgICAgICAgYWxsb3dlZE1ldGhvZHM6IGNsb3VkZnJvbnQuQWxsb3dlZE1ldGhvZHMuQUxMT1dfQUxMLFxuICAgICAgICBjYWNoZWRNZXRob2RzOiBjbG91ZGZyb250LkNhY2hlZE1ldGhvZHMuQ0FDSEVfR0VUX0hFQURfT1BUSU9OUyxcbiAgICAgICAgY2FjaGVQb2xpY3k6IGNsb3VkZnJvbnQuQ2FjaGVQb2xpY3kuQ0FDSElOR19ESVNBQkxFRCxcbiAgICAgIH0sXG4gICAgICBkZWZhdWx0Um9vdE9iamVjdDogJ2luZGV4Lmh0bWwnLFxuICAgICAgZXJyb3JSZXNwb25zZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIGh0dHBTdGF0dXM6IDQwNCxcbiAgICAgICAgICByZXNwb25zZUh0dHBTdGF0dXM6IDIwMCxcbiAgICAgICAgICByZXNwb25zZVBhZ2VQYXRoOiAnL2luZGV4Lmh0bWwnLFxuICAgICAgICAgIHR0bDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMCksIC8vIE5vIGNhY2hpbmcgZm9yIFNQQSByb3V0ZXNcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIGh0dHBTdGF0dXM6IDQwMyxcbiAgICAgICAgICByZXNwb25zZUh0dHBTdGF0dXM6IDIwMCxcbiAgICAgICAgICByZXNwb25zZVBhZ2VQYXRoOiAnL2luZGV4Lmh0bWwnLFxuICAgICAgICAgIHR0bDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMCksIC8vIE5vIGNhY2hpbmcgZm9yIFNQQSByb3V0ZXNcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICAvLyBTdG9yZSBzZW5zaXRpdmUgdmFsdWVzIGluIFNTTSBQYXJhbWV0ZXJzXG4gICAgbmV3IHNzbS5TdHJpbmdQYXJhbWV0ZXIodGhpcywgJ0RhdGFiYXNlRW5kcG9pbnRQYXJhbScsIHtcbiAgICAgIHBhcmFtZXRlck5hbWU6IGAvcHJlcmVxLyR7ZW52fS9kYXRhYmFzZS9lbmRwb2ludGAsXG4gICAgICBzdHJpbmdWYWx1ZTogZGF0YWJhc2UuaW5zdGFuY2VFbmRwb2ludC5ob3N0bmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiBgUkRTIERhdGFiYXNlIEVuZHBvaW50ICgke2Vudn0pYCxcbiAgICB9KTtcblxuICAgIGlmIChkYlByb3h5KSB7XG4gICAgICBuZXcgc3NtLlN0cmluZ1BhcmFtZXRlcih0aGlzLCAnRGF0YWJhc2VQcm94eUVuZHBvaW50UGFyYW0nLCB7XG4gICAgICAgIHBhcmFtZXRlck5hbWU6IGAvcHJlcmVxLyR7ZW52fS9kYXRhYmFzZS9wcm94eS1lbmRwb2ludGAsXG4gICAgICAgIHN0cmluZ1ZhbHVlOiBkYlByb3h5LmVuZHBvaW50LFxuICAgICAgICBkZXNjcmlwdGlvbjogYFJEUyBQcm94eSBFbmRwb2ludCAoJHtlbnZ9KWAsXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBuZXcgc3NtLlN0cmluZ1BhcmFtZXRlcih0aGlzLCAnRGF0YWJhc2VTZWNyZXRBcm5QYXJhbScsIHtcbiAgICAgIHBhcmFtZXRlck5hbWU6IGAvcHJlcmVxLyR7ZW52fS9kYXRhYmFzZS9zZWNyZXQtYXJuYCxcbiAgICAgIHN0cmluZ1ZhbHVlOiBkYXRhYmFzZS5zZWNyZXQ/LnNlY3JldEFybiB8fCAnJyxcbiAgICAgIGRlc2NyaXB0aW9uOiBgUkRTIERhdGFiYXNlIFNlY3JldCBBUk4gKCR7ZW52fSlgLFxuICAgIH0pO1xuXG4gICAgbmV3IHNzbS5TdHJpbmdQYXJhbWV0ZXIodGhpcywgJ0p3dFNlY3JldEFyblBhcmFtJywge1xuICAgICAgcGFyYW1ldGVyTmFtZTogYC9wcmVyZXEvJHtlbnZ9L2p3dC9zZWNyZXQtYXJuYCxcbiAgICAgIHN0cmluZ1ZhbHVlOiBqd3RTZWNyZXQuc2VjcmV0QXJuLFxuICAgICAgZGVzY3JpcHRpb246IGBKV1QgU2VjcmV0IEFSTiAoJHtlbnZ9KWAsXG4gICAgfSk7XG5cbiAgICBuZXcgc3NtLlN0cmluZ1BhcmFtZXRlcih0aGlzLCAnQ29nbml0b1VzZXJQb29sSWRQYXJhbScsIHtcbiAgICAgIHBhcmFtZXRlck5hbWU6IGAvcHJlcmVxLyR7ZW52fS9jb2duaXRvL3VzZXItcG9vbC1pZGAsXG4gICAgICBzdHJpbmdWYWx1ZTogdXNlclBvb2wudXNlclBvb2xJZCxcbiAgICAgIGRlc2NyaXB0aW9uOiBgQ29nbml0byBVc2VyIFBvb2wgSUQgKCR7ZW52fSlgLFxuICAgIH0pO1xuXG4gICAgbmV3IHNzbS5TdHJpbmdQYXJhbWV0ZXIodGhpcywgJ0NvZ25pdG9DbGllbnRJZFBhcmFtJywge1xuICAgICAgcGFyYW1ldGVyTmFtZTogYC9wcmVyZXEvJHtlbnZ9L2NvZ25pdG8vY2xpZW50LWlkYCxcbiAgICAgIHN0cmluZ1ZhbHVlOiB1c2VyUG9vbENsaWVudC51c2VyUG9vbENsaWVudElkLFxuICAgICAgZGVzY3JpcHRpb246IGBDb2duaXRvIFVzZXIgUG9vbCBDbGllbnQgSUQgKCR7ZW52fSlgLFxuICAgIH0pO1xuXG4gICAgLy8gRW52aXJvbm1lbnQtc3BlY2lmaWMgb3V0cHV0c1xuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdFbnZpcm9ubWVudCcsIHtcbiAgICAgIHZhbHVlOiBlbnYsXG4gICAgICBkZXNjcmlwdGlvbjogJ0RlcGxveW1lbnQgZW52aXJvbm1lbnQnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0RhdGFiYXNlQ29uZmlndXJhdGlvbicsIHtcbiAgICAgIHZhbHVlOiBlbnYgPT09ICdkZXYnIFxuICAgICAgICA/ICdQdWJsaWMgZGF0YWJhc2UgKGRpcmVjdCBhY2Nlc3MpJyBcbiAgICAgICAgOiBpc1N0YWdlIFxuICAgICAgICAgID8gJ1ByaXZhdGUgZGF0YWJhc2UgKyBwdWJsaWMgcHJveHknXG4gICAgICAgICAgOiAnUHJpdmF0ZSBkYXRhYmFzZSArIHByaXZhdGUgcHJveHknLFxuICAgICAgZGVzY3JpcHRpb246ICdEYXRhYmFzZSBhY2Nlc3MgY29uZmlndXJhdGlvbicsXG4gICAgfSk7XG5cbiAgICBpZiAoY3VycmVudFRocm90dGxlLnJhdGUgJiYgY3VycmVudFRocm90dGxlLmJ1cnN0KSB7XG4gICAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnVGhyb3R0bGluZ0NvbmZpZ3VyYXRpb24nLCB7XG4gICAgICAgIHZhbHVlOiBgJHtjdXJyZW50VGhyb3R0bGUucmF0ZX0vJHtjdXJyZW50VGhyb3R0bGUuYnVyc3R9IChyYXRlL2J1cnN0KWAsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnQVBJIEdhdGV3YXkgdGhyb3R0bGluZyBsaW1pdHMnLFxuICAgICAgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdUaHJvdHRsaW5nQ29uZmlndXJhdGlvbicsIHtcbiAgICAgICAgdmFsdWU6ICdVbmxpbWl0ZWQnLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ0FQSSBHYXRld2F5IHRocm90dGxpbmcgbGltaXRzJyxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdXQUZQcm90ZWN0aW9uJywge1xuICAgICAgdmFsdWU6IGVudiA9PT0gJ2RldicgPyAnRGlzYWJsZWQnIDogJ0VuYWJsZWQnLFxuICAgICAgZGVzY3JpcHRpb246ICdXQUYgcHJvdGVjdGlvbiBzdGF0dXMnLFxuICAgIH0pO1xuXG4gICAgaWYgKGJhc3Rpb25JbnN0YW5jZSkge1xuICAgICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0Jhc3Rpb25JbnN0YW5jZUlkJywge1xuICAgICAgICB2YWx1ZTogYmFzdGlvbkluc3RhbmNlLmluc3RhbmNlSWQsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnQmFzdGlvbiBpbnN0YW5jZSBJRCBmb3IgU1NNIHBvcnQgZm9yd2FyZGluZyAocHJvZCBvbmx5KScsXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnRGF0YWJhc2VFbmRwb2ludCcsIHtcbiAgICAgIHZhbHVlOiBpc1Byb2QgPyAnPHJlZGFjdGVkPicgOiBkYXRhYmFzZS5pbnN0YW5jZUVuZHBvaW50Lmhvc3RuYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdEaXJlY3QgZGF0YWJhc2UgZW5kcG9pbnQnLFxuICAgIH0pO1xuXG4gICAgaWYgKGRiUHJveHkpIHtcbiAgICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdEYXRhYmFzZVByb3h5RW5kcG9pbnQnLCB7XG4gICAgICAgIHZhbHVlOiBpc1Byb2QgPyAnPHJlZGFjdGVkPicgOiBkYlByb3h5LmVuZHBvaW50LFxuICAgICAgICBkZXNjcmlwdGlvbjogJ1JEUyBQcm94eSBlbmRwb2ludCcsXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBTdGFuZGFyZCBvdXRwdXRzXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1VzZXJQb29sSWQnLCB7XG4gICAgICB2YWx1ZTogdXNlclBvb2wudXNlclBvb2xJZCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ29nbml0byBVc2VyIFBvb2wgSUQnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1VzZXJQb29sQ2xpZW50SWQnLCB7XG4gICAgICB2YWx1ZTogdXNlclBvb2xDbGllbnQudXNlclBvb2xDbGllbnRJZCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ29nbml0byBVc2VyIFBvb2wgQ2xpZW50IElEJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdBcGlVcmwnLCB7XG4gICAgICB2YWx1ZTogYXBpLnVybCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQVBJIEdhdGV3YXkgVVJMJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdGcm9udGVuZFVybCcsIHtcbiAgICAgIHZhbHVlOiBgaHR0cHM6Ly8ke2Rpc3RyaWJ1dGlvbi5kaXN0cmlidXRpb25Eb21haW5OYW1lfWAsXG4gICAgICBkZXNjcmlwdGlvbjogJ0Nsb3VkRnJvbnQgRGlzdHJpYnV0aW9uIFVSTCcsXG4gICAgfSk7XG4gIH1cbn0gIl19