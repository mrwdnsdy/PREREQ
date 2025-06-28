import { IsString, IsNumber, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum RelationType {
  FS = 'FS',  // Finish to Start
  SS = 'SS',  // Start to Start
  FF = 'FF',  // Finish to Finish
  SF = 'SF',  // Start to Finish
}

export class CreateRelationDto {
  @ApiProperty({ description: 'Successor task ID' })
  @IsString()
  successorId: string;

  @ApiProperty({ 
    description: 'Relationship type',
    enum: RelationType,
    example: 'FS'
  })
  @IsEnum(RelationType)
  type: RelationType;

  @ApiProperty({ 
    description: 'Lag in minutes (positive = delay, negative = lead)',
    example: 0
  })
  @IsNumber()
  lag: number;
} 