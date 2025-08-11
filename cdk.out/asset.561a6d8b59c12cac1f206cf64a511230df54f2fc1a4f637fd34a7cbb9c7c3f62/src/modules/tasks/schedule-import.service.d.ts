import { PrismaService } from '../../prisma/prisma.service';
import { ImportScheduleDto } from './dto/import-schedule.dto';
export declare class ScheduleImportService {
    private prisma;
    constructor(prisma: PrismaService);
    importSchedule(importDto: ImportScheduleDto, userId: string): Promise<{
        success: boolean;
        importedTasks: number;
        message: string;
    }>;
    private buildWbsHierarchy;
    private generateWbsCodes;
    private createTasksFromTree;
    private createNodeAndChildren;
    private parseResourceInfo;
    private createTaskRelationships;
    private ensureProjectRoot;
    private generateUniqueActivityId;
    private clearExistingTasks;
    private updateBudgetRollups;
}
