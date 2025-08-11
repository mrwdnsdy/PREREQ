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
exports.ResourcesController = void 0;
const common_1 = require("@nestjs/common");
const resources_service_1 = require("./resources.service");
const create_resource_type_dto_1 = require("./dto/create-resource-type.dto");
const create_resource_dto_1 = require("./dto/create-resource.dto");
const update_resource_dto_1 = require("./dto/update-resource.dto");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
let ResourcesController = class ResourcesController {
    constructor(resourcesService) {
        this.resourcesService = resourcesService;
    }
    createResourceType(createResourceTypeDto) {
        return this.resourcesService.createResourceType(createResourceTypeDto);
    }
    findAllResourceTypes() {
        return this.resourcesService.findAllResourceTypes();
    }
    findOneResourceType(id) {
        return this.resourcesService.findOneResourceType(id);
    }
    deleteResourceType(id) {
        return this.resourcesService.deleteResourceType(id);
    }
    createResource(createResourceDto) {
        return this.resourcesService.createResource(createResourceDto);
    }
    findAllResources(typeId) {
        return this.resourcesService.findAllResources(typeId);
    }
    findOneResource(id) {
        return this.resourcesService.findOneResource(id);
    }
    updateResource(id, updateResourceDto) {
        return this.resourcesService.updateResource(id, updateResourceDto);
    }
    deleteResource(id) {
        return this.resourcesService.deleteResource(id);
    }
};
exports.ResourcesController = ResourcesController;
__decorate([
    (0, common_1.Post)('types'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_resource_type_dto_1.CreateResourceTypeDto]),
    __metadata("design:returntype", void 0)
], ResourcesController.prototype, "createResourceType", null);
__decorate([
    (0, common_1.Get)('types'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ResourcesController.prototype, "findAllResourceTypes", null);
__decorate([
    (0, common_1.Get)('types/:id'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ResourcesController.prototype, "findOneResourceType", null);
__decorate([
    (0, common_1.Delete)('types/:id'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ResourcesController.prototype, "deleteResourceType", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_resource_dto_1.CreateResourceDto]),
    __metadata("design:returntype", void 0)
], ResourcesController.prototype, "createResource", null);
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Query)('typeId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ResourcesController.prototype, "findAllResources", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ResourcesController.prototype, "findOneResource", null);
__decorate([
    (0, common_1.Patch)(':id'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_resource_dto_1.UpdateResourceDto]),
    __metadata("design:returntype", void 0)
], ResourcesController.prototype, "updateResource", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ResourcesController.prototype, "deleteResource", null);
exports.ResourcesController = ResourcesController = __decorate([
    (0, common_1.Controller)('resources'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [resources_service_1.ResourcesService])
], ResourcesController);
//# sourceMappingURL=resources.controller.js.map