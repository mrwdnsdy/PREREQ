"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const auth_module_1 = require("./modules/auth/auth.module");
const projects_module_1 = require("./modules/projects/projects.module");
const tasks_module_1 = require("./modules/tasks/tasks.module");
const relations_module_1 = require("./modules/relations/relations.module");
const p6_import_module_1 = require("./modules/p6-import/p6-import.module");
const portfolio_module_1 = require("./modules/portfolio/portfolio.module");
const dependencies_module_1 = require("./modules/dependencies/dependencies.module");
const resources_module_1 = require("./modules/resources/resources.module");
const resource_assignments_module_1 = require("./modules/resource-assignments/resource-assignments.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
                envFilePath: ['.env.dev', '.env'],
            }),
            auth_module_1.AuthModule,
            projects_module_1.ProjectsModule,
            tasks_module_1.TasksModule,
            relations_module_1.RelationsModule,
            p6_import_module_1.P6ImportModule,
            portfolio_module_1.PortfolioModule,
            dependencies_module_1.DependenciesModule,
            resources_module_1.ResourcesModule,
            resource_assignments_module_1.ResourceAssignmentsModule,
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map