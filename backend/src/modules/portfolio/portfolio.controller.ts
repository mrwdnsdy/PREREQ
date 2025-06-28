import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PortfolioService } from './portfolio.service';

@ApiTags('Portfolio')
@Controller('portfolio')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PortfolioController {
  constructor(private readonly portfolioService: PortfolioService) {}

  @Get('wbs')
  @ApiOperation({ summary: 'Get aggregated WBS tree across all user projects' })
  @ApiResponse({ status: 200, description: 'Portfolio WBS structure' })
  getPortfolioWBS(@Request() req) {
    return this.portfolioService.getPortfolioWBS(req.user.id);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Get portfolio summary statistics' })
  @ApiResponse({ status: 200, description: 'Portfolio summary' })
  getPortfolioSummary(@Request() req) {
    return this.portfolioService.getPortfolioSummary(req.user.id);
  }
} 