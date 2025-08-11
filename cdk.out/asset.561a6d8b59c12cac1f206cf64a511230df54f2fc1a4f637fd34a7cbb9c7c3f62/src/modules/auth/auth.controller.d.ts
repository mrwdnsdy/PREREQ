import { AuthService } from './auth.service';
declare class LoginDto {
    email: string;
    password: string;
}
declare class SignupDto {
    email: string;
    password: string;
    fullName?: string;
}
declare class ConfirmSignupDto {
    email: string;
    confirmationCode: string;
}
export declare class AuthController {
    private authService;
    constructor(authService: AuthService);
    login(loginDto: LoginDto): Promise<{
        accessToken: string;
        user: any;
    }>;
    signup(signupDto: SignupDto): Promise<{
        userSub: string;
        message: string;
        codeDeliveryDetails: import("@aws-sdk/client-cognito-identity-provider").CodeDeliveryDetailsType;
    }>;
    confirmSignup(confirmDto: ConfirmSignupDto): Promise<{
        message: string;
    }>;
    devLogin(body: {
        email: string;
    }): Promise<{
        accessToken: string;
        user: any;
    }>;
    getProfile(user: any): Promise<any>;
    getUserProjects(user: any): Promise<any>;
}
export {};
