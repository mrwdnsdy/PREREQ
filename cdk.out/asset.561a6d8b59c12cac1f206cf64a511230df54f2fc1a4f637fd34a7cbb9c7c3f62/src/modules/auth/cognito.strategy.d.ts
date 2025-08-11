import { Strategy } from 'passport-local';
import { AuthService } from './auth.service';
declare const CognitoStrategy_base: new (...args: any[]) => Strategy;
export declare class CognitoStrategy extends CognitoStrategy_base {
    private authService;
    constructor(authService: AuthService);
    validate(token: string): Promise<any>;
}
export {};
