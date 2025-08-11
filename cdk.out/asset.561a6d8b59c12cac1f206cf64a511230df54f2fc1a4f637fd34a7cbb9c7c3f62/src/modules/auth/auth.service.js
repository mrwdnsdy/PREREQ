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
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const client_cognito_identity_provider_1 = require("@aws-sdk/client-cognito-identity-provider");
const prisma_service_1 = require("../../prisma/prisma.service");
let AuthService = class AuthService {
    constructor(prisma, jwtService) {
        this.prisma = prisma;
        this.jwtService = jwtService;
        this.cognitoClient = new client_cognito_identity_provider_1.CognitoIdentityProviderClient({
            region: process.env.AWS_REGION || 'us-east-2',
        });
        this.userPoolId = process.env.COGNITO_USER_POOL_ID || '';
        this.clientId = process.env.COGNITO_CLIENT_ID || '';
    }
    async login(email, password) {
        try {
            const command = new client_cognito_identity_provider_1.InitiateAuthCommand({
                AuthFlow: client_cognito_identity_provider_1.AuthFlowType.USER_PASSWORD_AUTH,
                ClientId: this.clientId,
                AuthParameters: {
                    USERNAME: email,
                    PASSWORD: password,
                },
            });
            const response = await this.cognitoClient.send(command);
            if (response.AuthenticationResult?.AccessToken) {
                const cognitoUser = await this.validateCognitoToken(response.AuthenticationResult.AccessToken);
                const payload = {
                    sub: cognitoUser.id,
                    email: cognitoUser.email,
                    cognitoId: cognitoUser.cognitoId
                };
                const accessToken = this.jwtService.sign(payload);
                return {
                    accessToken,
                    user: cognitoUser,
                };
            }
            throw new common_1.UnauthorizedException('Login failed');
        }
        catch (error) {
            console.error('Login error:', error);
            throw new common_1.UnauthorizedException(error.message || 'Invalid credentials');
        }
    }
    async signup(email, password, fullName) {
        try {
            const command = new client_cognito_identity_provider_1.SignUpCommand({
                ClientId: this.clientId,
                Username: email,
                Password: password,
                UserAttributes: [
                    { Name: 'email', Value: email },
                    ...(fullName ? [{ Name: 'name', Value: fullName }] : []),
                ],
            });
            const response = await this.cognitoClient.send(command);
            return {
                userSub: response.UserSub,
                message: 'User created successfully. Please check your email for verification code.',
                codeDeliveryDetails: response.CodeDeliveryDetails,
            };
        }
        catch (error) {
            console.error('Signup error:', error);
            throw new Error(error.message || 'Failed to create account');
        }
    }
    async confirmSignup(email, confirmationCode) {
        try {
            const command = new client_cognito_identity_provider_1.ConfirmSignUpCommand({
                ClientId: this.clientId,
                Username: email,
                ConfirmationCode: confirmationCode,
            });
            await this.cognitoClient.send(command);
            return {
                message: 'Email confirmed successfully. You can now login.',
            };
        }
        catch (error) {
            console.error('Confirmation error:', error);
            throw new Error(error.message || 'Failed to confirm email');
        }
    }
    async validateCognitoToken(token) {
        try {
            const command = new client_cognito_identity_provider_1.GetUserCommand({
                AccessToken: token,
            });
            const response = await this.cognitoClient.send(command);
            const email = response.UserAttributes?.find(attr => attr.Name === 'email')?.Value;
            const cognitoId = response.UserAttributes?.find(attr => attr.Name === 'sub')?.Value;
            const fullName = response.UserAttributes?.find(attr => attr.Name === 'name')?.Value;
            if (!email || !cognitoId) {
                throw new common_1.UnauthorizedException('Invalid token');
            }
            let user = await this.prisma.user.findUnique({
                where: { cognitoId },
            });
            if (!user) {
                const existingUser = await this.prisma.user.findUnique({
                    where: { email },
                });
                if (existingUser) {
                    user = await this.prisma.user.update({
                        where: { email },
                        data: {
                            cognitoId,
                            fullName: fullName || existingUser.fullName,
                        },
                    });
                }
                else {
                    user = await this.prisma.user.create({
                        data: {
                            email,
                            cognitoId,
                            fullName,
                        },
                    });
                }
            }
            return user;
        }
        catch (error) {
            throw new common_1.UnauthorizedException('Invalid token');
        }
    }
    async getUserProjects(userId) {
        return this.prisma.projectMember.findMany({
            where: { userId },
            include: {
                project: true,
            },
        });
    }
    async getUserRole(userId, projectId) {
        const member = await this.prisma.projectMember.findUnique({
            where: {
                userId_projectId: {
                    userId,
                    projectId,
                },
            },
        });
        return member?.role || null;
    }
    async hasProjectAccess(userId, projectId, requiredRole = 'VIEWER') {
        const member = await this.prisma.projectMember.findUnique({
            where: {
                userId_projectId: {
                    userId,
                    projectId,
                },
            },
        });
        if (!member)
            return false;
        const roleHierarchy = {
            'ADMIN': 3,
            'PM': 2,
            'VIEWER': 1,
        };
        return roleHierarchy[member.role] >= roleHierarchy[requiredRole];
    }
    async getUserById(id) {
        return this.prisma.user.findUnique({ where: { id } });
    }
    async devLogin(email) {
        try {
            console.log('Development login for:', email);
            const user = await this.prisma.user.findUnique({
                where: { email },
            });
            if (!user) {
                throw new common_1.UnauthorizedException('Demo user not found. Please run database seeding first.');
            }
            const payload = {
                sub: user.id,
                email: user.email,
                cognitoId: user.cognitoId || 'dev-user'
            };
            const accessToken = this.jwtService.sign(payload);
            console.log('Development login successful for user:', user.email);
            return {
                accessToken,
                user,
            };
        }
        catch (error) {
            console.error('Development login error:', error);
            throw new common_1.UnauthorizedException(error.message || 'Development login failed');
        }
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        jwt_1.JwtService])
], AuthService);
//# sourceMappingURL=auth.service.js.map