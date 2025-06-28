import { Module } from '@nestjs/common';
import { RelationsService } from './relations.service';
import { RelationsController } from './relations.controller';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [RelationsService, PrismaService],
  controllers: [RelationsController],
  exports: [RelationsService],
})
export class RelationsModule {} 