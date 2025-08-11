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
exports.DependenciesController = void 0;
const common_1 = require("@nestjs/common");
const dependencies_service_1 = require("./dependencies.service");
const create_dependency_dto_1 = require("./dto/create-dependency.dto");
const update_dependency_dto_1 = require("./dto/update-dependency.dto");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
let DependenciesController = class DependenciesController {
    constructor(dependenciesService) {
        this.dependenciesService = dependenciesService;
    }
    async create(createDependencyDto) {
        return this.dependenciesService.create(createDependencyDto);
    }
    async findAll(projectId) {
        return this.dependenciesService.findAll(projectId);
    }
    async findByTaskId(taskId) {
        return this.dependenciesService.findByTaskId(taskId);
    }
    async findOne(id) {
        return this.dependenciesService.findOne(id);
    }
    async update(id, updateDependencyDto) {
        return this.dependenciesService.update(id, updateDependencyDto);
    }
    async remove(id) {
        await this.dependenciesService.remove(id);
    }
};
exports.DependenciesController = DependenciesController;
__decorate([
    (0, common_1.Post)(),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_dependency_dto_1.CreateDependencyDto]),
    __metadata("design:returntype", Promise)
], DependenciesController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Query)('projectId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], DependenciesController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('task/:taskId'),
    __param(0, (0, common_1.Param)('taskId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], DependenciesController.prototype, "findByTaskId", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], DependenciesController.prototype, "findOne", null);
__decorate([
    (0, common_1.Patch)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_dependency_dto_1.UpdateDependencyDto]),
    __metadata("design:returntype", Promise)
], DependenciesController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, common_1.HttpCode)(common_1.HttpStatus.NO_CONTENT),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], DependenciesController.prototype, "remove", null);
exports.DependenciesController = DependenciesController = __decorate([
    (0, common_1.Controller)('dependencies'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [dependencies_service_1.DependenciesService])
], DependenciesController);
//# sourceMappingURL=dependencies.controller.js.map