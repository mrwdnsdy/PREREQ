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
exports.AuthController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("./jwt-auth.guard");
const auth_service_1 = require("./auth.service");
const current_user_decorator_1 = require("./current-user.decorator");
class LoginDto {
}
class SignupDto {
}
class ConfirmSignupDto {
}
let AuthController = class AuthController {
    constructor(authService) {
        this.authService = authService;
    }
    async login(loginDto) {
        try {
            return await this.authService.login(loginDto.email, loginDto.password);
        }
        catch (error) {
            throw new common_1.HttpException(error.message || 'Invalid credentials', common_1.HttpStatus.UNAUTHORIZED);
        }
    }
    async signup(signupDto) {
        try {
            return await this.authService.signup(signupDto.email, signupDto.password, signupDto.fullName);
        }
        catch (error) {
            throw new common_1.HttpException(error.message || 'Failed to create account', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async confirmSignup(confirmDto) {
        try {
            return await this.authService.confirmSignup(confirmDto.email, confirmDto.confirmationCode);
        }
        catch (error) {
            throw new common_1.HttpException(error.message || 'Failed to confirm signup', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async devLogin(body) {
        return this.authService.devLogin(body.email);
    }
    async getProfile(user) {
        return user;
    }
    async getUserProjects(user) {
        return this.authService.getUserProjects(user.id);
    }
};
exports.AuthController = AuthController;
__decorate([
    (0, common_1.Post)('login'),
    (0, swagger_1.ApiOperation)({ summary: 'Login with email and password' }),
    (0, swagger_1.ApiBody)({ type: LoginDto }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [LoginDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "login", null);
__decorate([
    (0, common_1.Post)('signup'),
    (0, swagger_1.ApiOperation)({ summary: 'Sign up with email and password' }),
    (0, swagger_1.ApiBody)({ type: SignupDto }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [SignupDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "signup", null);
__decorate([
    (0, common_1.Post)('confirm-signup'),
    (0, swagger_1.ApiOperation)({ summary: 'Confirm signup with verification code' }),
    (0, swagger_1.ApiBody)({ type: ConfirmSignupDto }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [ConfirmSignupDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "confirmSignup", null);
__decorate([
    (0, common_1.Post)('dev-login'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "devLogin", null);
__decorate([
    (0, common_1.Get)('profile'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Get user profile' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "getProfile", null);
__decorate([
    (0, common_1.Get)('projects'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Get user projects' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "getUserProjects", null);
exports.AuthController = AuthController = __decorate([
    (0, swagger_1.ApiTags)('Authentication'),
    (0, common_1.Controller)('auth'),
    __metadata("design:paramtypes", [auth_service_1.AuthService])
], AuthController);
//# sourceMappingURL=auth.controller.js.map