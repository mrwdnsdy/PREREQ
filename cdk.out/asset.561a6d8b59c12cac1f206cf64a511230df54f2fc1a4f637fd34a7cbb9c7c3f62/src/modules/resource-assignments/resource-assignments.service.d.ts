import { PrismaService } from '../../prisma/prisma.service';
import { CreateMultiAssignmentDto } from './dto/create-multi-assignment.dto';
import { UpdateAssignmentDto } from './dto/update-assignment.dto';
export declare class ResourceAssignmentsService {
    private prisma;
    constructor(prisma: PrismaService);
    createMultipleAssignments(taskId: string, createMultiAssignmentDto: CreateMultiAssignmentDto): Promise<any>;
    findTaskAssignments(taskId: string): Promise<{
        task: any;
        assignments: any;
    }>;
    findOneAssignment(id: string): Promise<any>;
    updateAssignment(id: string, updateAssignmentDto: UpdateAssignmentDto): Promise<any>;
    deleteAssignment(id: string): Promise<any>;
    getAvailableResources(taskId: string, typeId?: string): Promise<any>;
}
