import { IsString, IsNotEmpty, IsNumber, IsPositive, Max, IsUUID } from 'class-validator';

export class CreateAssignmentDto {
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  resourceId: string;

  @IsNumber()
  @IsPositive()
  @Max(9999)
  hours: number;
} 