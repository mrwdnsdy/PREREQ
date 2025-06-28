import { Module } from '@nestjs/common';
import { PortfolioController } from './portfolio.controller';
import { PortfolioService } from './portfolio.service';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  controllers: [PortfolioController],
  providers: [PortfolioService, PrismaService],
  exports: [PortfolioService],
})
export class PortfolioModule {} 