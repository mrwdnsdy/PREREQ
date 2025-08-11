"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResourceAssignmentsModule = void 0;
const common_1 = require("@nestjs/common");
const resource_assignments_service_1 = require("./resource-assignments.service");
const resource_assignments_controller_1 = require("./resource-assignments.controller");
const prisma_service_1 = require("../../prisma/prisma.service");
let ResourceAssignmentsModule = class ResourceAssignmentsModule {
};
exports.ResourceAssignmentsModule = ResourceAssignmentsModule;
exports.ResourceAssignmentsModule = ResourceAssignmentsModule = __decorate([
    (0, common_1.Module)({
        controllers: [resource_assignments_controller_1.ResourceAssignmentsController, resource_assignments_controller_1.AssignmentsController],
        providers: [resource_assignments_service_1.ResourceAssignmentsService, prisma_service_1.PrismaService],
        exports: [resource_assignments_service_1.ResourceAssignmentsService],
    })
], ResourceAssignmentsModule);
//# sourceMappingURL=resource-assignments.module.js.map