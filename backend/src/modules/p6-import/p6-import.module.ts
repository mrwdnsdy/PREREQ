import { Module } from '@nestjs/common';
import { P6ImportService } from './p6-import.service';
import { P6ImportController } from './p6-import.controller';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';

@Module({
  providers: [P6ImportService, PrismaService, AuthService],
  controllers: [P6ImportController],
  exports: [P6ImportService],
})
export class P6ImportModule {} 