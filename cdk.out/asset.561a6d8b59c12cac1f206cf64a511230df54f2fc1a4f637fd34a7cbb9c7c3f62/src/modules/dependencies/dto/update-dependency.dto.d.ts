import { CreateDependencyDto } from './create-dependency.dto';
declare const UpdateDependencyDto_base: import("@nestjs/mapped-types").MappedType<Partial<Omit<CreateDependencyDto, "successorId" | "predecessorId">>>;
export declare class UpdateDependencyDto extends UpdateDependencyDto_base {
}
export {};
