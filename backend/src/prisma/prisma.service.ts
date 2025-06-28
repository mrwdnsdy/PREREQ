import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      log: ['query', 'info', 'warn', 'error'],
    });

    // Middleware for RBAC
    this.$use(async (params, next) => {
      // Add user context to queries if available
      if (params.model === 'Project' || params.model === 'Task') {
        // This will be enhanced with actual user context from guards
        console.log(`Executing ${params.action} on ${params.model}`);
      }
      return next(params);
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
} 