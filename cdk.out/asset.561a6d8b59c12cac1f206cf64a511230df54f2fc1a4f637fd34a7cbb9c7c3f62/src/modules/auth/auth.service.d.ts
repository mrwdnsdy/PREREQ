import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
export declare class AuthService {
    private prisma;
    private jwtService;
    private cognitoClient;
    private userPoolId;
    private clientId;
    constructor(prisma: PrismaService, jwtService: JwtService);
    login(email: string, password: string): Promise<{
        accessToken: string;
        user: any;
    }>;
    signup(email: string, password: string, fullName?: string): Promise<{
        userSub: string;
        message: string;
        codeDeliveryDetails: import("@aws-sdk/client-cognito-identity-provider").CodeDeliveryDetailsType;
    }>;
    confirmSignup(email: string, confirmationCode: string): Promise<{
        message: string;
    }>;
    validateCognitoToken(token: string): Promise<any>;
    getUserProjects(userId: string): Promise<any>;
    getUserRole(userId: string, projectId: string): Promise<any>;
    hasProjectAccess(userId: string, projectId: string, requiredRole?: 'ADMIN' | 'PM' | 'VIEWER'): Promise<boolean>;
    getUserById(id: string): Promise<any>;
    devLogin(email: string): Promise<{
        accessToken: string;
        user: any;
    }>;
}
