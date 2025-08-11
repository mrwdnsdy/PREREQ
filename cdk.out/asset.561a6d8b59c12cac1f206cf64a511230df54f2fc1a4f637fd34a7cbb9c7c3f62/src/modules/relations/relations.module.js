"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RelationsModule = void 0;
const common_1 = require("@nestjs/common");
const relations_service_1 = require("./relations.service");
const relations_controller_1 = require("./relations.controller");
const prisma_service_1 = require("../../prisma/prisma.service");
const auth_module_1 = require("../auth/auth.module");
let RelationsModule = class RelationsModule {
};
exports.RelationsModule = RelationsModule;
exports.RelationsModule = RelationsModule = __decorate([
    (0, common_1.Module)({
        imports: [auth_module_1.AuthModule],
        providers: [relations_service_1.RelationsService, prisma_service_1.PrismaService],
        controllers: [relations_controller_1.RelationsController],
        exports: [relations_service_1.RelationsService],
    })
], RelationsModule);
//# sourceMappingURL=relations.module.js.map