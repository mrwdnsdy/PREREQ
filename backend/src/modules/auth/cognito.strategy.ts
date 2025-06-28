import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { AuthService } from './auth.service';

@Injectable()
export class CognitoStrategy extends PassportStrategy(Strategy, 'cognito') {
  constructor(private authService: AuthService) {
    super();
  }

  async validate(token: string) {
    try {
      const user = await this.authService.validateCognitoToken(token);
      if (!user) {
        throw new UnauthorizedException();
      }
      return user;
    } catch (error) {
      throw new UnauthorizedException('Invalid Cognito token');
    }
  }
} 