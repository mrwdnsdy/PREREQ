import { IsString, IsDateString, IsOptional, IsNumber, IsBoolean, Min, Max, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTaskDto {
  @ApiProperty({ description: 'Project ID' })
  @IsString()
  projectId: string;

  @ApiPropertyOptional({ description: 'Parent task ID for WBS hierarchy' })
  @IsOptional()
  @IsString()
  parentId?: string;

  @ApiPropertyOptional({ description: 'WBS code (e.g., 1.1, 1.2.1) - will be auto-generated if not provided' })
  @IsOptional()
  @IsString()
  wbsCode?: string;

  @ApiProperty({ description: 'Task title' })
  @IsString()
  title: string;

  @ApiPropertyOptional({ description: 'Task description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Task start date' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ description: 'Task end date' })
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({ description: 'Is this a milestone?' })
  @IsOptional()
  @IsBoolean()
  isMilestone?: boolean;

  @ApiPropertyOptional({ description: 'Labor cost' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  costLabor?: number;

  @ApiPropertyOptional({ description: 'Material cost' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  costMaterial?: number;

  @ApiPropertyOptional({ description: 'Other costs' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  costOther?: number;

  @ApiPropertyOptional({ description: 'Resource role' })
  @IsOptional()
  @IsString()
  resourceRole?: string;

  @ApiPropertyOptional({ description: 'Resource quantity' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  resourceQty?: number;

  @ApiPropertyOptional({ description: 'Resource unit' })
  @IsOptional()
  @IsString()
  resourceUnit?: string;

  @ApiPropertyOptional({ 
    description: 'Role-specific hours for level 4+ tasks (e.g., {"Developer": 16, "Designer": 8})',
    example: { "Developer": 16, "Designer": 8, "Project Manager": 4 }
  })
  @IsOptional()
  @IsObject()
  roleHours?: Record<string, number>;
} 