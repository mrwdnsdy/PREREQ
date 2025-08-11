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
exports.ProjectAccessGuard = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const auth_service_1 = require("./auth.service");
let ProjectAccessGuard = class ProjectAccessGuard {
    constructor(reflector, authService) {
        this.reflector = reflector;
        this.authService = authService;
    }
    async canActivate(context) {
        const requiredRole = this.reflector.get('requiredRole', context.getHandler());
        const request = context.switchToHttp().getRequest();
        const user = request.user;
        const projectId = request.params.projectId || request.body.projectId;
        if (!user || !projectId) {
            return false;
        }
        const hasAccess = await this.authService.hasProjectAccess(user.id, projectId, requiredRole || 'VIEWER');
        if (!hasAccess) {
            throw new common_1.ForbiddenException('Insufficient permissions for this project');
        }
        return true;
    }
};
exports.ProjectAccessGuard = ProjectAccessGuard;
exports.ProjectAccessGuard = ProjectAccessGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.Reflector,
        auth_service_1.AuthService])
], ProjectAccessGuard);
//# sourceMappingURL=project-access.guard.js.map