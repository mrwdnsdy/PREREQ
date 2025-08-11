import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { TasksService } from '../tasks/tasks.service';
export declare class P6ImportService {
    private prisma;
    private authService;
    private tasksService;
    constructor(prisma: PrismaService, authService: AuthService, tasksService: TasksService);
    private generateUniqueActivityId;
    private generateBatchActivityIds;
    importXERFile(fileBuffer: Buffer, projectId: string, userId: string): Promise<{
        message: string;
        project: any;
        tasksImported: number;
        relationsImported: number;
    }>;
    importXMLFile(fileBuffer: Buffer, projectId: string, userId: string): Promise<{
        message: string;
        project: any;
        tasksImported: number;
        relationsImported: number;
    }>;
    importExcelFile(fileBuffer: Buffer, projectId: string, userId: string): Promise<{
        message: string;
        project: string;
        tasksImported: number;
        resourcesImported: number;
        assignmentsImported: number;
    }>;
    private parseXERContent;
    private parseXMLContent;
    private importProjectData;
    private importTasks;
    private importRelations;
    private mapRelationType;
    private parseExcelContent;
    private createColumnMap;
    private parseTaskRow;
    private extractProjectName;
    private extractResourceAssignments;
    private calculateProjectMetrics;
    private importResourceTypes;
    private importResources;
    private importExcelProjectData;
    private importExcelTasks;
    private generateWbsCode;
    private findParentTask;
    private calculateTaskBudget;
    private calculateTotalHours;
    private importResourceAssignments;
    private importExcelDependencies;
    private mapDependencyType;
    private createDependency;
    private clearExistingSchedule;
}
