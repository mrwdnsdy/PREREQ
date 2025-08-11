"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PortfolioService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const auth_service_1 = require("../auth/auth.service");
let PortfolioService = class PortfolioService {
    constructor(prisma, authService) {
        this.prisma = prisma;
        this.authService = authService;
    }
    async getPortfolioWBS(userId) {
        const userProjects = await this.prisma.project.findMany({
            where: {
                members: {
                    some: {
                        userId,
                    },
                },
            },
            include: {
                tasks: {
                    include: {
                        children: true,
                        predecessors: {
                            include: {
                                predecessor: true,
                            },
                        },
                        successors: {
                            include: {
                                successor: true,
                            },
                        },
                    },
                    orderBy: [
                        { level: 'asc' },
                        { wbsCode: 'asc' },
                    ],
                },
            },
        });
        const portfolioRoot = {
            id: 'portfolio-root',
            title: 'Portfolio',
            level: 0,
            wbsCode: '0',
            isMilestone: false,
            startDate: null,
            endDate: null,
            projectId: null,
            children: [],
            predecessors: [],
            successors: [],
        };
        for (const project of userProjects) {
            const projectNode = {
                id: `project-${project.id}`,
                title: project.name,
                level: 1,
                wbsCode: project.id,
                isMilestone: false,
                startDate: project.startDate,
                endDate: project.endDate,
                projectId: project.id,
                project: {
                    id: project.id,
                    name: project.name,
                    client: project.client,
                },
                children: [],
                predecessors: [],
                successors: [],
            };
            const taskMap = new Map();
            const rootTasks = [];
            project.tasks.forEach(task => {
                taskMap.set(task.id, { ...task, children: [] });
            });
            project.tasks.forEach(task => {
                if (task.parentId) {
                    const parent = taskMap.get(task.parentId);
                    if (parent) {
                        parent.children.push(taskMap.get(task.id));
                    }
                }
                else {
                    rootTasks.push(taskMap.get(task.id));
                }
            });
            projectNode.children = rootTasks;
            portfolioRoot.children.push(projectNode);
        }
        return portfolioRoot;
    }
    async getPortfolioSummary(userId) {
        const userProjects = await this.prisma.project.findMany({
            where: {
                members: {
                    some: {
                        userId,
                    },
                },
            },
            include: {
                _count: {
                    select: {
                        tasks: true,
                    },
                },
                tasks: {
                    where: {
                        isMilestone: true,
                    },
                    select: {
                        id: true,
                        title: true,
                        startDate: true,
                        endDate: true,
                    },
                },
            },
        });
        const totalProjects = userProjects.length;
        const totalTasks = userProjects.reduce((sum, project) => sum + project._count.tasks, 0);
        const totalMilestones = userProjects.reduce((sum, project) => sum + project.tasks.length, 0);
        const totalBudget = userProjects.reduce((sum, project) => {
            const projectBudget = project.budget ? Number(project.budget.toString()) : 0;
            return sum + projectBudget;
        }, 0);
        const allDates = userProjects.flatMap(project => [
            project.startDate,
            project.endDate,
        ]).filter(date => date);
        const earliestDate = allDates.length > 0 ? new Date(Math.min(...allDates.map(d => d.getTime()))) : null;
        const latestDate = allDates.length > 0 ? new Date(Math.max(...allDates.map(d => d.getTime()))) : null;
        return {
            totalProjects,
            totalTasks,
            totalMilestones,
            totalBudget,
            dateRange: {
                start: earliestDate,
                end: latestDate,
            },
            projects: userProjects.map(project => ({
                id: project.id,
                name: project.name,
                client: project.client,
                startDate: project.startDate,
                endDate: project.endDate,
                budget: project.budget ? Number(project.budget.toString()) : 0,
                taskCount: project._count.tasks,
                milestoneCount: project.tasks.length,
            })),
        };
    }
};
exports.PortfolioService = PortfolioService;
exports.PortfolioService = PortfolioService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        auth_service_1.AuthService])
], PortfolioService);
//# sourceMappingURL=portfolio.service.js.map