import { ResourceAssignmentsService } from './resource-assignments.service';
import { CreateMultiAssignmentDto } from './dto/create-multi-assignment.dto';
import { UpdateAssignmentDto } from './dto/update-assignment.dto';
export declare class ResourceAssignmentsController {
    private readonly resourceAssignmentsService;
    constructor(resourceAssignmentsService: ResourceAssignmentsService);
    createMultipleAssignments(taskId: string, createMultiAssignmentDto: CreateMultiAssignmentDto): Promise<any>;
    findTaskAssignments(taskId: string): Promise<{
        task: any;
        assignments: any;
    }>;
    getAvailableResources(taskId: string, typeId?: string): Promise<any>;
}
export declare class AssignmentsController {
    private readonly resourceAssignmentsService;
    constructor(resourceAssignmentsService: ResourceAssignmentsService);
    findOneAssignment(id: string): Promise<any>;
    updateAssignment(id: string, updateAssignmentDto: UpdateAssignmentDto): Promise<any>;
    deleteAssignment(id: string): Promise<any>;
}
