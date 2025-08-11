import { PortfolioService } from './portfolio.service';
export declare class PortfolioController {
    private readonly portfolioService;
    constructor(portfolioService: PortfolioService);
    getPortfolioWBS(req: any): Promise<{
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
    getPortfolioSummary(req: any): Promise<{
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
