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
exports.AssignmentsController = exports.ResourceAssignmentsController = void 0;
const common_1 = require("@nestjs/common");
const resource_assignments_service_1 = require("./resource-assignments.service");
const create_multi_assignment_dto_1 = require("./dto/create-multi-assignment.dto");
const update_assignment_dto_1 = require("./dto/update-assignment.dto");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
let ResourceAssignmentsController = class ResourceAssignmentsController {
    constructor(resourceAssignmentsService) {
        this.resourceAssignmentsService = resourceAssignmentsService;
    }
    createMultipleAssignments(taskId, createMultiAssignmentDto) {
        return this.resourceAssignmentsService.createMultipleAssignments(taskId, createMultiAssignmentDto);
    }
    findTaskAssignments(taskId) {
        return this.resourceAssignmentsService.findTaskAssignments(taskId);
    }
    getAvailableResources(taskId, typeId) {
        return this.resourceAssignmentsService.getAvailableResources(taskId, typeId);
    }
};
exports.ResourceAssignmentsController = ResourceAssignmentsController;
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Param)('taskId', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, create_multi_assignment_dto_1.CreateMultiAssignmentDto]),
    __metadata("design:returntype", void 0)
], ResourceAssignmentsController.prototype, "createMultipleAssignments", null);
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Param)('taskId', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ResourceAssignmentsController.prototype, "findTaskAssignments", null);
__decorate([
    (0, common_1.Get)('available'),
    __param(0, (0, common_1.Param)('taskId', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Query)('typeId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], ResourceAssignmentsController.prototype, "getAvailableResources", null);
exports.ResourceAssignmentsController = ResourceAssignmentsController = __decorate([
    (0, common_1.Controller)('tasks/:taskId/resources'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [resource_assignments_service_1.ResourceAssignmentsService])
], ResourceAssignmentsController);
let AssignmentsController = class AssignmentsController {
    constructor(resourceAssignmentsService) {
        this.resourceAssignmentsService = resourceAssignmentsService;
    }
    findOneAssignment(id) {
        return this.resourceAssignmentsService.findOneAssignment(id);
    }
    updateAssignment(id, updateAssignmentDto) {
        return this.resourceAssignmentsService.updateAssignment(id, updateAssignmentDto);
    }
    deleteAssignment(id) {
        return this.resourceAssignmentsService.deleteAssignment(id);
    }
};
exports.AssignmentsController = AssignmentsController;
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AssignmentsController.prototype, "findOneAssignment", null);
__decorate([
    (0, common_1.Patch)(':id'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_assignment_dto_1.UpdateAssignmentDto]),
    __metadata("design:returntype", void 0)
], AssignmentsController.prototype, "updateAssignment", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AssignmentsController.prototype, "deleteAssignment", null);
exports.AssignmentsController = AssignmentsController = __decorate([
    (0, common_1.Controller)('assignments'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [resource_assignments_service_1.ResourceAssignmentsService])
], AssignmentsController);
//# sourceMappingURL=resource-assignments.controller.js.map