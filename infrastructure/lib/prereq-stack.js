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
            // Stage/Prod: Create RDS Proxy
            dbProxy = new rds.DatabaseProxy(this, 'PrereqDatabaseProxy', {
                proxyTarget: rds.ProxyTarget.fromInstance(database),
                secrets: [database.secret],
                vpc,
                vpcSubnets: {
                    subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
                },
                securityGroups: [dbSecurityGroup],
                requireTLS: true,
            });
            // Stage: Make proxy publicly accessible, Prod: keep private
            if (isStage) {
                // Create separate proxy security group for stage public access
                const proxyPublicSg = new ec2.SecurityGroup(this, 'PrereqProxyPublicSG', {
                    vpc,
                    description: 'Public access security group for RDS Proxy (stage only)',
                    allowAllOutbound: true,
                });
                // Allow access from anywhere to proxy in stage (for founders/demo clients)
                proxyPublicSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(5432), 'Allow public access to RDS Proxy (stage only)');
                // Note: In real implementation, you'd need to create a separate proxy or configure ALB
                // This is a simplified approach - in practice, you might use an Application Load Balancer
            }
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
            stringValue: ((_c = database.secret) === null || _c === void 0 ? void 0 : _c.secretArn) || '',
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
            value: database.instanceEndpoint.hostname,
            description: 'Direct database endpoint',
        });
        if (dbProxy) {
            new cdk.CfnOutput(this, 'DatabaseProxyEndpoint', {
                value: dbProxy.endpoint,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJlcmVxLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsicHJlcmVxLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLG1DQUFtQztBQUNuQywyQ0FBMkM7QUFDM0MsMkNBQTJDO0FBQzNDLGlEQUFpRDtBQUNqRCx5REFBeUQ7QUFDekQsbURBQW1EO0FBQ25ELHlDQUF5QztBQUN6Qyx5REFBeUQ7QUFDekQsOERBQThEO0FBQzlELGlFQUFpRTtBQUNqRSwrQ0FBK0M7QUFDL0MsMkNBQTJDO0FBQzNDLDJDQUEyQztBQUMzQyw2Q0FBNkM7QUFHN0MsTUFBYSxXQUFZLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFDeEMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFzQjs7UUFDOUQsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsNEJBQTRCO1FBQzVCLE1BQU0sR0FBRyxHQUFHLE1BQUEsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLG1DQUFJLEtBQUssQ0FBQztRQUNwRCxNQUFNLE1BQU0sR0FBRyxHQUFHLEtBQUssTUFBTSxDQUFDO1FBQzlCLE1BQU0sT0FBTyxHQUFHLEdBQUcsS0FBSyxPQUFPLENBQUM7UUFFaEMsbURBQW1EO1FBQ25ELE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLE9BQU8sQ0FBQyxJQUFJLGtCQUFrQixDQUFDO1FBRXJFLHlDQUF5QztRQUN6QyxNQUFNLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLFdBQVcsRUFBRTtZQUN6QyxNQUFNLEVBQUUsQ0FBQztZQUNULGtFQUFrRTtZQUNsRSxXQUFXLEVBQUUsR0FBRyxLQUFLLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ2xDLG1CQUFtQixFQUFFO2dCQUNuQixFQUFFLElB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QzFDLEtBQUssRUFBRSxRQUFRLENBQUMsZ0JBQWdCLENBQUMsUUFBUTtZQUN6QyxXQUFXLEVBQUUsMEJBQTBCO1NBQ3hDLENBQUMsQ0FBQztRQUVILElBQUksT0FBTyxFQUFFLENBQUM7WUFDWixJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLHVCQUF1QixFQUFFO2dCQUMvQyxLQUFLLEVBQUUsT0FBTyxDQUFDLFFBQVE7Z0JBQ3ZCLFdBQVcsRUFBRSxvQkFBb0I7YUFDbEMsQ0FBQyxDQUFDO1FBQ0wsQ0FBQztRQUVELG1CQUFtQjtRQUNuQixJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLFlBQVksRUFBRTtZQUNwQyxLQUFLLEVBQUUsUUFBUSxDQUFDLFVBQVU7WUFDMUIsV0FBVyxFQUFFLHNCQUFzQjtTQUNwQyxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLGtCQUFrQixFQUFFO1lBQzFDLEtBQUssRUFBRSxjQUFjLENBQUMsZ0JBQWdCO1lBQ3RDLFdBQVcsRUFBRSw2QkFBNkI7U0FDM0MsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxRQUFRLEVBQUU7WUFDaEMsS0FBSyxFQUFFLEdBQUcsQ0FBQyxHQUFHO1lBQ2QsV0FBVyxFQUFFLGlCQUFpQjtTQUMvQixDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLGFBQWEsRUFBRTtZQUNyQyxLQUFLLEVBQUUsV0FBVyxZQUFZLENBQUMsc0JBQXNCLEVBQUU7WUFDdkQsV0FBVyxFQUFFLDZCQUE2QjtTQUMzQyxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUEvZkQsa0NBK2ZDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCAqIGFzIHJkcyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtcmRzJztcbmltcG9ydCAqIGFzIGVjMiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWMyJztcbmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhJztcbmltcG9ydCAqIGFzIGFwaWdhdGV3YXkgZnJvbSAnYXdzLWNkay1saWIvYXdzLWFwaWdhdGV3YXknO1xuaW1wb3J0ICogYXMgY29nbml0byBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY29nbml0byc7XG5pbXBvcnQgKiBhcyBzMyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtczMnO1xuaW1wb3J0ICogYXMgY2xvdWRmcm9udCBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY2xvdWRmcm9udCc7XG5pbXBvcnQgKiBhcyBvcmlnaW5zIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jbG91ZGZyb250LW9yaWdpbnMnO1xuaW1wb3J0ICogYXMgc2VjcmV0c21hbmFnZXIgZnJvbSAnYXdzLWNkay1saWIvYXdzLXNlY3JldHNtYW5hZ2VyJztcbmltcG9ydCAqIGFzIHdhZnYyIGZyb20gJ2F3cy1jZGstbGliL2F3cy13YWZ2Mic7XG5pbXBvcnQgKiBhcyBzc20gZnJvbSAnYXdzLWNkay1saWIvYXdzLXNzbSc7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XG5pbXBvcnQgKiBhcyBsb2dzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sb2dzJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuXG5leHBvcnQgY2xhc3MgUHJlcmVxU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wcz86IGNkay5TdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICAvLyBFbnZpcm9ubWVudCBjb250ZXh0IGZsYWdzXG4gICAgY29uc3QgZW52ID0gdGhpcy5ub2RlLnRyeUdldENvbnRleHQoJ2VudicpID8/ICdkZXYnO1xuICAgIGNvbnN0IGlzUHJvZCA9IGVudiA9PT0gJ3Byb2QnO1xuICAgIGNvbnN0IGlzU3RhZ2UgPSBlbnYgPT09ICdzdGFnZSc7XG4gICAgXG4gICAgLy8gRGV2ZWxvcGVyIElQIGZvciBkZXYgZW52aXJvbm1lbnQgZGF0YWJhc2UgYWNjZXNzXG4gICAgY29uc3QgZGV2SVAgPSB0aGlzLm5vZGUudHJ5R2V0Q29udGV4dCgnZGV2SVAnKSB8fCAnMTA0LjI4LjEzMy4xNy8zMic7XG5cbiAgICAvLyBWUEMgY29uZmlndXJhdGlvbiBiYXNlZCBvbiBlbnZpcm9ubWVudFxuICAgIGNvbnN0IHZwYyA9IG5ldyBlYzIuVnBjKHRoaXMsICdQcmVyZXFWUEMnLCB7XG4gICAgICBtYXhBenM6IDIsXG4gICAgICAvLyBEZXY6IG5vIE5BVCAoY29zdCBzYXZpbmdzKSwgU3RhZ2UvUHJvZDogTkFUIGZvciBvdXRib3VuZCBhY2Nlc3NcbiAgICAgIG5hdEdhdGV3YXlzOiBlbnYgPT09ICdkZXYnID8gMCA6IDEsXG4gICAgICBzdWJuZXRDb25maWd1cmF0aW9uOiBbXG4gICAgICAgIHsgbmFtZTogJ1B1YmxpYycsIHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBVQkxJQywgY2lkck1hc2s6IDI0IH0sXG4gICAgICAgIHsgbmFtZTogJ1ByaXZhdGUnLCBzdWJuZXRUeXBlOiBlYzIuU3VibmV0VHlwZS5QUklWQVRFX0lTT0xBVEVELCBjaWRyTWFzazogMjQgfSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICAvLyBWUEMgRW5kcG9pbnRzIGZvciBkZXYgZW52aXJvbm1lbnQgKG5vIE5BVClcbiAgICBpZiAoZW52ID09PSAnZGV2Jykge1xuICAgICAgdnBjLmFkZEdhdGV3YXlFbmRwb2ludCgnUzNFbmRwb2ludCcsIHsgc2VydmljZTogZWMyLkdhdGV3YXlWcGNFbmRwb2ludEF3c1NlcnZpY2UuUzMgfSk7XG4gICAgICB2cGMuYWRkSW50ZXJmYWNlRW5kcG9pbnQoJ1NlY3JldHNFbmRwb2ludCcsIHtcbiAgICAgICAgc2VydmljZTogZWMyLkludGVyZmFjZVZwY0VuZHBvaW50QXdzU2VydmljZS5TRUNSRVRTX01BTkFHRVIsXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBMYW1iZGEgU2VjdXJpdHkgR3JvdXBcbiAgICBjb25zdCBsYW1iZGFTZyA9IG5ldyBlYzIuU2VjdXJpdHlHcm91cCh0aGlzLCAnUHJlcmVxTGFtYmRhU0cnLCB7XG4gICAgICB2cGMsXG4gICAgICBkZXNjcmlwdGlvbjogJ1NlY3VyaXR5IGdyb3VwIGZvciBQUkVSRVEgTGFtYmRhIGZ1bmN0aW9ucycsXG4gICAgICBhbGxvd0FsbE91dGJvdW5kOiB0cnVlLFxuICAgIH0pO1xuXG4gICAgLy8gRGF0YWJhc2UgU2VjdXJpdHkgR3JvdXAgd2l0aCBlbnZpcm9ubWVudC1hd2FyZSBhY2Nlc3NcbiAgICBjb25zdCBkYlNlY3VyaXR5R3JvdXAgPSBuZXcgZWMyLlNlY3VyaXR5R3JvdXAodGhpcywgJ1ByZXJlcURCU2VjdXJpdHlHcm91cCcsIHtcbiAgICAgIHZwYyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnU2VjdXJpdHkgZ3JvdXAgZm9yIFBSRVJFUSBSRFMgaW5zdGFuY2UnLFxuICAgICAgYWxsb3dBbGxPdXRib3VuZDogdHJ1ZSxcbiAgICB9KTtcblxuICAgIC8vIEFsbG93IFBvc3RncmVTUUwgYWNjZXNzIGZyb20gTGFtYmRhIChhbGwgZW52aXJvbm1lbnRzKVxuICAgIGRiU2VjdXJpdHlHcm91cC5hZGRJbmdyZXNzUnVsZShcbiAgICAgIGxhbWJkYVNnLFxuICAgICAgZWMyLlBvcnQudGNwKDU0MzIpLFxuICAgICAgJ0FsbG93IFBvc3RncmVTUUwgYWNjZXNzIGZyb20gTGFtYmRhJ1xuICAgICk7XG5cbiAgICAvLyBEZXYgb25seTogQWxsb3cgZGlyZWN0IGFjY2VzcyBmcm9tIGRldmVsb3BlciBJUFxuICAgIGlmIChlbnYgPT09ICdkZXYnKSB7XG4gICAgICBkYlNlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoXG4gICAgICAgIGVjMi5QZWVyLmlwdjQoZGV2SVApLFxuICAgICAgICBlYzIuUG9ydC50Y3AoNTQzMiksXG4gICAgICAgICdBbGxvdyBQb3N0Z3JlU1FMIGFjY2VzcyBmcm9tIGRldmVsb3BlciBJUCAoZGV2IG9ubHkpJ1xuICAgICAgKTtcbiAgICB9XG5cbiAgICAvLyBFbnZpcm9ubWVudC1hd2FyZSBSRFMgY29uZmlndXJhdGlvblxuICAgIGNvbnN0IGRhdGFiYXNlID0gbmV3IHJkcy5EYXRhYmFzZUluc3RhbmNlKHRoaXMsICdQcmVyZXFEYXRhYmFzZScsIHtcbiAgICAgIGVuZ2luZTogcmRzLkRhdGFiYXNlSW5zdGFuY2VFbmdpbmUucG9zdGdyZXMoe1xuICAgICAgICB2ZXJzaW9uOiByZHMuUG9zdGdyZXNFbmdpbmVWZXJzaW9uLlZFUl8xN181LFxuICAgICAgfSksXG4gICAgICBpbnN0YW5jZVR5cGU6IGVjMi5JbnN0YW5jZVR5cGUub2YoZWMyLkluc3RhbmNlQ2xhc3MuVDMsIGVjMi5JbnN0YW5jZVNpemUuTUlDUk8pLFxuICAgICAgdnBjLFxuICAgICAgdnBjU3VibmV0czoge1xuICAgICAgICAvLyBEZXY6IHB1YmxpYyBzdWJuZXRzIGZvciBkaXJlY3QgYWNjZXNzLCBTdGFnZS9Qcm9kOiBwcml2YXRlIGlzb2xhdGVkXG4gICAgICAgIHN1Ym5ldFR5cGU6IGVudiA9PT0gJ2RldicgPyBlYzIuU3VibmV0VHlwZS5QVUJMSUMgOiBlYzIuU3VibmV0VHlwZS5QUklWQVRFX0lTT0xBVEVELFxuICAgICAgfSxcbiAgICAgIHNlY3VyaXR5R3JvdXBzOiBbZGJTZWN1cml0eUdyb3VwXSxcbiAgICAgIGRhdGFiYXNlTmFtZTogJ3ByZXJlcScsXG4gICAgICBjcmVkZW50aWFsczogcmRzLkNyZWRlbnRpYWxzLmZyb21HZW5lcmF0ZWRTZWNyZXQoJ3ByZXJlcV9hZG1pbicpLFxuICAgICAgLy8gRGV2OiBwdWJsaWNseSBhY2Nlc3NpYmxlIGZvciBsb2NhbCB0b29scywgU3RhZ2UvUHJvZDogcHJpdmF0ZVxuICAgICAgcHVibGljbHlBY2Nlc3NpYmxlOiBlbnYgPT09ICdkZXYnLFxuICAgICAgYmFja3VwUmV0ZW50aW9uOiBjZGsuRHVyYXRpb24uZGF5cyg3KSxcbiAgICAgIC8vIFByb2Q6IGVuYWJsZSBkZWxldGlvbiBwcm90ZWN0aW9uLCBEZXYvU3RhZ2U6IGFsbG93IGVhc3kgY2xlYW51cFxuICAgICAgZGVsZXRpb25Qcm90ZWN0aW9uOiBpc1Byb2QsXG4gICAgICByZW1vdmFsUG9saWN5OiBpc1Byb2QgPyBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4gOiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgIH0pO1xuXG4gICAgLy8gQWRkIGF1dG9tYXRpYyBzZWNyZXQgcm90YXRpb24gZm9yIGRhdGFiYXNlXG4gICAgZGF0YWJhc2UuYWRkUm90YXRpb25TaW5nbGVVc2VyKCk7XG5cbiAgICAvLyBSRFMgUHJveHkgY29uZmlndXJhdGlvbiBiYXNlZCBvbiBlbnZpcm9ubWVudFxuICAgIGxldCBkYlByb3h5OiByZHMuRGF0YWJhc2VQcm94eSB8IHVuZGVmaW5lZDtcbiAgICBsZXQgZGJFbmRwb2ludDogc3RyaW5nO1xuICAgIFxuICAgIGlmIChlbnYgIT09ICdkZXYnKSB7XG4gICAgICAvLyBTdGFnZS9Qcm9kOiBDcmVhdGUgUkRTIFByb3h5XG4gICAgICBkYlByb3h5ID0gbmV3IHJkcy5EYXRhYmFzZVByb3h5KHRoaXMsICdQcmVyZXFEYXRhYmFzZVByb3h5Jywge1xuICAgICAgICBwcm94eVRhcmdldDogcmRzLlByb3h5VGFyZ2V0LmZyb21JbnN0YW5jZShkYXRhYmFzZSksXG4gICAgICAgIHNlY3JldHM6IFtkYXRhYmFzZS5zZWNyZXQhXSxcbiAgICAgICAgdnBjLFxuICAgICAgICB2cGNTdWJuZXRzOiB7XG4gICAgICAgICAgc3VibmV0VHlwZTogZWMyLlN1Ym5ldFR5cGUuUFJJVkFURV9JU09MQVRFRCxcbiAgICAgICAgfSxcbiAgICAgICAgc2VjdXJpdHlHcm91cHM6IFtkYlNlY3VyaXR5R3JvdXBdLFxuICAgICAgICByZXF1aXJlVExTOiB0cnVlLFxuICAgICAgfSk7XG5cbiAgICAgIC8vIFN0YWdlOiBNYWtlIHByb3h5IHB1YmxpY2x5IGFjY2Vzc2libGUsIFByb2Q6IGtlZXAgcHJpdmF0ZVxuICAgICAgaWYgKGlzU3RhZ2UpIHtcbiAgICAgICAgLy8gQ3JlYXRlIHNlcGFyYXRlIHByb3h5IHNlY3VyaXR5IGdyb3VwIGZvciBzdGFnZSBwdWJsaWMgYWNjZXNzXG4gICAgICAgIGNvbnN0IHByb3h5UHVibGljU2cgPSBuZXcgZWMyLlNlY3VyaXR5R3JvdXAodGhpcywgJ1ByZXJlcVByb3h5UHVibGljU0cnLCB7XG4gICAgICAgICAgdnBjLFxuICAgICAgICAgIGRlc2NyaXB0aW9uOiAnUHVibGljIGFjY2VzcyBzZWN1cml0eSBncm91cCBmb3IgUkRTIFByb3h5IChzdGFnZSBvbmx5KScsXG4gICAgICAgICAgYWxsb3dBbGxPdXRib3VuZDogdHJ1ZSxcbiAgICAgICAgfSk7XG4gICAgICAgIFxuICAgICAgICAvLyBBbGxvdyBhY2Nlc3MgZnJvbSBhbnl3aGVyZSB0byBwcm94eSBpbiBzdGFnZSAoZm9yIGZvdW5kZXJzL2RlbW8gY2xpZW50cylcbiAgICAgICAgcHJveHlQdWJsaWNTZy5hZGRJbmdyZXNzUnVsZShcbiAgICAgICAgICBlYzIuUGVlci5hbnlJcHY0KCksXG4gICAgICAgICAgZWMyLlBvcnQudGNwKDU0MzIpLFxuICAgICAgICAgICdBbGxvdyBwdWJsaWMgYWNjZXNzIHRvIFJEUyBQcm94eSAoc3RhZ2Ugb25seSknXG4gICAgICAgICk7XG5cbiAgICAgICAgLy8gTm90ZTogSW4gcmVhbCBpbXBsZW1lbnRhdGlvbiwgeW91J2QgbmVlZCB0byBjcmVhdGUgYSBzZXBhcmF0ZSBwcm94eSBvciBjb25maWd1cmUgQUxCXG4gICAgICAgIC8vIFRoaXMgaXMgYSBzaW1wbGlmaWVkIGFwcHJvYWNoIC0gaW4gcHJhY3RpY2UsIHlvdSBtaWdodCB1c2UgYW4gQXBwbGljYXRpb24gTG9hZCBCYWxhbmNlclxuICAgICAgfVxuICAgICAgXG4gICAgICBkYkVuZHBvaW50ID0gZGJQcm94eS5lbmRwb2ludDtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gRGV2OiBEaXJlY3QgZGF0YWJhc2UgY29ubmVjdGlvblxuICAgICAgZGJFbmRwb2ludCA9IGRhdGFiYXNlLmluc3RhbmNlRW5kcG9pbnQuaG9zdG5hbWU7XG4gICAgfVxuXG4gICAgLy8gT3B0aW9uYWw6IFNTTSBCYXN0aW9uIGZvciBwcm9kIGRlYnVnZ2luZyAodDMubmFubylcbiAgICBsZXQgYmFzdGlvbkluc3RhbmNlOiBlYzIuSW5zdGFuY2UgfCB1bmRlZmluZWQ7XG4gICAgaWYgKGlzUHJvZCkge1xuICAgICAgLy8gQmFzdGlvbiBzZWN1cml0eSBncm91cFxuICAgICAgY29uc3QgYmFzdGlvblNnID0gbmV3IGVjMi5TZWN1cml0eUdyb3VwKHRoaXMsICdQcmVyZXFCYXN0aW9uU0cnLCB7XG4gICAgICAgIHZwYyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdTZWN1cml0eSBncm91cCBmb3IgUFJFUkVRIFNTTSBiYXN0aW9uJyxcbiAgICAgICAgYWxsb3dBbGxPdXRib3VuZDogdHJ1ZSxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBCYXN0aW9uIGluc3RhbmNlIGZvciBwb3J0IGZvcndhcmRpbmcgaW4gcHJvZFxuICAgICAgYmFzdGlvbkluc3RhbmNlID0gbmV3IGVjMi5JbnN0YW5jZSh0aGlzLCAnUHJlcmVxQmFzdGlvbicsIHtcbiAgICAgICAgaW5zdGFuY2VUeXBlOiBlYzIuSW5zdGFuY2VUeXBlLm9mKGVjMi5JbnN0YW5jZUNsYXNzLlQzLCBlYzIuSW5zdGFuY2VTaXplLk5BTk8pLFxuICAgICAgICBtYWNoaW5lSW1hZ2U6IGVjMi5NYWNoaW5lSW1hZ2UubGF0ZXN0QW1hem9uTGludXgyMDIzKCksXG4gICAgICAgIHZwYyxcbiAgICAgICAgdnBjU3VibmV0czoge1xuICAgICAgICAgIHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBSSVZBVEVfSVNPTEFURUQsXG4gICAgICAgIH0sXG4gICAgICAgIHNlY3VyaXR5R3JvdXA6IGJhc3Rpb25TZyxcbiAgICAgICAgcm9sZTogbmV3IGlhbS5Sb2xlKHRoaXMsICdQcmVyZXFCYXN0aW9uUm9sZScsIHtcbiAgICAgICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnZWMyLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgICAgICBtYW5hZ2VkUG9saWNpZXM6IFtcbiAgICAgICAgICAgIGlhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZSgnQW1hem9uU1NNTWFuYWdlZEluc3RhbmNlQ29yZScpLFxuICAgICAgICAgIF0sXG4gICAgICAgIH0pLFxuICAgICAgICB1c2VyRGF0YTogZWMyLlVzZXJEYXRhLmZvckxpbnV4KCksXG4gICAgICB9KTtcblxuICAgICAgLy8gQWxsb3cgYmFzdGlvbiB0byBhY2Nlc3MgZGF0YWJhc2VcbiAgICAgIGRiU2VjdXJpdHlHcm91cC5hZGRJbmdyZXNzUnVsZShcbiAgICAgICAgYmFzdGlvblNnLFxuICAgICAgICBlYzIuUG9ydC50Y3AoNTQzMiksXG4gICAgICAgICdBbGxvdyBQb3N0Z3JlU1FMIGFjY2VzcyBmcm9tIGJhc3Rpb24gKHByb2Qgb25seSknXG4gICAgICApO1xuICAgIH1cblxuICAgIC8vIEpXVCBTZWNyZXQgaW4gU2VjcmV0cyBNYW5hZ2VyXG4gICAgY29uc3Qgand0U2VjcmV0ID0gbmV3IHNlY3JldHNtYW5hZ2VyLlNlY3JldCh0aGlzLCAnSnd0U2VjcmV0Jywge1xuICAgICAgZGVzY3JpcHRpb246ICdKV1Qgc2lnbmluZyBzZWNyZXQgZm9yIFBSRVJFUSBBUEknLFxuICAgICAgZ2VuZXJhdGVTZWNyZXRTdHJpbmc6IHtcbiAgICAgICAgZXhjbHVkZVB1bmN0dWF0aW9uOiB0cnVlLFxuICAgICAgICBwYXNzd29yZExlbmd0aDogMzIsXG4gICAgICB9LFxuICAgICAgcmVtb3ZhbFBvbGljeTogaXNQcm9kID8gY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOIDogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICB9KTtcblxuICAgIC8vIENvZ25pdG8gVXNlciBQb29sXG4gICAgY29uc3QgdXNlclBvb2wgPSBuZXcgY29nbml0by5Vc2VyUG9vbCh0aGlzLCAnUHJlcmVxVXNlclBvb2wnLCB7XG4gICAgICB1c2VyUG9vbE5hbWU6ICdwcmVyZXEtdXNlcnMnLFxuICAgICAgc2VsZlNpZ25VcEVuYWJsZWQ6IHRydWUsXG4gICAgICBzaWduSW5BbGlhc2VzOiB7XG4gICAgICAgIGVtYWlsOiB0cnVlLFxuICAgICAgfSxcbiAgICAgIHN0YW5kYXJkQXR0cmlidXRlczoge1xuICAgICAgICBlbWFpbDoge1xuICAgICAgICAgIHJlcXVpcmVkOiB0cnVlLFxuICAgICAgICAgIG11dGFibGU6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICAgIGZ1bGxuYW1lOiB7XG4gICAgICAgICAgcmVxdWlyZWQ6IGZhbHNlLFxuICAgICAgICAgIG11dGFibGU6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgcGFzc3dvcmRQb2xpY3k6IHtcbiAgICAgICAgbWluTGVuZ3RoOiA4LFxuICAgICAgICByZXF1aXJlTG93ZXJjYXNlOiB0cnVlLFxuICAgICAgICByZXF1aXJlVXBwZXJjYXNlOiB0cnVlLFxuICAgICAgICByZXF1aXJlRGlnaXRzOiB0cnVlLFxuICAgICAgICByZXF1aXJlU3ltYm9sczogdHJ1ZSxcbiAgICAgIH0sXG4gICAgICBhY2NvdW50UmVjb3Zlcnk6IGNvZ25pdG8uQWNjb3VudFJlY292ZXJ5LkVNQUlMX09OTFksXG4gICAgfSk7XG5cbiAgICAvLyBDb2duaXRvIFVzZXIgUG9vbCBDbGllbnRcbiAgICBjb25zdCB1c2VyUG9vbENsaWVudCA9IG5ldyBjb2duaXRvLlVzZXJQb29sQ2xpZW50KHRoaXMsICdQcmVyZXFVc2VyUG9vbENsaWVudCcsIHtcbiAgICAgIHVzZXJQb29sLFxuICAgICAgdXNlclBvb2xDbGllbnROYW1lOiAncHJlcmVxLWNsaWVudCcsXG4gICAgICBnZW5lcmF0ZVNlY3JldDogZmFsc2UsXG4gICAgICBhdXRoRmxvd3M6IHtcbiAgICAgICAgYWRtaW5Vc2VyUGFzc3dvcmQ6IHRydWUsXG4gICAgICAgIHVzZXJQYXNzd29yZDogdHJ1ZSxcbiAgICAgICAgdXNlclNycDogdHJ1ZSxcbiAgICAgIH0sXG4gICAgICBvQXV0aDoge1xuICAgICAgICBmbG93czoge1xuICAgICAgICAgIGF1dGhvcml6YXRpb25Db2RlR3JhbnQ6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICAgIHNjb3BlczogW2NvZ25pdG8uT0F1dGhTY29wZS5FTUFJTCwgY29nbml0by5PQXV0aFNjb3BlLk9QRU5JRCwgY29nbml0by5PQXV0aFNjb3BlLlBST0ZJTEVdLFxuICAgICAgICBjYWxsYmFja1VybHM6IFsnaHR0cDovL2xvY2FsaG9zdDo1MTczL2NhbGxiYWNrJywgJ2h0dHBzOi8veW91ci1kb21haW4uY29tL2NhbGxiYWNrJ10sXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gRW52aXJvbm1lbnQtc3BlY2lmaWMgdGhyb3R0bGluZyByYXRlc1xuICAgIGNvbnN0IHRocm90dGxlQ29uZmlnID0ge1xuICAgICAgZGV2OiB7IHJhdGU6IHVuZGVmaW5lZCwgYnVyc3Q6IHVuZGVmaW5lZCB9LCAvLyBVbmxpbWl0ZWRcbiAgICAgIHN0YWdlOiB7IHJhdGU6IDIwLCBidXJzdDogMTAgfSxcbiAgICAgIHByb2Q6IHsgcmF0ZTogNTAsIGJ1cnN0OiAyMCB9XG4gICAgfTtcblxuICAgIGNvbnN0IGN1cnJlbnRUaHJvdHRsZSA9IHRocm90dGxlQ29uZmlnW2VudiBhcyBrZXlvZiB0eXBlb2YgdGhyb3R0bGVDb25maWddO1xuXG4gICAgLy8gTGFtYmRhIEZ1bmN0aW9uIHVzaW5nIHJlZ3VsYXIgRnVuY3Rpb24gKG5vIERvY2tlciByZXF1aXJlZClcbiAgICBjb25zdCBhcGlMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdQcmVyZXFBUElMYW1iZGEnLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMThfWCxcbiAgICAgIGhhbmRsZXI6ICdtYWluLmhhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KCcuLi9iYWNrZW5kL2Rpc3QnKSxcbiAgICAgIHZwYyxcbiAgICAgIHNlY3VyaXR5R3JvdXBzOiBbbGFtYmRhU2ddLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgREJfU0VDUkVUX0FSTjogZGF0YWJhc2Uuc2VjcmV0IS5zZWNyZXRBcm4sXG4gICAgICAgIERCX0hPU1Q6IGRiRW5kcG9pbnQsXG4gICAgICAgIC4uLihkYlByb3h5ICYmIHsgREJfUFJPWFlfRU5EUE9JTlQ6IGRiUHJveHkuZW5kcG9pbnQgfSksXG4gICAgICAgIEpXVF9TRUNSRVRfQVJOOiBqd3RTZWNyZXQuc2VjcmV0QXJuLFxuICAgICAgICBDT0dOSVRPX1VTRVJfUE9PTF9JRDogdXNlclBvb2wudXNlclBvb2xJZCxcbiAgICAgICAgQ09HTklUT19DTElFTlRfSUQ6IHVzZXJQb29sQ2xpZW50LnVzZXJQb29sQ2xpZW50SWQsXG4gICAgICAgIE5PREVfRU5WOiBlbnYsXG4gICAgICB9LFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgbWVtb3J5U2l6ZTogNTEyLFxuICAgIH0pO1xuXG4gICAgLy8gTGFtYmRhIGxvZyBncm91cCB3aXRoIHN5bW1ldHJpYyByZXRlbnRpb25cbiAgICBuZXcgbG9ncy5Mb2dHcm91cCh0aGlzLCAnUHJlcmVxQVBJTGFtYmRhTG9ncycsIHtcbiAgICAgIGxvZ0dyb3VwTmFtZTogYC9hd3MvbGFtYmRhLyR7YXBpTGFtYmRhLmZ1bmN0aW9uTmFtZX1gLFxuICAgICAgcmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX01PTlRILFxuICAgIH0pO1xuXG4gICAgLy8gR3JhbnQgTGFtYmRhIGFjY2VzcyB0byBkYXRhYmFzZS9wcm94eSBhbmQgc2VjcmV0c1xuICAgIGlmIChkYlByb3h5KSB7XG4gICAgICBkYlByb3h5LmdyYW50Q29ubmVjdChhcGlMYW1iZGEsICdwcmVyZXFfYWRtaW4nKTtcbiAgICB9IGVsc2Uge1xuICAgICAgZGF0YWJhc2UuZ3JhbnRDb25uZWN0KGFwaUxhbWJkYSk7XG4gICAgfVxuICAgIGRhdGFiYXNlLnNlY3JldD8uZ3JhbnRSZWFkKGFwaUxhbWJkYSk7XG4gICAgand0U2VjcmV0LmdyYW50UmVhZChhcGlMYW1iZGEpO1xuXG4gICAgLy8gQWNjZXNzLWxvZyBncm91cFxuICAgIGNvbnN0IGFwaUxvZ3MgPSBuZXcgbG9ncy5Mb2dHcm91cCh0aGlzLCAnUHJlcmVxQXBpTG9ncycsIHtcbiAgICAgIHJldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9NT05USCxcbiAgICB9KTtcblxuICAgIC8vIEFQSSBHYXRld2F5IHdpdGggZW52aXJvbm1lbnQtc3BlY2lmaWMgdGhyb3R0bGluZ1xuICAgIGNvbnN0IGRlcGxveU9wdGlvbnM6IGFueSA9IHtcbiAgICAgIHN0YWdlTmFtZTogZW52LFxuICAgICAgbWV0cmljc0VuYWJsZWQ6IHRydWUsXG4gICAgICBsb2dnaW5nTGV2ZWw6IGFwaWdhdGV3YXkuTWV0aG9kTG9nZ2luZ0xldmVsLklORk8sXG4gICAgICBhY2Nlc3NMb2dEZXN0aW5hdGlvbjogbmV3IGFwaWdhdGV3YXkuTG9nR3JvdXBMb2dEZXN0aW5hdGlvbihhcGlMb2dzKSxcbiAgICAgIGFjY2Vzc0xvZ0Zvcm1hdDogYXBpZ2F0ZXdheS5BY2Nlc3NMb2dGb3JtYXQuanNvbldpdGhTdGFuZGFyZEZpZWxkcyh7XG4gICAgICAgIGNhbGxlcjogdHJ1ZSxcbiAgICAgICAgaHR0cE1ldGhvZDogdHJ1ZSxcbiAgICAgICAgaXA6IHRydWUsXG4gICAgICAgIHByb3RvY29sOiB0cnVlLFxuICAgICAgICByZXF1ZXN0VGltZTogdHJ1ZSxcbiAgICAgICAgcmVzb3VyY2VQYXRoOiB0cnVlLFxuICAgICAgICByZXNwb25zZUxlbmd0aDogdHJ1ZSxcbiAgICAgICAgc3RhdHVzOiB0cnVlLFxuICAgICAgICB1c2VyOiB0cnVlLFxuICAgICAgfSksXG4gICAgfTtcblxuICAgIC8vIEFkZCB0aHJvdHRsaW5nIG9ubHkgZm9yIHN0YWdlL3Byb2RcbiAgICBpZiAoY3VycmVudFRocm90dGxlLnJhdGUgJiYgY3VycmVudFRocm90dGxlLmJ1cnN0KSB7XG4gICAgICBkZXBsb3lPcHRpb25zLnRocm90dGxpbmdSYXRlTGltaXQgPSBjdXJyZW50VGhyb3R0bGUucmF0ZTtcbiAgICAgIGRlcGxveU9wdGlvbnMudGhyb3R0bGluZ0J1cnN0TGltaXQgPSBjdXJyZW50VGhyb3R0bGUuYnVyc3Q7XG4gICAgfVxuXG4gICAgY29uc3QgYXBpID0gbmV3IGFwaWdhdGV3YXkuUmVzdEFwaSh0aGlzLCAnUHJlcmVxQVBJJywge1xuICAgICAgcmVzdEFwaU5hbWU6ICdQUkVSRVEgQVBJJyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnUFJFUkVRIFByb2plY3QgTWFuYWdlbWVudCBBUEknLFxuICAgICAgZGVmYXVsdENvcnNQcmVmbGlnaHRPcHRpb25zOiB7XG4gICAgICAgIGFsbG93T3JpZ2luczogYXBpZ2F0ZXdheS5Db3JzLkFMTF9PUklHSU5TLFxuICAgICAgICBhbGxvd01ldGhvZHM6IGFwaWdhdGV3YXkuQ29ycy5BTExfTUVUSE9EUyxcbiAgICAgICAgYWxsb3dIZWFkZXJzOiBbJ0NvbnRlbnQtVHlwZScsICdBdXRob3JpemF0aW9uJ10sXG4gICAgICB9LFxuICAgICAgZGVwbG95T3B0aW9ucyxcbiAgICB9KTtcblxuICAgIC8vIEFQSSBHYXRld2F5IEludGVncmF0aW9uXG4gICAgY29uc3QgaW50ZWdyYXRpb24gPSBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihhcGlMYW1iZGEpO1xuXG4gICAgLy8gQVBJIFJvdXRlc1xuICAgIGFwaS5yb290LmFkZFByb3h5KHtcbiAgICAgIGRlZmF1bHRJbnRlZ3JhdGlvbjogaW50ZWdyYXRpb24sXG4gICAgICBhbnlNZXRob2Q6IHRydWUsXG4gICAgfSk7XG5cbiAgICAvLyBXQUYgZm9yIHN0YWdlL3Byb2Qgb25seSAoZGV2IGhhcyBubyBXQUYpXG4gICAgaWYgKGVudiAhPT0gJ2RldicpIHtcbiAgICAgIGNvbnN0IHdlYkFjbCA9IG5ldyB3YWZ2Mi5DZm5XZWJBQ0wodGhpcywgJ0FwaVdhZicsIHtcbiAgICAgICAgZGVmYXVsdEFjdGlvbjogeyBhbGxvdzoge30gfSxcbiAgICAgICAgc2NvcGU6ICdSRUdJT05BTCcsXG4gICAgICAgIHZpc2liaWxpdHlDb25maWc6IHtcbiAgICAgICAgICBjbG91ZFdhdGNoTWV0cmljc0VuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgbWV0cmljTmFtZTogJ1ByZXJlcUFwaVdhZicsXG4gICAgICAgICAgc2FtcGxlZFJlcXVlc3RzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgICAgbmFtZTogJ1ByZXJlcUFwaVdhZicsXG4gICAgICAgIHJ1bGVzOiBbXG4gICAgICAgICAge1xuICAgICAgICAgICAgbmFtZTogJ0FXUy1BV1NNYW5hZ2VkQ29tbW9uUnVsZVNldCcsXG4gICAgICAgICAgICBwcmlvcml0eTogMCxcbiAgICAgICAgICAgIHN0YXRlbWVudDogeyBtYW5hZ2VkUnVsZUdyb3VwU3RhdGVtZW50OiB7XG4gICAgICAgICAgICAgIG5hbWU6ICdBV1NNYW5hZ2VkUnVsZXNDb21tb25SdWxlU2V0JyxcbiAgICAgICAgICAgICAgdmVuZG9yTmFtZTogJ0FXUycsXG4gICAgICAgICAgICB9fSxcbiAgICAgICAgICAgIG92ZXJyaWRlQWN0aW9uOiB7IG5vbmU6IHt9IH0sXG4gICAgICAgICAgICB2aXNpYmlsaXR5Q29uZmlnOiB7XG4gICAgICAgICAgICAgIGNsb3VkV2F0Y2hNZXRyaWNzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICAgICAgbWV0cmljTmFtZTogJ0NvbW1vblJ1bGVzJyxcbiAgICAgICAgICAgICAgc2FtcGxlZFJlcXVlc3RzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBuYW1lOiAnSXBSYXRlTGltaXQnLFxuICAgICAgICAgICAgcHJpb3JpdHk6IDEsXG4gICAgICAgICAgICBzdGF0ZW1lbnQ6IHtcbiAgICAgICAgICAgICAgcmF0ZUJhc2VkU3RhdGVtZW50OiB7XG4gICAgICAgICAgICAgICAgbGltaXQ6IDIwMDAsICAgICAgICAgLy8gMjAwMCByZXF1ZXN0cyBpbiA1IG1pbiBwZXIgSVBcbiAgICAgICAgICAgICAgICBhZ2dyZWdhdGVLZXlUeXBlOiAnSVAnLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGFjdGlvbjogeyBibG9jazoge30gfSxcbiAgICAgICAgICAgIHZpc2liaWxpdHlDb25maWc6IHtcbiAgICAgICAgICAgICAgY2xvdWRXYXRjaE1ldHJpY3NFbmFibGVkOiB0cnVlLFxuICAgICAgICAgICAgICBtZXRyaWNOYW1lOiAnSXBSYXRlTGltaXQnLFxuICAgICAgICAgICAgICBzYW1wbGVkUmVxdWVzdHNFbmFibGVkOiB0cnVlLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICBdLFxuICAgICAgfSk7XG5cbiAgICAgIC8vIEFzc29jaWF0ZSBXQUYgd2l0aCBBUEkgR2F0ZXdheVxuICAgICAgbmV3IHdhZnYyLkNmbldlYkFDTEFzc29jaWF0aW9uKHRoaXMsICdBcGlXYWZBc3NvYycsIHtcbiAgICAgICAgd2ViQWNsQXJuOiB3ZWJBY2wuYXR0ckFybixcbiAgICAgICAgcmVzb3VyY2VBcm46IGFwaS5kZXBsb3ltZW50U3RhZ2Uuc3RhZ2VBcm4sXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBQcml2YXRlIFMzIEJ1Y2tldCBmb3IgRnJvbnRlbmRcbiAgICBjb25zdCBmcm9udGVuZEJ1Y2tldCA9IG5ldyBzMy5CdWNrZXQodGhpcywgJ1ByZXJlcUZyb250ZW5kQnVja2V0Jywge1xuICAgICAgYnVja2V0TmFtZTogYHByZXJlcS1mcm9udGVuZC0ke2Vudn0tJHt0aGlzLmFjY291bnR9LSR7dGhpcy5yZWdpb259YCxcbiAgICAgIHB1YmxpY1JlYWRBY2Nlc3M6IGZhbHNlLFxuICAgICAgYmxvY2tQdWJsaWNBY2Nlc3M6IHMzLkJsb2NrUHVibGljQWNjZXNzLkJMT0NLX0FMTCxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGlzUHJvZCA/IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTiA6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICBhdXRvRGVsZXRlT2JqZWN0czogIWlzUHJvZCxcbiAgICB9KTtcblxuICAgIC8vIENsb3VkRnJvbnQgT3JpZ2luIEFjY2VzcyBJZGVudGl0eVxuICAgIGNvbnN0IG9yaWdpbkFjY2Vzc0lkZW50aXR5ID0gbmV3IGNsb3VkZnJvbnQuT3JpZ2luQWNjZXNzSWRlbnRpdHkodGhpcywgJ1ByZXJlcU9BSScsIHtcbiAgICAgIGNvbW1lbnQ6ICdPQUkgZm9yIFBSRVJFUSBmcm9udGVuZCBidWNrZXQnLFxuICAgIH0pO1xuXG4gICAgLy8gR3JhbnQgQ2xvdWRGcm9udCByZWFkIGFjY2VzcyB0byB0aGUgYnVja2V0XG4gICAgZnJvbnRlbmRCdWNrZXQuZ3JhbnRSZWFkKG9yaWdpbkFjY2Vzc0lkZW50aXR5KTtcblxuICAgIC8vIENsb3VkRnJvbnQgRGlzdHJpYnV0aW9uIHdpdGggU1BBLW9wdGltaXplZCBjYWNoaW5nXG4gICAgY29uc3QgZGlzdHJpYnV0aW9uID0gbmV3IGNsb3VkZnJvbnQuRGlzdHJpYnV0aW9uKHRoaXMsICdQcmVyZXFEaXN0cmlidXRpb24nLCB7XG4gICAgICBkZWZhdWx0QmVoYXZpb3I6IHtcbiAgICAgICAgb3JpZ2luOiBuZXcgb3JpZ2lucy5TM09yaWdpbihmcm9udGVuZEJ1Y2tldCwge1xuICAgICAgICAgIG9yaWdpbkFjY2Vzc0lkZW50aXR5LFxuICAgICAgICB9KSxcbiAgICAgICAgdmlld2VyUHJvdG9jb2xQb2xpY3k6IGNsb3VkZnJvbnQuVmlld2VyUHJvdG9jb2xQb2xpY3kuUkVESVJFQ1RfVE9fSFRUUFMsXG4gICAgICAgIGFsbG93ZWRNZXRob2RzOiBjbG91ZGZyb250LkFsbG93ZWRNZXRob2RzLkFMTE9XX0FMTCxcbiAgICAgICAgY2FjaGVkTWV0aG9kczogY2xvdWRmcm9udC5DYWNoZWRNZXRob2RzLkNBQ0hFX0dFVF9IRUFEX09QVElPTlMsXG4gICAgICAgIGNhY2hlUG9saWN5OiBjbG91ZGZyb250LkNhY2hlUG9saWN5LkNBQ0hJTkdfRElTQUJMRUQsXG4gICAgICB9LFxuICAgICAgZGVmYXVsdFJvb3RPYmplY3Q6ICdpbmRleC5odG1sJyxcbiAgICAgIGVycm9yUmVzcG9uc2VzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBodHRwU3RhdHVzOiA0MDQsXG4gICAgICAgICAgcmVzcG9uc2VIdHRwU3RhdHVzOiAyMDAsXG4gICAgICAgICAgcmVzcG9uc2VQYWdlUGF0aDogJy9pbmRleC5odG1sJyxcbiAgICAgICAgICB0dGw6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDApLCAvLyBObyBjYWNoaW5nIGZvciBTUEEgcm91dGVzXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBodHRwU3RhdHVzOiA0MDMsXG4gICAgICAgICAgcmVzcG9uc2VIdHRwU3RhdHVzOiAyMDAsXG4gICAgICAgICAgcmVzcG9uc2VQYWdlUGF0aDogJy9pbmRleC5odG1sJyxcbiAgICAgICAgICB0dGw6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDApLCAvLyBObyBjYWNoaW5nIGZvciBTUEEgcm91dGVzXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgLy8gU3RvcmUgc2Vuc2l0aXZlIHZhbHVlcyBpbiBTU00gUGFyYW1ldGVyc1xuICAgIG5ldyBzc20uU3RyaW5nUGFyYW1ldGVyKHRoaXMsICdEYXRhYmFzZUVuZHBvaW50UGFyYW0nLCB7XG4gICAgICBwYXJhbWV0ZXJOYW1lOiBgL3ByZXJlcS8ke2Vudn0vZGF0YWJhc2UvZW5kcG9pbnRgLFxuICAgICAgc3RyaW5nVmFsdWU6IGRhdGFiYXNlLmluc3RhbmNlRW5kcG9pbnQuaG9zdG5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogYFJEUyBEYXRhYmFzZSBFbmRwb2ludCAoJHtlbnZ9KWAsXG4gICAgfSk7XG5cbiAgICBpZiAoZGJQcm94eSkge1xuICAgICAgbmV3IHNzbS5TdHJpbmdQYXJhbWV0ZXIodGhpcywgJ0RhdGFiYXNlUHJveHlFbmRwb2ludFBhcmFtJywge1xuICAgICAgICBwYXJhbWV0ZXJOYW1lOiBgL3ByZXJlcS8ke2Vudn0vZGF0YWJhc2UvcHJveHktZW5kcG9pbnRgLFxuICAgICAgICBzdHJpbmdWYWx1ZTogZGJQcm94eS5lbmRwb2ludCxcbiAgICAgICAgZGVzY3JpcHRpb246IGBSRFMgUHJveHkgRW5kcG9pbnQgKCR7ZW52fSlgLFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgbmV3IHNzbS5TdHJpbmdQYXJhbWV0ZXIodGhpcywgJ0RhdGFiYXNlU2VjcmV0QXJuUGFyYW0nLCB7XG4gICAgICBwYXJhbWV0ZXJOYW1lOiBgL3ByZXJlcS8ke2Vudn0vZGF0YWJhc2Uvc2VjcmV0LWFybmAsXG4gICAgICBzdHJpbmdWYWx1ZTogZGF0YWJhc2Uuc2VjcmV0Py5zZWNyZXRBcm4gfHwgJycsXG4gICAgICBkZXNjcmlwdGlvbjogYFJEUyBEYXRhYmFzZSBTZWNyZXQgQVJOICgke2Vudn0pYCxcbiAgICB9KTtcblxuICAgIG5ldyBzc20uU3RyaW5nUGFyYW1ldGVyKHRoaXMsICdKd3RTZWNyZXRBcm5QYXJhbScsIHtcbiAgICAgIHBhcmFtZXRlck5hbWU6IGAvcHJlcmVxLyR7ZW52fS9qd3Qvc2VjcmV0LWFybmAsXG4gICAgICBzdHJpbmdWYWx1ZTogand0U2VjcmV0LnNlY3JldEFybixcbiAgICAgIGRlc2NyaXB0aW9uOiBgSldUIFNlY3JldCBBUk4gKCR7ZW52fSlgLFxuICAgIH0pO1xuXG4gICAgLy8gRW52aXJvbm1lbnQtc3BlY2lmaWMgb3V0cHV0c1xuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdFbnZpcm9ubWVudCcsIHtcbiAgICAgIHZhbHVlOiBlbnYsXG4gICAgICBkZXNjcmlwdGlvbjogJ0RlcGxveW1lbnQgZW52aXJvbm1lbnQnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0RhdGFiYXNlQ29uZmlndXJhdGlvbicsIHtcbiAgICAgIHZhbHVlOiBlbnYgPT09ICdkZXYnIFxuICAgICAgICA/ICdQdWJsaWMgZGF0YWJhc2UgKGRpcmVjdCBhY2Nlc3MpJyBcbiAgICAgICAgOiBpc1N0YWdlIFxuICAgICAgICAgID8gJ1ByaXZhdGUgZGF0YWJhc2UgKyBwdWJsaWMgcHJveHknXG4gICAgICAgICAgOiAnUHJpdmF0ZSBkYXRhYmFzZSArIHByaXZhdGUgcHJveHknLFxuICAgICAgZGVzY3JpcHRpb246ICdEYXRhYmFzZSBhY2Nlc3MgY29uZmlndXJhdGlvbicsXG4gICAgfSk7XG5cbiAgICBpZiAoY3VycmVudFRocm90dGxlLnJhdGUgJiYgY3VycmVudFRocm90dGxlLmJ1cnN0KSB7XG4gICAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnVGhyb3R0bGluZ0NvbmZpZ3VyYXRpb24nLCB7XG4gICAgICAgIHZhbHVlOiBgJHtjdXJyZW50VGhyb3R0bGUucmF0ZX0vJHtjdXJyZW50VGhyb3R0bGUuYnVyc3R9IChyYXRlL2J1cnN0KWAsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnQVBJIEdhdGV3YXkgdGhyb3R0bGluZyBsaW1pdHMnLFxuICAgICAgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdUaHJvdHRsaW5nQ29uZmlndXJhdGlvbicsIHtcbiAgICAgICAgdmFsdWU6ICdVbmxpbWl0ZWQnLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ0FQSSBHYXRld2F5IHRocm90dGxpbmcgbGltaXRzJyxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdXQUZQcm90ZWN0aW9uJywge1xuICAgICAgdmFsdWU6IGVudiA9PT0gJ2RldicgPyAnRGlzYWJsZWQnIDogJ0VuYWJsZWQnLFxuICAgICAgZGVzY3JpcHRpb246ICdXQUYgcHJvdGVjdGlvbiBzdGF0dXMnLFxuICAgIH0pO1xuXG4gICAgaWYgKGJhc3Rpb25JbnN0YW5jZSkge1xuICAgICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0Jhc3Rpb25JbnN0YW5jZUlkJywge1xuICAgICAgICB2YWx1ZTogYmFzdGlvbkluc3RhbmNlLmluc3RhbmNlSWQsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnQmFzdGlvbiBpbnN0YW5jZSBJRCBmb3IgU1NNIHBvcnQgZm9yd2FyZGluZyAocHJvZCBvbmx5KScsXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnRGF0YWJhc2VFbmRwb2ludCcsIHtcbiAgICAgIHZhbHVlOiBkYXRhYmFzZS5pbnN0YW5jZUVuZHBvaW50Lmhvc3RuYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdEaXJlY3QgZGF0YWJhc2UgZW5kcG9pbnQnLFxuICAgIH0pO1xuXG4gICAgaWYgKGRiUHJveHkpIHtcbiAgICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdEYXRhYmFzZVByb3h5RW5kcG9pbnQnLCB7XG4gICAgICAgIHZhbHVlOiBkYlByb3h5LmVuZHBvaW50LFxuICAgICAgICBkZXNjcmlwdGlvbjogJ1JEUyBQcm94eSBlbmRwb2ludCcsXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBTdGFuZGFyZCBvdXRwdXRzXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1VzZXJQb29sSWQnLCB7XG4gICAgICB2YWx1ZTogdXNlclBvb2wudXNlclBvb2xJZCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ29nbml0byBVc2VyIFBvb2wgSUQnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1VzZXJQb29sQ2xpZW50SWQnLCB7XG4gICAgICB2YWx1ZTogdXNlclBvb2xDbGllbnQudXNlclBvb2xDbGllbnRJZCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ29nbml0byBVc2VyIFBvb2wgQ2xpZW50IElEJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdBcGlVcmwnLCB7XG4gICAgICB2YWx1ZTogYXBpLnVybCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQVBJIEdhdGV3YXkgVVJMJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdGcm9udGVuZFVybCcsIHtcbiAgICAgIHZhbHVlOiBgaHR0cHM6Ly8ke2Rpc3RyaWJ1dGlvbi5kaXN0cmlidXRpb25Eb21haW5OYW1lfWAsXG4gICAgICBkZXNjcmlwdGlvbjogJ0Nsb3VkRnJvbnQgRGlzdHJpYnV0aW9uIFVSTCcsXG4gICAgfSk7XG4gIH1cbn0gIl19