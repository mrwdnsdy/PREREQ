import { IsNumber, IsPositive, Max } from 'class-validator';

export class UpdateAssignmentDto {
  @IsNumber()
  @IsPositive()
  @Max(9999)
  hours: number;
} 