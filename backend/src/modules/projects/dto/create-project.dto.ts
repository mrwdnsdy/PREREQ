import { IsString, IsDateString, IsOptional, IsNumber, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProjectDto {
  @ApiProperty({ description: 'Project name' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'Client name' })
  @IsOptional()
  @IsString()
  client?: string;

  @ApiProperty({ description: 'Project start date' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ description: 'Project end date' })
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({ description: 'Project budget' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  budget?: number;
} 