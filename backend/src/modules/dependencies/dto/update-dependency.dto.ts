import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateDependencyDto } from './create-dependency.dto';

/**
 * DTO for updating task dependencies
 * Excludes predecessorId and successorId since dependency endpoints shouldn't change
 * Only allows updating type and lag
 */
export class UpdateDependencyDto extends PartialType(
  OmitType(CreateDependencyDto, ['predecessorId', 'successorId'] as const)
) {} 