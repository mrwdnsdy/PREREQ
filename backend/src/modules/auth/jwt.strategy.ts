import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthService } from './auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private authService: AuthService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'fallback-secret',
    });
  }

  async validate(payload: any) {
    try {
      // For Cognito tokens, we need to validate them differently
      // This is a simplified version - in production, you'd verify the JWT signature
      const user = await this.authService.validateCognitoToken(payload.sub);
      return user;
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }
  }
} 