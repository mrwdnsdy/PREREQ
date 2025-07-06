import { IsString, IsNotEmpty, MinLength, MaxLength } from 'class-validator';

export class CreateResourceTypeDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(50)
  name: string;
} 