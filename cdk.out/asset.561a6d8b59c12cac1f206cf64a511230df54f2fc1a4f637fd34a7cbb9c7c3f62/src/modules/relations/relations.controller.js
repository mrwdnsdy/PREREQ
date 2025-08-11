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
exports.RelationsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const relations_service_1 = require("./relations.service");
const create_relation_dto_1 = require("./dto/create-relation.dto");
const update_relation_dto_1 = require("./dto/update-relation.dto");
let RelationsController = class RelationsController {
    constructor(relationsService) {
        this.relationsService = relationsService;
    }
    create(taskId, createRelationDto, req) {
        return this.relationsService.create(taskId, createRelationDto, req.user.id);
    }
    getTaskRelations(taskId, req) {
        return this.relationsService.getTaskRelations(taskId, req.user.id);
    }
    update(taskId, relationId, updateRelationDto, req) {
        return this.relationsService.update(taskId, relationId, updateRelationDto, req.user.id);
    }
    remove(taskId, relationId, req) {
        return this.relationsService.remove(taskId, relationId, req.user.id);
    }
};
exports.RelationsController = RelationsController;
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Create a task relationship' }),
    (0, swagger_1.ApiResponse)({ status: 201, description: 'Relationship created successfully' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Invalid relationship or circular dependency' }),
    __param(0, (0, common_1.Param)('taskId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, create_relation_dto_1.CreateRelationDto, Object]),
    __metadata("design:returntype", void 0)
], RelationsController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Get all relationships for a task' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Task relationships' }),
    __param(0, (0, common_1.Param)('taskId')),
    __param(1, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], RelationsController.prototype, "getTaskRelations", null);
__decorate([
    (0, common_1.Patch)(':relationId'),
    (0, swagger_1.ApiOperation)({ summary: 'Update a task relationship' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Relationship updated successfully' }),
    (0, swagger_1.ApiResponse)({ status: 403, description: 'Insufficient permissions' }),
    __param(0, (0, common_1.Param)('taskId')),
    __param(1, (0, common_1.Param)('relationId')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, update_relation_dto_1.UpdateRelationDto, Object]),
    __metadata("design:returntype", void 0)
], RelationsController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':relationId'),
    (0, swagger_1.ApiOperation)({ summary: 'Delete a task relationship' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Relationship deleted successfully' }),
    (0, swagger_1.ApiResponse)({ status: 403, description: 'Insufficient permissions' }),
    __param(0, (0, common_1.Param)('taskId')),
    __param(1, (0, common_1.Param)('relationId')),
    __param(2, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], RelationsController.prototype, "remove", null);
exports.RelationsController = RelationsController = __decorate([
    (0, swagger_1.ApiTags)('Task Relations'),
    (0, common_1.Controller)('tasks/:taskId/relations'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __metadata("design:paramtypes", [relations_service_1.RelationsService])
], RelationsController);
//# sourceMappingURL=relations.controller.js.map