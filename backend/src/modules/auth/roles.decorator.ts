import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'requiredRole';
export const RequireRole = (role: 'ADMIN' | 'PM' | 'VIEWER') => SetMetadata(ROLES_KEY, role); 