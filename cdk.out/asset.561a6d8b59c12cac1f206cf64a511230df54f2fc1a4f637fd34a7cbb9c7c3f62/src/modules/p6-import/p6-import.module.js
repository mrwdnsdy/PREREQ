"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.P6ImportModule = void 0;
const common_1 = require("@nestjs/common");
const p6_import_service_1 = require("./p6-import.service");
const p6_import_controller_1 = require("./p6-import.controller");
const prisma_service_1 = require("../../prisma/prisma.service");
const auth_module_1 = require("../auth/auth.module");
const tasks_module_1 = require("../tasks/tasks.module");
let P6ImportModule = class P6ImportModule {
};
exports.P6ImportModule = P6ImportModule;
exports.P6ImportModule = P6ImportModule = __decorate([
    (0, common_1.Module)({
        imports: [auth_module_1.AuthModule, tasks_module_1.TasksModule],
        providers: [p6_import_service_1.P6ImportService, prisma_service_1.PrismaService],
        controllers: [p6_import_controller_1.P6ImportController],
        exports: [p6_import_service_1.P6ImportService],
    })
], P6ImportModule);
//# sourceMappingURL=p6-import.module.js.map