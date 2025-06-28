import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service';

@Injectable()
export class ProjectAccessGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRole = this.reflector.get<'ADMIN' | 'PM' | 'VIEWER'>('requiredRole', context.getHandler());
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const projectId = request.params.projectId || request.body.projectId;

    if (!user || !projectId) {
      return false;
    }

    const hasAccess = await this.authService.hasProjectAccess(user.id, projectId, requiredRole || 'VIEWER');
    
    if (!hasAccess) {
      throw new ForbiddenException('Insufficient permissions for this project');
    }

    return true;
  }
} 