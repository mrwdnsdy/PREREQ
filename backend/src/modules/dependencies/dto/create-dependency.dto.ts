import { IsEnum, IsInt, IsNotEmpty, IsString, Min, Max, Validate, ValidationArguments, ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator';
import { DependencyType } from '@prisma/client';

/**
 * Custom validator to ensure predecessor and successor are different tasks
 */
@ValidatorConstraint({ name: 'IsNotSelfLink', async: false })
export class IsNotSelfLinkConstraint implements ValidatorConstraintInterface {
  validate(value: string, args: ValidationArguments) {
    const object = args.object as CreateDependencyDto;
    return value !== object.predecessorId;
  }

  defaultMessage(args: ValidationArguments) {
    return 'Successor task cannot be the same as predecessor task (self-link not allowed)';
  }
}

export class CreateDependencyDto {
  @IsNotEmpty()
  @IsString()
  predecessorId: string;

  @IsNotEmpty()
  @IsString()
  @Validate(IsNotSelfLinkConstraint)
  successorId: string;

  @IsEnum(DependencyType, {
    message: 'Type must be one of: FS (Finish-to-Start), SS (Start-to-Start), FF (Finish-to-Finish), SF (Start-to-Finish)'
  })
  type: DependencyType;

  @IsInt({ message: 'Lag must be an integer (can be negative for leads)' })
  @Min(-365, { message: 'Lag cannot be less than -365 days' })
  @Max(365, { message: 'Lag cannot be more than 365 days' })
  lag?: number = 0;
} 