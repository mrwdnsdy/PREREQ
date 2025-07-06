import { IsString, IsNotEmpty, IsNumber, IsPositive, MinLength, MaxLength, IsUUID } from 'class-validator';

export class CreateResourceDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @IsNumber()
  @IsPositive()
  rateFloat: number;

  @IsString()
  @IsNotEmpty()
  @IsUUID()
  typeId: string;
} 