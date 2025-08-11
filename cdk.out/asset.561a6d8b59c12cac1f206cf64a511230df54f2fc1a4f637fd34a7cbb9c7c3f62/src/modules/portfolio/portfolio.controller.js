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
exports.PortfolioController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const portfolio_service_1 = require("./portfolio.service");
let PortfolioController = class PortfolioController {
    constructor(portfolioService) {
        this.portfolioService = portfolioService;
    }
    getPortfolioWBS(req) {
        return this.portfolioService.getPortfolioWBS(req.user.id);
    }
    getPortfolioSummary(req) {
        return this.portfolioService.getPortfolioSummary(req.user.id);
    }
};
exports.PortfolioController = PortfolioController;
__decorate([
    (0, common_1.Get)('wbs'),
    (0, swagger_1.ApiOperation)({ summary: 'Get aggregated WBS tree across all user projects' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Portfolio WBS structure' }),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], PortfolioController.prototype, "getPortfolioWBS", null);
__decorate([
    (0, common_1.Get)('summary'),
    (0, swagger_1.ApiOperation)({ summary: 'Get portfolio summary statistics' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Portfolio summary' }),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], PortfolioController.prototype, "getPortfolioSummary", null);
exports.PortfolioController = PortfolioController = __decorate([
    (0, swagger_1.ApiTags)('Portfolio'),
    (0, common_1.Controller)('portfolio'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __metadata("design:paramtypes", [portfolio_service_1.PortfolioService])
], PortfolioController);
//# sourceMappingURL=portfolio.controller.js.map