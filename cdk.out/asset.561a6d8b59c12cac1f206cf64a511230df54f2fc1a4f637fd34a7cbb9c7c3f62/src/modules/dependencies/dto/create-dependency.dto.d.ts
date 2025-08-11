import { ValidationArguments, ValidatorConstraintInterface } from 'class-validator';
export declare class IsNotSelfLinkConstraint implements ValidatorConstraintInterface {
    validate(value: string, args: ValidationArguments): boolean;
    defaultMessage(args: ValidationArguments): string;
}
export declare class CreateDependencyDto {
    predecessorId: string;
    successorId: string;
    type: 'FS' | 'SS' | 'FF' | 'SF';
    lag?: number;
}
