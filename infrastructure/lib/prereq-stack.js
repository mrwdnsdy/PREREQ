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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJlcmVxLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsicHJlcmVxLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLG1DQUFtQztBQUNuQywyQ0FBMkM7QUFDM0MsMkNBQTJDO0FBQzNDLGlEQUFpRDtBQUNqRCxxRUFBK0Q7QUFDL0QseURBQXlEO0FBQ3pELG1EQUFtRDtBQUNuRCx5Q0FBeUM7QUFDekMseURBQXlEO0FBQ3pELDhEQUE4RDtBQUM5RCxpRUFBaUU7QUFDakUsK0NBQStDO0FBQy9DLDJDQUEyQztBQUMzQywyQ0FBMkM7QUFDM0MsNkNBQTZDO0FBRzdDLE1BQWEsV0FBWSxTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQ3hDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBc0I7O1FBQzlELEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLDRCQUE0QjtRQUM1QixNQUFNLEdBQUcsR0FBRyxNQUFBLElBQUksQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxtQ0FBSSxLQUFLLENBQUM7UUFDcEQsTUFBTSxNQUFNLEdBQUcsR0FBRyxLQUFLLE1BQU0sQ0FBQztRQUM5QixNQUFNLE9BQU8sR0FBRyxHQUFHLEtBQUssT0FBTyxDQUFDO1FBRWhDLG1EQUFtRDtRQUNuRCxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxPQUFPLENBQUMsSUFBSSxrQkFBa0IsQ0FBQztRQUVyRSx5Q0FBeUM7UUFDekMsTUFBTSxHQUFHLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxXQUFXLEVBQUU7WUFDekMsTUFBTSxFQUFFLENBQUM7WUFDVCxrRUFBa0U7WUFDbEUsV0FBVyxFQUFFLEdBQUcsS0FBSyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNsQyxtQkFBbUIsRUFBRTtn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cm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgKiBhcyByZHMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXJkcyc7XG5pbXBvcnQgKiBhcyBlYzIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWVjMic7XG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYSc7XG5pbXBvcnQgeyBOb2RlanNGdW5jdGlvbiB9IGZyb20gJ2F3cy1jZGstbGliL2F3cy1sYW1iZGEtbm9kZWpzJztcbmltcG9ydCAqIGFzIGFwaWdhdGV3YXkgZnJvbSAnYXdzLWNkay1saWIvYXdzLWFwaWdhdGV3YXknO1xuaW1wb3J0ICogYXMgY29nbml0byBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY29nbml0byc7XG5pbXBvcnQgKiBhcyBzMyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtczMnO1xuaW1wb3J0ICogYXMgY2xvdWRmcm9udCBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY2xvdWRmcm9udCc7XG5pbXBvcnQgKiBhcyBvcmlnaW5zIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jbG91ZGZyb250LW9yaWdpbnMnO1xuaW1wb3J0ICogYXMgc2VjcmV0c21hbmFnZXIgZnJvbSAnYXdzLWNkay1saWIvYXdzLXNlY3JldHNtYW5hZ2VyJztcbmltcG9ydCAqIGFzIHdhZnYyIGZyb20gJ2F3cy1jZGstbGliL2F3cy13YWZ2Mic7XG5pbXBvcnQgKiBhcyBzc20gZnJvbSAnYXdzLWNkay1saWIvYXdzLXNzbSc7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XG5pbXBvcnQgKiBhcyBsb2dzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sb2dzJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuXG5leHBvcnQgY2xhc3MgUHJlcmVxU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wcz86IGNkay5TdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICAvLyBFbnZpcm9ubWVudCBjb250ZXh0IGZsYWdzXG4gICAgY29uc3QgZW52ID0gdGhpcy5ub2RlLnRyeUdldENvbnRleHQoJ2VudicpID8/ICdkZXYnO1xuICAgIGNvbnN0IGlzUHJvZCA9IGVudiA9PT0gJ3Byb2QnO1xuICAgIGNvbnN0IGlzU3RhZ2UgPSBlbnYgPT09ICdzdGFnZSc7XG4gICAgXG4gICAgLy8gRGV2ZWxvcGVyIElQIGZvciBkZXYgZW52aXJvbm1lbnQgZGF0YWJhc2UgYWNjZXNzXG4gICAgY29uc3QgZGV2SVAgPSB0aGlzLm5vZGUudHJ5R2V0Q29udGV4dCgnZGV2SVAnKSB8fCAnMTA0LjI4LjEzMy4xNy8zMic7XG5cbiAgICAvLyBWUEMgY29uZmlndXJhdGlvbiBiYXNlZCBvbiBlbnZpcm9ubWVudFxuICAgIGNvbnN0IHZwYyA9IG5ldyBlYzIuVnBjKHRoaXMsICdQcmVyZXFWUEMnLCB7XG4gICAgICBtYXhBenM6IDIsXG4gICAgICAvLyBEZXY6IG5vIE5BVCAoY29zdCBzYXZpbmdzKSwgU3RhZ2UvUHJvZDogTkFUIGZvciBvdXRib3VuZCBhY2Nlc3NcbiAgICAgIG5hdEdhdGV3YXlzOiBlbnYgPT09ICdkZXYnID8gMCA6IDEsXG4gICAgICBzdWJuZXRDb25maWd1cmF0aW9uOiBbXG4gICAgICAgIHsgbmFtZTogJ1B1YmxpYycsIHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBVQkxJQywgY2lkck1hc2s6IDI0IH0sXG4gICAgICAgIHsgbmFtZTogJ1ByaXZhdGUnLCBzdWJuZXRUeXBlOiBlYzIuU3VibmV0VHlwZS5QUklWQVRFX0lTT0xBVEVELCBjaWRyTWFzazogMjQgfSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICAvLyBWUEMgRW5kcG9pbnRzIGZvciBkZXYgZW52aXJvbm1lbnQgKG5vIE5BVClcbiAgICBpZiAoZW52ID09PSAnZGV2Jykge1xuICAgICAgdnBjLmFkZEdhdGV3YXlFbmRwb2ludCgnUzNFbmRwb2ludCcsIHsgc2VydmljZTogZWMyLkdhdGV3YXlWcGNFbmRwb2ludEF3c1NlcnZpY2UuUzMgfSk7XG4gICAgICB2cGMuYWRkSW50ZXJmYWNlRW5kcG9pbnQoJ1NlY3JldHNFbmRwb2ludCcsIHtcbiAgICAgICAgc2VydmljZTogZWMyLkludGVyZmFjZVZwY0VuZHBvaW50QXdzU2VydmljZS5TRUNSRVRTX01BTkFHRVIsXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBMYW1iZGEgU2VjdXJpdHkgR3JvdXBcbiAgICBjb25zdCBsYW1iZGFTZyA9IG5ldyBlYzIuU2VjdXJpdHlHcm91cCh0aGlzLCAnUHJlcmVxTGFtYmRhU0cnLCB7XG4gICAgICB2cGMsXG4gICAgICBkZXNjcmlwdGlvbjogJ1NlY3VyaXR5IGdyb3VwIGZvciBQUkVSRVEgTGFtYmRhIGZ1bmN0aW9ucycsXG4gICAgICBhbGxvd0FsbE91dGJvdW5kOiB0cnVlLFxuICAgIH0pO1xuXG4gICAgLy8gRGF0YWJhc2UgU2VjdXJpdHkgR3JvdXAgd2l0aCBlbnZpcm9ubWVudC1hd2FyZSBhY2Nlc3NcbiAgICBjb25zdCBkYlNlY3VyaXR5R3JvdXAgPSBuZXcgZWMyLlNlY3VyaXR5R3JvdXAodGhpcywgJ1ByZXJlcURCU2VjdXJpdHlHcm91cCcsIHtcbiAgICAgIHZwYyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnU2VjdXJpdHkgZ3JvdXAgZm9yIFBSRVJFUSBSRFMgaW5zdGFuY2UnLFxuICAgICAgYWxsb3dBbGxPdXRib3VuZDogdHJ1ZSxcbiAgICB9KTtcblxuICAgIC8vIEFsbG93IFBvc3RncmVTUUwgYWNjZXNzIGZyb20gTGFtYmRhIChhbGwgZW52aXJvbm1lbnRzKVxuICAgIGRiU2VjdXJpdHlHcm91cC5hZGRJbmdyZXNzUnVsZShcbiAgICAgIGxhbWJkYVNnLFxuICAgICAgZWMyLlBvcnQudGNwKDU0MzIpLFxuICAgICAgJ0FsbG93IFBvc3RncmVTUUwgYWNjZXNzIGZyb20gTGFtYmRhJ1xuICAgICk7XG5cbiAgICAvLyBEZXYgb25seTogQWxsb3cgZGlyZWN0IGFjY2VzcyBmcm9tIGRldmVsb3BlciBJUFxuICAgIGlmIChlbnYgPT09ICdkZXYnKSB7XG4gICAgICBkYlNlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoXG4gICAgICAgIGVjMi5QZWVyLmlwdjQoZGV2SVApLFxuICAgICAgICBlYzIuUG9ydC50Y3AoNTQzMiksXG4gICAgICAgICdBbGxvdyBQb3N0Z3JlU1FMIGFjY2VzcyBmcm9tIGRldmVsb3BlciBJUCAoZGV2IG9ubHkpJ1xuICAgICAgKTtcbiAgICB9XG5cbiAgICAvLyBFbnZpcm9ubWVudC1hd2FyZSBSRFMgY29uZmlndXJhdGlvblxuICAgIGNvbnN0IGRhdGFiYXNlID0gbmV3IHJkcy5EYXRhYmFzZUluc3RhbmNlKHRoaXMsICdQcmVyZXFEYXRhYmFzZScsIHtcbiAgICAgIGVuZ2luZTogcmRzLkRhdGFiYXNlSW5zdGFuY2VFbmdpbmUucG9zdGdyZXMoe1xuICAgICAgICB2ZXJzaW9uOiByZHMuUG9zdGdyZXNFbmdpbmVWZXJzaW9uLlZFUl8xN181LFxuICAgICAgfSksXG4gICAgICBpbnN0YW5jZVR5cGU6IGVjMi5JbnN0YW5jZVR5cGUub2YoZWMyLkluc3RhbmNlQ2xhc3MuVDMsIGVjMi5JbnN0YW5jZVNpemUuTUlDUk8pLFxuICAgICAgdnBjLFxuICAgICAgdnBjU3VibmV0czoge1xuICAgICAgICAvLyBEZXY6IHB1YmxpYyBzdWJuZXRzIGZvciBkaXJlY3QgYWNjZXNzLCBTdGFnZS9Qcm9kOiBwcml2YXRlIGlzb2xhdGVkXG4gICAgICAgIHN1Ym5ldFR5cGU6IGVudiA9PT0gJ2RldicgPyBlYzIuU3VibmV0VHlwZS5QVUJMSUMgOiBlYzIuU3VibmV0VHlwZS5QUklWQVRFX0lTT0xBVEVELFxuICAgICAgfSxcbiAgICAgIHNlY3VyaXR5R3JvdXBzOiBbZGJTZWN1cml0eUdyb3VwXSxcbiAgICAgIGRhdGFiYXNlTmFtZTogJ3ByZXJlcScsXG4gICAgICBjcmVkZW50aWFsczogcmRzLkNyZWRlbnRpYWxzLmZyb21HZW5lcmF0ZWRTZWNyZXQoJ3ByZXJlcV9hZG1pbicpLFxuICAgICAgLy8gRGV2OiBwdWJsaWNseSBhY2Nlc3NpYmxlIGZvciBsb2NhbCB0b29scywgU3RhZ2UvUHJvZDogcHJpdmF0ZVxuICAgICAgcHVibGljbHlBY2Nlc3NpYmxlOiBlbnYgPT09ICdkZXYnLFxuICAgICAgYmFja3VwUmV0ZW50aW9uOiBjZGsuRHVyYXRpb24uZGF5cyg3KSxcbiAgICAgIC8vIFByb2Q6IGVuYWJsZSBkZWxldGlvbiBwcm90ZWN0aW9uLCBEZXYvU3RhZ2U6IGFsbG93IGVhc3kgY2xlYW51cFxuICAgICAgZGVsZXRpb25Qcm90ZWN0aW9uOiBpc1Byb2QsXG4gICAgICByZW1vdmFsUG9saWN5OiBpc1Byb2QgPyBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4gOiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgIH0pO1xuXG4gICAgLy8gQWRkIGF1dG9tYXRpYyBzZWNyZXQgcm90YXRpb24gZm9yIGRhdGFiYXNlXG4gICAgZGF0YWJhc2UuYWRkUm90YXRpb25TaW5nbGVVc2VyKCk7XG5cbiAgICAvLyBSRFMgUHJveHkgY29uZmlndXJhdGlvbiBiYXNlZCBvbiBlbnZpcm9ubWVudFxuICAgIGxldCBkYlByb3h5OiByZHMuRGF0YWJhc2VQcm94eSB8IHVuZGVmaW5lZDtcbiAgICBsZXQgZGJFbmRwb2ludDogc3RyaW5nO1xuICAgIFxuICAgIGlmIChlbnYgIT09ICdkZXYnKSB7XG4gICAgICAvLyBTdGFnZS9Qcm9kOiBDcmVhdGUgUkRTIFByb3h5XG4gICAgICBkYlByb3h5ID0gbmV3IHJkcy5EYXRhYmFzZVByb3h5KHRoaXMsICdQcmVyZXFEYXRhYmFzZVByb3h5Jywge1xuICAgICAgICBwcm94eVRhcmdldDogcmRzLlByb3h5VGFyZ2V0LmZyb21JbnN0YW5jZShkYXRhYmFzZSksXG4gICAgICAgIHNlY3JldHM6IFtkYXRhYmFzZS5zZWNyZXQhXSxcbiAgICAgICAgdnBjLFxuICAgICAgICB2cGNTdWJuZXRzOiB7XG4gICAgICAgICAgc3VibmV0VHlwZTogZWMyLlN1Ym5ldFR5cGUuUFJJVkFURV9JU09MQVRFRCxcbiAgICAgICAgfSxcbiAgICAgICAgc2VjdXJpdHlHcm91cHM6IFtkYlNlY3VyaXR5R3JvdXBdLFxuICAgICAgICByZXF1aXJlVExTOiB0cnVlLFxuICAgICAgfSk7XG5cbiAgICAgIC8vIFN0YWdlOiBNYWtlIHByb3h5IHB1YmxpY2x5IGFjY2Vzc2libGUsIFByb2Q6IGtlZXAgcHJpdmF0ZVxuICAgICAgaWYgKGlzU3RhZ2UpIHtcbiAgICAgICAgLy8gQ3JlYXRlIHNlcGFyYXRlIHByb3h5IHNlY3VyaXR5IGdyb3VwIGZvciBzdGFnZSBwdWJsaWMgYWNjZXNzXG4gICAgICAgIGNvbnN0IHByb3h5UHVibGljU2cgPSBuZXcgZWMyLlNlY3VyaXR5R3JvdXAodGhpcywgJ1ByZXJlcVByb3h5UHVibGljU0cnLCB7XG4gICAgICAgICAgdnBjLFxuICAgICAgICAgIGRlc2NyaXB0aW9uOiAnUHVibGljIGFjY2VzcyBzZWN1cml0eSBncm91cCBmb3IgUkRTIFByb3h5IChzdGFnZSBvbmx5KScsXG4gICAgICAgICAgYWxsb3dBbGxPdXRib3VuZDogdHJ1ZSxcbiAgICAgICAgfSk7XG4gICAgICAgIFxuICAgICAgICAvLyBBbGxvdyBhY2Nlc3MgZnJvbSBhbnl3aGVyZSB0byBwcm94eSBpbiBzdGFnZSAoZm9yIGZvdW5kZXJzL2RlbW8gY2xpZW50cylcbiAgICAgICAgcHJveHlQdWJsaWNTZy5hZGRJbmdyZXNzUnVsZShcbiAgICAgICAgICBlYzIuUGVlci5hbnlJcHY0KCksXG4gICAgICAgICAgZWMyLlBvcnQudGNwKDU0MzIpLFxuICAgICAgICAgICdBbGxvdyBwdWJsaWMgYWNjZXNzIHRvIFJEUyBQcm94eSAoc3RhZ2Ugb25seSknXG4gICAgICAgICk7XG5cbiAgICAgICAgLy8gTm90ZTogSW4gcmVhbCBpbXBsZW1lbnRhdGlvbiwgeW91J2QgbmVlZCB0byBjcmVhdGUgYSBzZXBhcmF0ZSBwcm94eSBvciBjb25maWd1cmUgQUxCXG4gICAgICAgIC8vIFRoaXMgaXMgYSBzaW1wbGlmaWVkIGFwcHJvYWNoIC0gaW4gcHJhY3RpY2UsIHlvdSBtaWdodCB1c2UgYW4gQXBwbGljYXRpb24gTG9hZCBCYWxhbmNlclxuICAgICAgfVxuICAgICAgXG4gICAgICBkYkVuZHBvaW50ID0gZGJQcm94eS5lbmRwb2ludDtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gRGV2OiBEaXJlY3QgZGF0YWJhc2UgY29ubmVjdGlvblxuICAgICAgZGJFbmRwb2ludCA9IGRhdGFiYXNlLmluc3RhbmNlRW5kcG9pbnQuaG9zdG5hbWU7XG4gICAgfVxuXG4gICAgLy8gT3B0aW9uYWw6IFNTTSBCYXN0aW9uIGZvciBwcm9kIGRlYnVnZ2luZyAodDMubmFubylcbiAgICBsZXQgYmFzdGlvbkluc3RhbmNlOiBlYzIuSW5zdGFuY2UgfCB1bmRlZmluZWQ7XG4gICAgaWYgKGlzUHJvZCkge1xuICAgICAgLy8gQmFzdGlvbiBzZWN1cml0eSBncm91cFxuICAgICAgY29uc3QgYmFzdGlvblNnID0gbmV3IGVjMi5TZWN1cml0eUdyb3VwKHRoaXMsICdQcmVyZXFCYXN0aW9uU0cnLCB7XG4gICAgICAgIHZwYyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdTZWN1cml0eSBncm91cCBmb3IgUFJFUkVRIFNTTSBiYXN0aW9uJyxcbiAgICAgICAgYWxsb3dBbGxPdXRib3VuZDogdHJ1ZSxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBCYXN0aW9uIGluc3RhbmNlIGZvciBwb3J0IGZvcndhcmRpbmcgaW4gcHJvZFxuICAgICAgYmFzdGlvbkluc3RhbmNlID0gbmV3IGVjMi5JbnN0YW5jZSh0aGlzLCAnUHJlcmVxQmFzdGlvbicsIHtcbiAgICAgICAgaW5zdGFuY2VUeXBlOiBlYzIuSW5zdGFuY2VUeXBlLm9mKGVjMi5JbnN0YW5jZUNsYXNzLlQzLCBlYzIuSW5zdGFuY2VTaXplLk5BTk8pLFxuICAgICAgICBtYWNoaW5lSW1hZ2U6IGVjMi5NYWNoaW5lSW1hZ2UubGF0ZXN0QW1hem9uTGludXgyMDIzKCksXG4gICAgICAgIHZwYyxcbiAgICAgICAgdnBjU3VibmV0czoge1xuICAgICAgICAgIHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBSSVZBVEVfSVNPTEFURUQsXG4gICAgICAgIH0sXG4gICAgICAgIHNlY3VyaXR5R3JvdXA6IGJhc3Rpb25TZyxcbiAgICAgICAgcm9sZTogbmV3IGlhbS5Sb2xlKHRoaXMsICdQcmVyZXFCYXN0aW9uUm9sZScsIHtcbiAgICAgICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnZWMyLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgICAgICBtYW5hZ2VkUG9saWNpZXM6IFtcbiAgICAgICAgICAgIGlhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZSgnQW1hem9uU1NNTWFuYWdlZEluc3RhbmNlQ29yZScpLFxuICAgICAgICAgIF0sXG4gICAgICAgIH0pLFxuICAgICAgICB1c2VyRGF0YTogZWMyLlVzZXJEYXRhLmZvckxpbnV4KCksXG4gICAgICB9KTtcblxuICAgICAgLy8gQWxsb3cgYmFzdGlvbiB0byBhY2Nlc3MgZGF0YWJhc2VcbiAgICAgIGRiU2VjdXJpdHlHcm91cC5hZGRJbmdyZXNzUnVsZShcbiAgICAgICAgYmFzdGlvblNnLFxuICAgICAgICBlYzIuUG9ydC50Y3AoNTQzMiksXG4gICAgICAgICdBbGxvdyBQb3N0Z3JlU1FMIGFjY2VzcyBmcm9tIGJhc3Rpb24gKHByb2Qgb25seSknXG4gICAgICApO1xuICAgIH1cblxuICAgIC8vIEpXVCBTZWNyZXQgaW4gU2VjcmV0cyBNYW5hZ2VyXG4gICAgY29uc3Qgand0U2VjcmV0ID0gbmV3IHNlY3JldHNtYW5hZ2VyLlNlY3JldCh0aGlzLCAnSnd0U2VjcmV0Jywge1xuICAgICAgZGVzY3JpcHRpb246ICdKV1Qgc2lnbmluZyBzZWNyZXQgZm9yIFBSRVJFUSBBUEknLFxuICAgICAgZ2VuZXJhdGVTZWNyZXRTdHJpbmc6IHtcbiAgICAgICAgZXhjbHVkZVB1bmN0dWF0aW9uOiB0cnVlLFxuICAgICAgICBwYXNzd29yZExlbmd0aDogMzIsXG4gICAgICB9LFxuICAgICAgcmVtb3ZhbFBvbGljeTogaXNQcm9kID8gY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOIDogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICB9KTtcblxuICAgIC8vIENvZ25pdG8gVXNlciBQb29sXG4gICAgY29uc3QgdXNlclBvb2wgPSBuZXcgY29nbml0by5Vc2VyUG9vbCh0aGlzLCAnUHJlcmVxVXNlclBvb2wnLCB7XG4gICAgICB1c2VyUG9vbE5hbWU6ICdwcmVyZXEtdXNlcnMnLFxuICAgICAgc2VsZlNpZ25VcEVuYWJsZWQ6IHRydWUsXG4gICAgICBzaWduSW5BbGlhc2VzOiB7XG4gICAgICAgIGVtYWlsOiB0cnVlLFxuICAgICAgfSxcbiAgICAgIHN0YW5kYXJkQXR0cmlidXRlczoge1xuICAgICAgICBlbWFpbDoge1xuICAgICAgICAgIHJlcXVpcmVkOiB0cnVlLFxuICAgICAgICAgIG11dGFibGU6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICAgIGZ1bGxuYW1lOiB7XG4gICAgICAgICAgcmVxdWlyZWQ6IGZhbHNlLFxuICAgICAgICAgIG11dGFibGU6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgcGFzc3dvcmRQb2xpY3k6IHtcbiAgICAgICAgbWluTGVuZ3RoOiA4LFxuICAgICAgICByZXF1aXJlTG93ZXJjYXNlOiB0cnVlLFxuICAgICAgICByZXF1aXJlVXBwZXJjYXNlOiB0cnVlLFxuICAgICAgICByZXF1aXJlRGlnaXRzOiB0cnVlLFxuICAgICAgICByZXF1aXJlU3ltYm9sczogdHJ1ZSxcbiAgICAgIH0sXG4gICAgICBhY2NvdW50UmVjb3Zlcnk6IGNvZ25pdG8uQWNjb3VudFJlY292ZXJ5LkVNQUlMX09OTFksXG4gICAgfSk7XG5cbiAgICAvLyBDb2duaXRvIFVzZXIgUG9vbCBDbGllbnRcbiAgICBjb25zdCB1c2VyUG9vbENsaWVudCA9IG5ldyBjb2duaXRvLlVzZXJQb29sQ2xpZW50KHRoaXMsICdQcmVyZXFVc2VyUG9vbENsaWVudCcsIHtcbiAgICAgIHVzZXJQb29sLFxuICAgICAgdXNlclBvb2xDbGllbnROYW1lOiAncHJlcmVxLWNsaWVudCcsXG4gICAgICBnZW5lcmF0ZVNlY3JldDogZmFsc2UsXG4gICAgICBhdXRoRmxvd3M6IHtcbiAgICAgICAgYWRtaW5Vc2VyUGFzc3dvcmQ6IHRydWUsXG4gICAgICAgIHVzZXJQYXNzd29yZDogdHJ1ZSxcbiAgICAgICAgdXNlclNycDogdHJ1ZSxcbiAgICAgIH0sXG4gICAgICBvQXV0aDoge1xuICAgICAgICBmbG93czoge1xuICAgICAgICAgIGF1dGhvcml6YXRpb25Db2RlR3JhbnQ6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICAgIHNjb3BlczogW2NvZ25pdG8uT0F1dGhTY29wZS5FTUFJTCwgY29nbml0by5PQXV0aFNjb3BlLk9QRU5JRCwgY29nbml0by5PQXV0aFNjb3BlLlBST0ZJTEVdLFxuICAgICAgICBjYWxsYmFja1VybHM6IFsnaHR0cDovL2xvY2FsaG9zdDo1MTczL2NhbGxiYWNrJywgJ2h0dHBzOi8veW91ci1kb21haW4uY29tL2NhbGxiYWNrJ10sXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gRW52aXJvbm1lbnQtc3BlY2lmaWMgdGhyb3R0bGluZyByYXRlc1xuICAgIGNvbnN0IHRocm90dGxlQ29uZmlnID0ge1xuICAgICAgZGV2OiB7IHJhdGU6IHVuZGVmaW5lZCwgYnVyc3Q6IHVuZGVmaW5lZCB9LCAvLyBVbmxpbWl0ZWRcbiAgICAgIHN0YWdlOiB7IHJhdGU6IDIwLCBidXJzdDogMTAgfSxcbiAgICAgIHByb2Q6IHsgcmF0ZTogNTAsIGJ1cnN0OiAyMCB9XG4gICAgfTtcblxuICAgIGNvbnN0IGN1cnJlbnRUaHJvdHRsZSA9IHRocm90dGxlQ29uZmlnW2VudiBhcyBrZXlvZiB0eXBlb2YgdGhyb3R0bGVDb25maWddO1xuXG4gICAgLy8gTGFtYmRhIEZ1bmN0aW9uIHVzaW5nIE5vZGVqc0Z1bmN0aW9uIHdpdGggdHJlZS1zaGFraW5nXG4gICAgY29uc3QgYXBpTGFtYmRhID0gbmV3IE5vZGVqc0Z1bmN0aW9uKHRoaXMsICdQcmVyZXFBUElMYW1iZGEnLCB7XG4gICAgICBlbnRyeTogJy4uL2JhY2tlbmQvc3JjL21haW4udHMnLFxuICAgICAgaGFuZGxlcjogJ2hhbmRsZXInLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXG4gICAgICBidW5kbGluZzoge1xuICAgICAgICBleHRlcm5hbE1vZHVsZXM6IFsnQG5lc3Rqcy9jb3JlJywgJ0BuZXN0anMvY29tbW9uJywgJ3BnJ10sXG4gICAgICAgIG1pbmlmeTogdHJ1ZSxcbiAgICAgICAgc291cmNlTWFwOiB0cnVlLFxuICAgICAgfSxcbiAgICAgIHZwYyxcbiAgICAgIHNlY3VyaXR5R3JvdXBzOiBbbGFtYmRhU2ddLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgREJfU0VDUkVUX0FSTjogZGF0YWJhc2Uuc2VjcmV0IS5zZWNyZXRBcm4sXG4gICAgICAgIERCX0hPU1Q6IGRiRW5kcG9pbnQsXG4gICAgICAgIC4uLihkYlByb3h5ICYmIHsgREJfUFJPWFlfRU5EUE9JTlQ6IGRiUHJveHkuZW5kcG9pbnQgfSksXG4gICAgICAgIEpXVF9TRUNSRVRfQVJOOiBqd3RTZWNyZXQuc2VjcmV0QXJuLFxuICAgICAgICBDT0dOSVRPX1VTRVJfUE9PTF9JRDogdXNlclBvb2wudXNlclBvb2xJZCxcbiAgICAgICAgQ09HTklUT19DTElFTlRfSUQ6IHVzZXJQb29sQ2xpZW50LnVzZXJQb29sQ2xpZW50SWQsXG4gICAgICAgIE5PREVfRU5WOiBlbnYsXG4gICAgICB9LFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgbWVtb3J5U2l6ZTogNTEyLFxuICAgIH0pO1xuXG4gICAgLy8gTGFtYmRhIGxvZyBncm91cCB3aXRoIHN5bW1ldHJpYyByZXRlbnRpb25cbiAgICBuZXcgbG9ncy5Mb2dHcm91cCh0aGlzLCAnUHJlcmVxQVBJTGFtYmRhTG9ncycsIHtcbiAgICAgIGxvZ0dyb3VwTmFtZTogYC9hd3MvbGFtYmRhLyR7YXBpTGFtYmRhLmZ1bmN0aW9uTmFtZX1gLFxuICAgICAgcmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX01PTlRILFxuICAgIH0pO1xuXG4gICAgLy8gR3JhbnQgTGFtYmRhIGFjY2VzcyB0byBkYXRhYmFzZS9wcm94eSBhbmQgc2VjcmV0c1xuICAgIGlmIChkYlByb3h5KSB7XG4gICAgICBkYlByb3h5LmdyYW50Q29ubmVjdChhcGlMYW1iZGEsICdwcmVyZXFfYWRtaW4nKTtcbiAgICB9IGVsc2Uge1xuICAgICAgZGF0YWJhc2UuZ3JhbnRDb25uZWN0KGFwaUxhbWJkYSk7XG4gICAgfVxuICAgIGRhdGFiYXNlLnNlY3JldD8uZ3JhbnRSZWFkKGFwaUxhbWJkYSk7XG4gICAgand0U2VjcmV0LmdyYW50UmVhZChhcGlMYW1iZGEpO1xuXG4gICAgLy8gQWNjZXNzLWxvZyBncm91cFxuICAgIGNvbnN0IGFwaUxvZ3MgPSBuZXcgbG9ncy5Mb2dHcm91cCh0aGlzLCAnUHJlcmVxQXBpTG9ncycsIHtcbiAgICAgIHJldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9NT05USCxcbiAgICB9KTtcblxuICAgIC8vIEFQSSBHYXRld2F5IHdpdGggZW52aXJvbm1lbnQtc3BlY2lmaWMgdGhyb3R0bGluZ1xuICAgIGNvbnN0IGRlcGxveU9wdGlvbnM6IGFueSA9IHtcbiAgICAgIHN0YWdlTmFtZTogZW52LFxuICAgICAgbWV0cmljc0VuYWJsZWQ6IHRydWUsXG4gICAgICBsb2dnaW5nTGV2ZWw6IGFwaWdhdGV3YXkuTWV0aG9kTG9nZ2luZ0xldmVsLklORk8sXG4gICAgICBhY2Nlc3NMb2dEZXN0aW5hdGlvbjogbmV3IGFwaWdhdGV3YXkuTG9nR3JvdXBMb2dEZXN0aW5hdGlvbihhcGlMb2dzKSxcbiAgICAgIGFjY2Vzc0xvZ0Zvcm1hdDogYXBpZ2F0ZXdheS5BY2Nlc3NMb2dGb3JtYXQuanNvbldpdGhTdGFuZGFyZEZpZWxkcyh7XG4gICAgICAgIGNhbGxlcjogdHJ1ZSxcbiAgICAgICAgaHR0cE1ldGhvZDogdHJ1ZSxcbiAgICAgICAgaXA6IHRydWUsXG4gICAgICAgIHByb3RvY29sOiB0cnVlLFxuICAgICAgICByZXF1ZXN0VGltZTogdHJ1ZSxcbiAgICAgICAgcmVzb3VyY2VQYXRoOiB0cnVlLFxuICAgICAgICByZXNwb25zZUxlbmd0aDogdHJ1ZSxcbiAgICAgICAgc3RhdHVzOiB0cnVlLFxuICAgICAgICB1c2VyOiB0cnVlLFxuICAgICAgfSksXG4gICAgfTtcblxuICAgIC8vIEFkZCB0aHJvdHRsaW5nIG9ubHkgZm9yIHN0YWdlL3Byb2RcbiAgICBpZiAoY3VycmVudFRocm90dGxlLnJhdGUgJiYgY3VycmVudFRocm90dGxlLmJ1cnN0KSB7XG4gICAgICBkZXBsb3lPcHRpb25zLnRocm90dGxpbmdSYXRlTGltaXQgPSBjdXJyZW50VGhyb3R0bGUucmF0ZTtcbiAgICAgIGRlcGxveU9wdGlvbnMudGhyb3R0bGluZ0J1cnN0TGltaXQgPSBjdXJyZW50VGhyb3R0bGUuYnVyc3Q7XG4gICAgfVxuXG4gICAgY29uc3QgYXBpID0gbmV3IGFwaWdhdGV3YXkuUmVzdEFwaSh0aGlzLCAnUHJlcmVxQVBJJywge1xuICAgICAgcmVzdEFwaU5hbWU6ICdQUkVSRVEgQVBJJyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnUFJFUkVRIFByb2plY3QgTWFuYWdlbWVudCBBUEknLFxuICAgICAgZGVmYXVsdENvcnNQcmVmbGlnaHRPcHRpb25zOiB7XG4gICAgICAgIGFsbG93T3JpZ2luczogYXBpZ2F0ZXdheS5Db3JzLkFMTF9PUklHSU5TLFxuICAgICAgICBhbGxvd01ldGhvZHM6IGFwaWdhdGV3YXkuQ29ycy5BTExfTUVUSE9EUyxcbiAgICAgICAgYWxsb3dIZWFkZXJzOiBbJ0NvbnRlbnQtVHlwZScsICdBdXRob3JpemF0aW9uJ10sXG4gICAgICB9LFxuICAgICAgZGVwbG95T3B0aW9ucyxcbiAgICB9KTtcblxuICAgIC8vIEFQSSBHYXRld2F5IEludGVncmF0aW9uXG4gICAgY29uc3QgaW50ZWdyYXRpb24gPSBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihhcGlMYW1iZGEpO1xuXG4gICAgLy8gQVBJIFJvdXRlc1xuICAgIGFwaS5yb290LmFkZFByb3h5KHtcbiAgICAgIGRlZmF1bHRJbnRlZ3JhdGlvbjogaW50ZWdyYXRpb24sXG4gICAgICBhbnlNZXRob2Q6IHRydWUsXG4gICAgfSk7XG5cbiAgICAvLyBXQUYgZm9yIHN0YWdlL3Byb2Qgb25seSAoZGV2IGhhcyBubyBXQUYpXG4gICAgaWYgKGVudiAhPT0gJ2RldicpIHtcbiAgICAgIGNvbnN0IHdlYkFjbCA9IG5ldyB3YWZ2Mi5DZm5XZWJBQ0wodGhpcywgJ0FwaVdhZicsIHtcbiAgICAgICAgZGVmYXVsdEFjdGlvbjogeyBhbGxvdzoge30gfSxcbiAgICAgICAgc2NvcGU6ICdSRUdJT05BTCcsXG4gICAgICAgIHZpc2liaWxpdHlDb25maWc6IHtcbiAgICAgICAgICBjbG91ZFdhdGNoTWV0cmljc0VuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgbWV0cmljTmFtZTogJ1ByZXJlcUFwaVdhZicsXG4gICAgICAgICAgc2FtcGxlZFJlcXVlc3RzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgICAgbmFtZTogJ1ByZXJlcUFwaVdhZicsXG4gICAgICAgIHJ1bGVzOiBbXG4gICAgICAgICAge1xuICAgICAgICAgICAgbmFtZTogJ0FXUy1BV1NNYW5hZ2VkQ29tbW9uUnVsZVNldCcsXG4gICAgICAgICAgICBwcmlvcml0eTogMCxcbiAgICAgICAgICAgIHN0YXRlbWVudDogeyBtYW5hZ2VkUnVsZUdyb3VwU3RhdGVtZW50OiB7XG4gICAgICAgICAgICAgIG5hbWU6ICdBV1NNYW5hZ2VkUnVsZXNDb21tb25SdWxlU2V0JyxcbiAgICAgICAgICAgICAgdmVuZG9yTmFtZTogJ0FXUycsXG4gICAgICAgICAgICB9fSxcbiAgICAgICAgICAgIG92ZXJyaWRlQWN0aW9uOiB7IG5vbmU6IHt9IH0sXG4gICAgICAgICAgICB2aXNpYmlsaXR5Q29uZmlnOiB7XG4gICAgICAgICAgICAgIGNsb3VkV2F0Y2hNZXRyaWNzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICAgICAgbWV0cmljTmFtZTogJ0NvbW1vblJ1bGVzJyxcbiAgICAgICAgICAgICAgc2FtcGxlZFJlcXVlc3RzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBuYW1lOiAnSXBSYXRlTGltaXQnLFxuICAgICAgICAgICAgcHJpb3JpdHk6IDEsXG4gICAgICAgICAgICBzdGF0ZW1lbnQ6IHtcbiAgICAgICAgICAgICAgcmF0ZUJhc2VkU3RhdGVtZW50OiB7XG4gICAgICAgICAgICAgICAgbGltaXQ6IDIwMDAsICAgICAgICAgLy8gMjAwMCByZXF1ZXN0cyBpbiA1IG1pbiBwZXIgSVBcbiAgICAgICAgICAgICAgICBhZ2dyZWdhdGVLZXlUeXBlOiAnSVAnLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGFjdGlvbjogeyBibG9jazoge30gfSxcbiAgICAgICAgICAgIHZpc2liaWxpdHlDb25maWc6IHtcbiAgICAgICAgICAgICAgY2xvdWRXYXRjaE1ldHJpY3NFbmFibGVkOiB0cnVlLFxuICAgICAgICAgICAgICBtZXRyaWNOYW1lOiAnSXBSYXRlTGltaXQnLFxuICAgICAgICAgICAgICBzYW1wbGVkUmVxdWVzdHNFbmFibGVkOiB0cnVlLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICBdLFxuICAgICAgfSk7XG5cbiAgICAgIC8vIEFzc29jaWF0ZSBXQUYgd2l0aCBBUEkgR2F0ZXdheVxuICAgICAgbmV3IHdhZnYyLkNmbldlYkFDTEFzc29jaWF0aW9uKHRoaXMsICdBcGlXYWZBc3NvYycsIHtcbiAgICAgICAgd2ViQWNsQXJuOiB3ZWJBY2wuYXR0ckFybixcbiAgICAgICAgcmVzb3VyY2VBcm46IGFwaS5kZXBsb3ltZW50U3RhZ2Uuc3RhZ2VBcm4sXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBQcml2YXRlIFMzIEJ1Y2tldCBmb3IgRnJvbnRlbmRcbiAgICBjb25zdCBmcm9udGVuZEJ1Y2tldCA9IG5ldyBzMy5CdWNrZXQodGhpcywgJ1ByZXJlcUZyb250ZW5kQnVja2V0Jywge1xuICAgICAgYnVja2V0TmFtZTogYHByZXJlcS1mcm9udGVuZC0ke2Vudn0tJHt0aGlzLmFjY291bnR9LSR7dGhpcy5yZWdpb259YCxcbiAgICAgIHB1YmxpY1JlYWRBY2Nlc3M6IGZhbHNlLFxuICAgICAgYmxvY2tQdWJsaWNBY2Nlc3M6IHMzLkJsb2NrUHVibGljQWNjZXNzLkJMT0NLX0FMTCxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGlzUHJvZCA/IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTiA6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICBhdXRvRGVsZXRlT2JqZWN0czogIWlzUHJvZCxcbiAgICB9KTtcblxuICAgIC8vIENsb3VkRnJvbnQgT3JpZ2luIEFjY2VzcyBJZGVudGl0eVxuICAgIGNvbnN0IG9yaWdpbkFjY2Vzc0lkZW50aXR5ID0gbmV3IGNsb3VkZnJvbnQuT3JpZ2luQWNjZXNzSWRlbnRpdHkodGhpcywgJ1ByZXJlcU9BSScsIHtcbiAgICAgIGNvbW1lbnQ6ICdPQUkgZm9yIFBSRVJFUSBmcm9udGVuZCBidWNrZXQnLFxuICAgIH0pO1xuXG4gICAgLy8gR3JhbnQgQ2xvdWRGcm9udCByZWFkIGFjY2VzcyB0byB0aGUgYnVja2V0XG4gICAgZnJvbnRlbmRCdWNrZXQuZ3JhbnRSZWFkKG9yaWdpbkFjY2Vzc0lkZW50aXR5KTtcblxuICAgIC8vIENsb3VkRnJvbnQgRGlzdHJpYnV0aW9uIHdpdGggU1BBLW9wdGltaXplZCBjYWNoaW5nXG4gICAgY29uc3QgZGlzdHJpYnV0aW9uID0gbmV3IGNsb3VkZnJvbnQuRGlzdHJpYnV0aW9uKHRoaXMsICdQcmVyZXFEaXN0cmlidXRpb24nLCB7XG4gICAgICBkZWZhdWx0QmVoYXZpb3I6IHtcbiAgICAgICAgb3JpZ2luOiBuZXcgb3JpZ2lucy5TM09yaWdpbihmcm9udGVuZEJ1Y2tldCwge1xuICAgICAgICAgIG9yaWdpbkFjY2Vzc0lkZW50aXR5LFxuICAgICAgICB9KSxcbiAgICAgICAgdmlld2VyUHJvdG9jb2xQb2xpY3k6IGNsb3VkZnJvbnQuVmlld2VyUHJvdG9jb2xQb2xpY3kuUkVESVJFQ1RfVE9fSFRUUFMsXG4gICAgICAgIGFsbG93ZWRNZXRob2RzOiBjbG91ZGZyb250LkFsbG93ZWRNZXRob2RzLkFMTE9XX0FMTCxcbiAgICAgICAgY2FjaGVkTWV0aG9kczogY2xvdWRmcm9udC5DYWNoZWRNZXRob2RzLkNBQ0hFX0dFVF9IRUFEX09QVElPTlMsXG4gICAgICAgIGNhY2hlUG9saWN5OiBjbG91ZGZyb250LkNhY2hlUG9saWN5LkNBQ0hJTkdfRElTQUJMRUQsXG4gICAgICB9LFxuICAgICAgZGVmYXVsdFJvb3RPYmplY3Q6ICdpbmRleC5odG1sJyxcbiAgICAgIGVycm9yUmVzcG9uc2VzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBodHRwU3RhdHVzOiA0MDQsXG4gICAgICAgICAgcmVzcG9uc2VIdHRwU3RhdHVzOiAyMDAsXG4gICAgICAgICAgcmVzcG9uc2VQYWdlUGF0aDogJy9pbmRleC5odG1sJyxcbiAgICAgICAgICB0dGw6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDApLCAvLyBObyBjYWNoaW5nIGZvciBTUEEgcm91dGVzXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBodHRwU3RhdHVzOiA0MDMsXG4gICAgICAgICAgcmVzcG9uc2VIdHRwU3RhdHVzOiAyMDAsXG4gICAgICAgICAgcmVzcG9uc2VQYWdlUGF0aDogJy9pbmRleC5odG1sJyxcbiAgICAgICAgICB0dGw6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDApLCAvLyBObyBjYWNoaW5nIGZvciBTUEEgcm91dGVzXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgLy8gU3RvcmUgc2Vuc2l0aXZlIHZhbHVlcyBpbiBTU00gUGFyYW1ldGVyc1xuICAgIG5ldyBzc20uU3RyaW5nUGFyYW1ldGVyKHRoaXMsICdEYXRhYmFzZUVuZHBvaW50UGFyYW0nLCB7XG4gICAgICBwYXJhbWV0ZXJOYW1lOiBgL3ByZXJlcS8ke2Vudn0vZGF0YWJhc2UvZW5kcG9pbnRgLFxuICAgICAgc3RyaW5nVmFsdWU6IGRhdGFiYXNlLmluc3RhbmNlRW5kcG9pbnQuaG9zdG5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogYFJEUyBEYXRhYmFzZSBFbmRwb2ludCAoJHtlbnZ9KWAsXG4gICAgfSk7XG5cbiAgICBpZiAoZGJQcm94eSkge1xuICAgICAgbmV3IHNzbS5TdHJpbmdQYXJhbWV0ZXIodGhpcywgJ0RhdGFiYXNlUHJveHlFbmRwb2ludFBhcmFtJywge1xuICAgICAgICBwYXJhbWV0ZXJOYW1lOiBgL3ByZXJlcS8ke2Vudn0vZGF0YWJhc2UvcHJveHktZW5kcG9pbnRgLFxuICAgICAgICBzdHJpbmdWYWx1ZTogZGJQcm94eS5lbmRwb2ludCxcbiAgICAgICAgZGVzY3JpcHRpb246IGBSRFMgUHJveHkgRW5kcG9pbnQgKCR7ZW52fSlgLFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgbmV3IHNzbS5TdHJpbmdQYXJhbWV0ZXIodGhpcywgJ0RhdGFiYXNlU2VjcmV0QXJuUGFyYW0nLCB7XG4gICAgICBwYXJhbWV0ZXJOYW1lOiBgL3ByZXJlcS8ke2Vudn0vZGF0YWJhc2Uvc2VjcmV0LWFybmAsXG4gICAgICBzdHJpbmdWYWx1ZTogZGF0YWJhc2Uuc2VjcmV0Py5zZWNyZXRBcm4gfHwgJycsXG4gICAgICBkZXNjcmlwdGlvbjogYFJEUyBEYXRhYmFzZSBTZWNyZXQgQVJOICgke2Vudn0pYCxcbiAgICB9KTtcblxuICAgIG5ldyBzc20uU3RyaW5nUGFyYW1ldGVyKHRoaXMsICdKd3RTZWNyZXRBcm5QYXJhbScsIHtcbiAgICAgIHBhcmFtZXRlck5hbWU6IGAvcHJlcmVxLyR7ZW52fS9qd3Qvc2VjcmV0LWFybmAsXG4gICAgICBzdHJpbmdWYWx1ZTogand0U2VjcmV0LnNlY3JldEFybixcbiAgICAgIGRlc2NyaXB0aW9uOiBgSldUIFNlY3JldCBBUk4gKCR7ZW52fSlgLFxuICAgIH0pO1xuXG4gICAgLy8gRW52aXJvbm1lbnQtc3BlY2lmaWMgb3V0cHV0c1xuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdFbnZpcm9ubWVudCcsIHtcbiAgICAgIHZhbHVlOiBlbnYsXG4gICAgICBkZXNjcmlwdGlvbjogJ0RlcGxveW1lbnQgZW52aXJvbm1lbnQnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0RhdGFiYXNlQ29uZmlndXJhdGlvbicsIHtcbiAgICAgIHZhbHVlOiBlbnYgPT09ICdkZXYnIFxuICAgICAgICA/ICdQdWJsaWMgZGF0YWJhc2UgKGRpcmVjdCBhY2Nlc3MpJyBcbiAgICAgICAgOiBpc1N0YWdlIFxuICAgICAgICAgID8gJ1ByaXZhdGUgZGF0YWJhc2UgKyBwdWJsaWMgcHJveHknXG4gICAgICAgICAgOiAnUHJpdmF0ZSBkYXRhYmFzZSArIHByaXZhdGUgcHJveHknLFxuICAgICAgZGVzY3JpcHRpb246ICdEYXRhYmFzZSBhY2Nlc3MgY29uZmlndXJhdGlvbicsXG4gICAgfSk7XG5cbiAgICBpZiAoY3VycmVudFRocm90dGxlLnJhdGUgJiYgY3VycmVudFRocm90dGxlLmJ1cnN0KSB7XG4gICAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnVGhyb3R0bGluZ0NvbmZpZ3VyYXRpb24nLCB7XG4gICAgICAgIHZhbHVlOiBgJHtjdXJyZW50VGhyb3R0bGUucmF0ZX0vJHtjdXJyZW50VGhyb3R0bGUuYnVyc3R9IChyYXRlL2J1cnN0KWAsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnQVBJIEdhdGV3YXkgdGhyb3R0bGluZyBsaW1pdHMnLFxuICAgICAgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdUaHJvdHRsaW5nQ29uZmlndXJhdGlvbicsIHtcbiAgICAgICAgdmFsdWU6ICdVbmxpbWl0ZWQnLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ0FQSSBHYXRld2F5IHRocm90dGxpbmcgbGltaXRzJyxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdXQUZQcm90ZWN0aW9uJywge1xuICAgICAgdmFsdWU6IGVudiA9PT0gJ2RldicgPyAnRGlzYWJsZWQnIDogJ0VuYWJsZWQnLFxuICAgICAgZGVzY3JpcHRpb246ICdXQUYgcHJvdGVjdGlvbiBzdGF0dXMnLFxuICAgIH0pO1xuXG4gICAgaWYgKGJhc3Rpb25JbnN0YW5jZSkge1xuICAgICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0Jhc3Rpb25JbnN0YW5jZUlkJywge1xuICAgICAgICB2YWx1ZTogYmFzdGlvbkluc3RhbmNlLmluc3RhbmNlSWQsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnQmFzdGlvbiBpbnN0YW5jZSBJRCBmb3IgU1NNIHBvcnQgZm9yd2FyZGluZyAocHJvZCBvbmx5KScsXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnRGF0YWJhc2VFbmRwb2ludCcsIHtcbiAgICAgIHZhbHVlOiBkYXRhYmFzZS5pbnN0YW5jZUVuZHBvaW50Lmhvc3RuYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdEaXJlY3QgZGF0YWJhc2UgZW5kcG9pbnQnLFxuICAgIH0pO1xuXG4gICAgaWYgKGRiUHJveHkpIHtcbiAgICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdEYXRhYmFzZVByb3h5RW5kcG9pbnQnLCB7XG4gICAgICAgIHZhbHVlOiBkYlByb3h5LmVuZHBvaW50LFxuICAgICAgICBkZXNjcmlwdGlvbjogJ1JEUyBQcm94eSBlbmRwb2ludCcsXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBTdGFuZGFyZCBvdXRwdXRzXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1VzZXJQb29sSWQnLCB7XG4gICAgICB2YWx1ZTogdXNlclBvb2wudXNlclBvb2xJZCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ29nbml0byBVc2VyIFBvb2wgSUQnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1VzZXJQb29sQ2xpZW50SWQnLCB7XG4gICAgICB2YWx1ZTogdXNlclBvb2xDbGllbnQudXNlclBvb2xDbGllbnRJZCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ29nbml0byBVc2VyIFBvb2wgQ2xpZW50IElEJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdBcGlVcmwnLCB7XG4gICAgICB2YWx1ZTogYXBpLnVybCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQVBJIEdhdGV3YXkgVVJMJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdGcm9udGVuZFVybCcsIHtcbiAgICAgIHZhbHVlOiBgaHR0cHM6Ly8ke2Rpc3RyaWJ1dGlvbi5kaXN0cmlidXRpb25Eb21haW5OYW1lfWAsXG4gICAgICBkZXNjcmlwdGlvbjogJ0Nsb3VkRnJvbnQgRGlzdHJpYnV0aW9uIFVSTCcsXG4gICAgfSk7XG4gIH1cbn0gIl19