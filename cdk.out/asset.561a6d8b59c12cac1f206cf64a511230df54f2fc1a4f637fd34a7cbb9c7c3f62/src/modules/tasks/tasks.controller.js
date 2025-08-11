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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TasksController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const platform_express_1 = require("@nestjs/platform-express");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const tasks_service_1 = require("./tasks.service");
const schedule_import_service_1 = require("./schedule-import.service");
const create_task_dto_1 = require("./dto/create-task.dto");
const update_task_dto_1 = require("./dto/update-task.dto");
const import_schedule_dto_1 = require("./dto/import-schedule.dto");
let TasksController = class TasksController {
    constructor(tasksService, scheduleImportService) {
        this.tasksService = tasksService;
        this.scheduleImportService = scheduleImportService;
    }
    create(createTaskDto, req) {
        console.log('TasksController.create - Received DTO:', createTaskDto);
        console.log('TasksController.create - DTO title specifically:', createTaskDto.title);
        return this.tasksService.create(createTaskDto, req.user.id);
    }
    findAll(projectId, req) {
        return this.tasksService.findAll(projectId, req.user.id);
    }
    getWbsTree(projectId, req) {
        return this.tasksService.getWbsTree(projectId, req.user.id);
    }
    getMilestones(projectId, req) {
        return this.tasksService.getMilestones(projectId, req.user.id);
    }
    recalculateBudgets(projectId, req) {
        return this.tasksService.recalculateProjectBudgets(projectId, req.user.id);
    }
    findOne(id, req) {
        return this.tasksService.findOne(id, req.user.id);
    }
    update(id, updateTaskDto, req) {
        return this.tasksService.update(id, updateTaskDto, req.user.id);
    }
    remove(id, req) {
        return this.tasksService.remove(id, req.user.id);
    }
    importSchedule(projectId, importScheduleDto, req) {
        importScheduleDto.projectId = projectId;
        return this.scheduleImportService.importSchedule(importScheduleDto, req.user.id);
    }
    async importScheduleFromCsv(projectId, file, req) {
        if (!file) {
            throw new Error('No file uploaded');
        }
        const csvData = file.buffer.toString('utf-8');
        const tasks = this.parseCsvToTasks(csvData);
        const importDto = {
            projectId,
            tasks,
            options: {
                replaceExisting: false,
                generateWbsCodes: true,
                validateDependencies: true
            }
        };
        return this.scheduleImportService.importSchedule(importDto, req.user.id);
    }
    parseCsvToTasks(csvData) {
        const lines = csvData.trim().split('\n');
        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        const tasks = [];
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
            const task = {};
            headers.forEach((header, index) => {
                const value = values[index];
                switch (header.toLowerCase()) {
                    case 'level':
                        task.level = parseInt(value) || 1;
                        break;
                    case 'activity id':
                    case 'activityid':
                        task.activityId = value;
                        break;
                    case 'activity description':
                    case 'description':
                    case 'task name':
                        task.description = value;
                        break;
                    case 'type':
                        task.type = value;
                        break;
                    case 'duration':
                        task.duration = parseFloat(value) || 0;
                        break;
                    case 'start date':
                    case 'startdate':
                        task.startDate = value;
                        break;
                    case 'finish date':
                    case 'finishdate':
                    case 'end date':
                        task.finishDate = value;
                        break;
                    case 'predecessor':
                    case 'predecessors':
                        task.predecessors = value;
                        break;
                    case 'resourcing':
                    case 'resource':
                        task.resourcing = value;
                        break;
                    case 'budget':
                    case 'cost':
                        task.budget = parseFloat(value) || 0;
                        break;
                    case 'notes':
                    case 'comments':
                        task.notes = value;
                        break;
                }
            });
            if (task.activityId && task.description) {
                tasks.push(task);
            }
        }
        return tasks;
    }
};
exports.TasksController = TasksController;
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Create a new task' }),
    (0, swagger_1.ApiResponse)({ status: 201, description: 'Task created successfully' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Invalid WBS level or parent task' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_task_dto_1.CreateTaskDto, Object]),
    __metadata("design:returntype", void 0)
], TasksController.prototype, "create", null);
__decorate([
    (0, common_1.Get)('project/:projectId'),
    (0, swagger_1.ApiOperation)({ summary: 'Get all tasks for a project' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'List of tasks' }),
    __param(0, (0, common_1.Param)('projectId')),
    __param(1, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], TasksController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('project/:projectId/wbs'),
    (0, swagger_1.ApiOperation)({ summary: 'Get WBS tree for a project' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'WBS tree structure' }),
    __param(0, (0, common_1.Param)('projectId')),
    __param(1, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], TasksController.prototype, "getWbsTree", null);
__decorate([
    (0, common_1.Get)('project/:projectId/milestones'),
    (0, swagger_1.ApiOperation)({ summary: 'Get milestones for a project' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'List of milestones' }),
    __param(0, (0, common_1.Param)('projectId')),
    __param(1, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], TasksController.prototype, "getMilestones", null);
__decorate([
    (0, common_1.Post)('project/:projectId/recalculate-budgets'),
    (0, swagger_1.ApiOperation)({ summary: 'Recalculate budget rollups for a project' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Budget rollups recalculated successfully' }),
    (0, swagger_1.ApiResponse)({ status: 403, description: 'Insufficient permissions' }),
    __param(0, (0, common_1.Param)('projectId')),
    __param(1, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], TasksController.prototype, "recalculateBudgets", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Get a specific task' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Task details' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Task not found' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], TasksController.prototype, "findOne", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Update a task' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Task updated successfully' }),
    (0, swagger_1.ApiResponse)({ status: 403, description: 'Insufficient permissions' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_task_dto_1.UpdateTaskDto, Object]),
    __metadata("design:returntype", void 0)
], TasksController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Delete a task' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Task deleted successfully' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Cannot delete task with children' }),
    (0, swagger_1.ApiResponse)({ status: 403, description: 'Insufficient permissions' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], TasksController.prototype, "remove", null);
__decorate([
    (0, common_1.Post)('project/:projectId/import-schedule'),
    (0, swagger_1.ApiOperation)({ summary: 'Import schedule from traditional format' }),
    (0, swagger_1.ApiResponse)({ status: 201, description: 'Schedule imported successfully' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Invalid schedule data' }),
    (0, swagger_1.ApiResponse)({ status: 403, description: 'Insufficient permissions' }),
    __param(0, (0, common_1.Param)('projectId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, import_schedule_dto_1.ImportScheduleDto, Object]),
    __metadata("design:returntype", void 0)
], TasksController.prototype, "importSchedule", null);
__decorate([
    (0, common_1.Post)('project/:projectId/import-schedule-csv'),
    (0, swagger_1.ApiOperation)({ summary: 'Import schedule from CSV file' }),
    (0, swagger_1.ApiConsumes)('multipart/form-data'),
    (0, swagger_1.ApiResponse)({ status: 201, description: 'Schedule imported successfully from CSV' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Invalid CSV file' }),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file')),
    __param(0, (0, common_1.Param)('projectId')),
    __param(1, (0, common_1.UploadedFile)()),
    __param(2, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "importScheduleFromCsv", null);
exports.TasksController = TasksController = __decorate([
    (0, swagger_1.ApiTags)('Tasks'),
    (0, common_1.Controller)('tasks'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __metadata("design:paramtypes", [tasks_service_1.TasksService,
        schedule_import_service_1.ScheduleImportService])
], TasksController);
//# sourceMappingURL=tasks.controller.js.map