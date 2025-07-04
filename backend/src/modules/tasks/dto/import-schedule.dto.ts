import { IsString, IsOptional, IsNumber, IsBoolean, IsDateString, IsArray, ValidateNested } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ImportTaskRowDto {
  @ApiProperty({ description: 'WBS Level (1, 2, 3, 4, 5)' })
  @IsNumber()
  level: number;

  @ApiProperty({ description: 'Activity ID (e.g., A1010, A1020)' })
  @IsString()
  activityId: string;

  @ApiProperty({ description: 'Activity Description/Title' })
  @IsString()
  description: string;

  @ApiPropertyOptional({ description: 'Task type (Task, Milestone)' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ description: 'Duration in days' })
  @IsOptional()
  @IsNumber()
  duration?: number;

  @ApiPropertyOptional({ description: 'Start date (YYYY-MM-DD or ISO format)' })
  @IsOptional()
  @Transform(({ value }) => {
    // Handle empty strings, null, undefined
    if (!value || value === '' || value === null || value === undefined) {
      return undefined;
    }
    // If it's already a valid date string, return it
    if (typeof value === 'string' && value.trim() !== '') {
      // Try to parse the date to validate it
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return value;
      }
    }
    return undefined;
  })
  @IsDateString({}, { message: 'startDate must be a valid ISO 8601 date string' })
  startDate?: string;

  @ApiPropertyOptional({ description: 'Finish date (YYYY-MM-DD or ISO format)' })
  @IsOptional()
  @Transform(({ value }) => {
    // Handle empty strings, null, undefined
    if (!value || value === '' || value === null || value === undefined) {
      return undefined;
    }
    // If it's already a valid date string, return it
    if (typeof value === 'string' && value.trim() !== '') {
      // Try to parse the date to validate it
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return value;
      }
    }
    return undefined;
  })
  @IsDateString({}, { message: 'finishDate must be a valid ISO 8601 date string' })
  finishDate?: string;

  @ApiPropertyOptional({ description: 'Predecessor activity IDs (comma-separated)' })
  @IsOptional()
  @Transform(({ value }) => value === '' || value === null ? undefined : value)
  @IsString()
  predecessors?: string;

  @ApiPropertyOptional({ description: 'Resource assignment (role and quantity)' })
  @IsOptional()
  @Transform(({ value }) => value === '' || value === null ? undefined : value)
  @IsString()
  resourcing?: string;

  @ApiPropertyOptional({ description: 'Budget amount' })
  @IsOptional()
  @IsNumber()
  budget?: number;

  @ApiPropertyOptional({ description: 'Additional notes or comments' })
  @IsOptional()
  @Transform(({ value }) => value === '' || value === null ? undefined : value)
  @IsString()
  notes?: string;
}

export class ImportScheduleDto {
  @ApiProperty({ description: 'Project ID to import tasks into' })
  @IsString()
  projectId: string;

  @ApiProperty({ description: 'Array of task rows to import', type: [ImportTaskRowDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportTaskRowDto)
  tasks: ImportTaskRowDto[];

  @ApiPropertyOptional({ description: 'Import options' })
  @IsOptional()
  options?: {
    replaceExisting?: boolean;
    generateWbsCodes?: boolean;
    validateDependencies?: boolean;
  };
} 