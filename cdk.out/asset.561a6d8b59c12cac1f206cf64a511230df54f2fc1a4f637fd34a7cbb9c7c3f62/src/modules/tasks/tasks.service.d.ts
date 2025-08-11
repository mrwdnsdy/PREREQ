import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
export declare class TasksService {
    private prisma;
    private authService;
    constructor(prisma: PrismaService, authService: AuthService);
    private generateUniqueActivityId;
    private calculateLevel;
    private validateWbsHierarchy;
    private generateUniqueWbsCode;
    private validateWbsCodeUniqueness;
    private calculateDirectCost;
    private calculateLaborCostFromRoleHours;
    private updateBudgetRollups;
    ensureProjectRootTask(projectId: string): Promise<void>;
    create(createTaskDto: CreateTaskDto, userId: string): Promise<any>;
    findAll(projectId: string, userId: string): Promise<any>;
    findOne(id: string, userId: string): Promise<any>;
    update(id: string, updateTaskDto: UpdateTaskDto, userId: string): Promise<any>;
    remove(id: string, userId: string): Promise<{
        message: string;
    }>;
    getWbsTree(projectId: string, userId: string): Promise<any[]>;
    getMilestones(projectId: string, userId: string): Promise<any>;
    recalculateProjectBudgets(projectId: string, userId: string): Promise<{
        message: string;
    }>;
}
