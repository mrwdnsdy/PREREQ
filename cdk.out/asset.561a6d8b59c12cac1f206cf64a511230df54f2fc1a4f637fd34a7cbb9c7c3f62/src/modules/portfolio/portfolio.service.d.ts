import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
export declare class PortfolioService {
    private prisma;
    private authService;
    constructor(prisma: PrismaService, authService: AuthService);
    getPortfolioWBS(userId: string): Promise<{
        id: string;
        title: string;
        level: number;
        wbsCode: string;
        isMilestone: boolean;
        startDate: any;
        endDate: any;
        projectId: any;
        children: any[];
        predecessors: any[];
        successors: any[];
    }>;
    getPortfolioSummary(userId: string): Promise<{
        totalProjects: any;
        totalTasks: any;
        totalMilestones: any;
        totalBudget: any;
        dateRange: {
            start: Date;
            end: Date;
        };
        projects: any;
    }>;
}
