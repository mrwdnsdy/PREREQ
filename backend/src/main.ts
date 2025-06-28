import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Handler, Context, APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

// Lambda handler for AWS deployment
export const handler: Handler = async (
  event: APIGatewayProxyEvent,
  context: Context,
): Promise<APIGatewayProxyResult> => {
  // Set up DATABASE_URL from AWS Secrets Manager
  if (process.env.DB_SECRET_ARN && !process.env.DATABASE_URL) {
    try {
      const secretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION || 'us-east-2' });
      const command = new GetSecretValueCommand({ SecretId: process.env.DB_SECRET_ARN });
      const secret = await secretsClient.send(command);
      
      if (secret.SecretString) {
        const dbCredentials = JSON.parse(secret.SecretString);
        process.env.DATABASE_URL = `postgresql://${dbCredentials.username}:${dbCredentials.password}@${dbCredentials.host}:${dbCredentials.port}/${dbCredentials.dbname}?sslmode=require`;
      }
    } catch (error) {
      console.error('Failed to get database credentials from Secrets Manager:', error);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Database configuration error' }),
      };
    }
  }

  // Create NestJS application
  const app = await NestFactory.create(AppModule);
  
  app.useGlobalPipes(new ValidationPipe());
  app.enableCors();
  
  await app.init();

  // Handle the request
  const nestHandler = app.getHttpAdapter().getInstance();
  
  return new Promise((resolve, reject) => {
    const request = {
      method: event.httpMethod,
      url: event.path,
      headers: event.headers,
      body: event.body,
    };

    nestHandler(request, {
      status: (code: number) => ({ json: (body: any) => resolve({ statusCode: code, body: JSON.stringify(body) }) }),
      json: (body: any) => resolve({ statusCode: 200, body: JSON.stringify(body) }),
      send: (body: any) => resolve({ statusCode: 200, body: typeof body === 'string' ? body : JSON.stringify(body) }),
    });
  });
};

// Local development bootstrap
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  app.useGlobalPipes(new ValidationPipe());
  app.enableCors();

  // Swagger API documentation
  const config = new DocumentBuilder()
    .setTitle('PREREQ API')
    .setDescription('PREREQ Project Management SaaS API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}`);
}

// Run bootstrap only if not in Lambda environment
if (!process.env.AWS_LAMBDA_FUNCTION_NAME) {
  bootstrap();
} 