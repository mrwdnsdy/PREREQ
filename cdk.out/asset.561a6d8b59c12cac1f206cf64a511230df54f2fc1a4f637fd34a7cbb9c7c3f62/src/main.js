"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_secrets_manager_1 = require("@aws-sdk/client-secrets-manager");
const serverless_express_1 = require("@codegenie/serverless-express");
if (!process.env.AWS_LAMBDA_FUNCTION_NAME) {
    require('dotenv').config({ path: '.env.dev' });
}
let serverlessExpressInstance;
const handler = async (event, context) => {
    if (serverlessExpressInstance) {
        return serverlessExpressInstance(event, context);
    }
    return await setupLambda(event, context);
};
exports.handler = handler;
async function setupLambda(event, context) {
    await setupEnvironment();
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    app.useGlobalPipes(new common_1.ValidationPipe());
    app.enableCors({
        origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000'],
        credentials: true,
    });
    if (process.env.NODE_ENV === 'prod') {
        app.use('/api', (req, res) => res.status(404).send());
    }
    await app.init();
    const expressApp = app.getHttpAdapter().getInstance();
    serverlessExpressInstance = (0, serverless_express_1.default)({ app: expressApp });
    return serverlessExpressInstance(event, context);
}
async function setupEnvironment() {
    const secretsClient = new client_secrets_manager_1.SecretsManagerClient({
        region: process.env.AWS_REGION || 'us-east-2'
    });
    if (process.env.DB_SECRET_ARN && !process.env.DATABASE_URL) {
        try {
            const command = new client_secrets_manager_1.GetSecretValueCommand({ SecretId: process.env.DB_SECRET_ARN });
            const secret = await secretsClient.send(command);
            if (secret.SecretString) {
                const dbCredentials = JSON.parse(secret.SecretString);
                process.env.DATABASE_URL = `postgresql://${dbCredentials.username}:${dbCredentials.password}@${dbCredentials.host}:${dbCredentials.port}/${dbCredentials.dbname}?sslmode=require`;
            }
        }
        catch (error) {
            console.error('Failed to get database credentials from Secrets Manager:', error);
            throw new Error('Database configuration error');
        }
    }
    if (process.env.JWT_SECRET_ARN && !process.env.JWT_SECRET) {
        try {
            const command = new client_secrets_manager_1.GetSecretValueCommand({ SecretId: process.env.JWT_SECRET_ARN });
            const secret = await secretsClient.send(command);
            if (secret.SecretString) {
                process.env.JWT_SECRET = secret.SecretString;
            }
        }
        catch (error) {
            console.error('Failed to get JWT secret from Secrets Manager:', error);
            throw new Error('JWT secret configuration error');
        }
    }
}
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    app.useGlobalPipes(new common_1.ValidationPipe());
    app.enableCors({
        origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000'],
        credentials: true,
    });
    const config = new swagger_1.DocumentBuilder()
        .setTitle('PREREQ API')
        .setDescription('PREREQ Project Management SaaS API')
        .setVersion('1.0')
        .addBearerAuth()
        .build();
    const document = swagger_1.SwaggerModule.createDocument(app, config);
    swagger_1.SwaggerModule.setup('api', app, document);
    if (process.env.NODE_ENV === 'prod') {
        app.use('/api', (req, res) => res.status(404).send());
    }
    const port = process.env.PORT || 3000;
    await app.listen(port);
    console.log(`Application is running on: http://localhost:${port}`);
}
if (!process.env.AWS_LAMBDA_FUNCTION_NAME) {
    bootstrap();
}
//# sourceMappingURL=main.js.map