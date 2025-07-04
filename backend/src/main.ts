import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Handler, Context, APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { INestApplication } from '@nestjs/common';
import serverlessExpress from '@codegenie/serverless-express';

// Load environment variables for local development
if (!process.env.AWS_LAMBDA_FUNCTION_NAME) {
  require('dotenv').config({ path: '.env.dev' });
}

// Cache the serverless express instance across Lambda invocations
let serverlessExpressInstance: any;

// Lambda handler for AWS deployment with cold-start optimization
export const handler: Handler = async (
  event: APIGatewayProxyEvent,
  context: Context,
): Promise<APIGatewayProxyResult> => {
  // Return cached instance if available
  if (serverlessExpressInstance) {
    return serverlessExpressInstance(event, context);
  }

  // Setup environment and create new instance
  return await setupLambda(event, context);
};

// Setup function for first invocation
async function setupLambda(event: APIGatewayProxyEvent, context: Context) {
  // Set up environment variables from AWS Secrets Manager
  await setupEnvironment();

  // Create NestJS application
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe());
  app.enableCors({
    origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000'],
    credentials: true,
  });

  // Gate Swagger UI in production for Lambda
  if (process.env.NODE_ENV === 'prod') {
    app.use('/api', (req, res) => res.status(404).send());
  }

  await app.init();

  // Get the Express instance from NestJS
  const expressApp = app.getHttpAdapter().getInstance();

  // Create and cache serverless express instance
  serverlessExpressInstance = serverlessExpress({ app: expressApp });

  // Handle the current request
  return serverlessExpressInstance(event, context);
}

// Setup environment variables from AWS Secrets Manager
async function setupEnvironment() {
  const secretsClient = new SecretsManagerClient({ 
    region: process.env.AWS_REGION || 'us-east-2' 
  });

  // Set up DATABASE_URL from AWS Secrets Manager
  if (process.env.DB_SECRET_ARN && !process.env.DATABASE_URL) {
    try {
      const command = new GetSecretValueCommand({ SecretId: process.env.DB_SECRET_ARN });
      const secret = await secretsClient.send(command);
      
      if (secret.SecretString) {
        const dbCredentials = JSON.parse(secret.SecretString);
        process.env.DATABASE_URL = `postgresql://${dbCredentials.username}:${dbCredentials.password}@${dbCredentials.host}:${dbCredentials.port}/${dbCredentials.dbname}?sslmode=require`;
      }
    } catch (error) {
      console.error('Failed to get database credentials from Secrets Manager:', error);
      throw new Error('Database configuration error');
    }
  }

  // Set up JWT_SECRET from AWS Secrets Manager
  if (process.env.JWT_SECRET_ARN && !process.env.JWT_SECRET) {
    try {
      const command = new GetSecretValueCommand({ SecretId: process.env.JWT_SECRET_ARN });
      const secret = await secretsClient.send(command);
      
      if (secret.SecretString) {
        // JWT secret is stored as a plain string, not JSON
        process.env.JWT_SECRET = secret.SecretString;
      }
    } catch (error) {
      console.error('Failed to get JWT secret from Secrets Manager:', error);
      throw new Error('JWT secret configuration error');
    }
  }
}

// Local development bootstrap
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  app.useGlobalPipes(new ValidationPipe());
  app.enableCors({
    origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000'],
    credentials: true,
  });

  // Swagger API documentation
  const config = new DocumentBuilder()
    .setTitle('PREREQ API')
    .setDescription('PREREQ Project Management SaaS API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  // Gate Swagger UI in production
  if (process.env.NODE_ENV === 'prod') {
    app.use('/api', (req, res) => res.status(404).send());
  }

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}`);
}

// Run bootstrap only if not in Lambda environment
if (!process.env.AWS_LAMBDA_FUNCTION_NAME) {
  bootstrap();
} 