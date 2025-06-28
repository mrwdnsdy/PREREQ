import { Module } from '@nestjs/common';
import { RelationsService } from './relations.service';
import { RelationsController } from './relations.controller';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';

@Module({
  providers: [RelationsService, PrismaService, AuthService],
  controllers: [RelationsController],
  exports: [RelationsService],
})
export class RelationsModule {} 