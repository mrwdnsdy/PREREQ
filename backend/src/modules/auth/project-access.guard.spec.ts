import { ForbiddenException } from '@nestjs/common';
import { ProjectAccessGuard } from './project-access.guard';

/**
 * Unit tests for ProjectAccessGuard — the route guard that enforces
 * per-project role access. Covers each early-exit branch and the role
 * defaulting behaviour, since these decide whether a request is allowed through.
 */
describe('ProjectAccessGuard', () => {
  let guard: ProjectAccessGuard;
  let reflector: { get: jest.Mock };
  let authService: { hasProjectAccess: jest.Mock };

  const buildContext = (request: any) =>
    ({
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => () => undefined,
    }) as any;

  beforeEach(() => {
    reflector = { get: jest.fn() };
    authService = { hasProjectAccess: jest.fn() };
    guard = new ProjectAccessGuard(reflector as any, authService as any);
  });

  it('denies the request when there is no authenticated user', async () => {
    const ctx = buildContext({ params: { projectId: 'p1' }, body: {} });
    await expect(guard.canActivate(ctx)).resolves.toBe(false);
    expect(authService.hasProjectAccess).not.toHaveBeenCalled();
  });

  it('denies the request when no projectId can be resolved', async () => {
    const ctx = buildContext({ user: { id: 'u1' }, params: {}, body: {} });
    await expect(guard.canActivate(ctx)).resolves.toBe(false);
    expect(authService.hasProjectAccess).not.toHaveBeenCalled();
  });

  it('allows the request when the user has the required project access', async () => {
    reflector.get.mockReturnValue('PM');
    authService.hasProjectAccess.mockResolvedValue(true);
    const ctx = buildContext({ user: { id: 'u1' }, params: { projectId: 'p1' }, body: {} });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(authService.hasProjectAccess).toHaveBeenCalledWith('u1', 'p1', 'PM');
  });

  it('throws ForbiddenException when the user lacks the required access', async () => {
    reflector.get.mockReturnValue('ADMIN');
    authService.hasProjectAccess.mockResolvedValue(false);
    const ctx = buildContext({ user: { id: 'u1' }, params: { projectId: 'p1' }, body: {} });

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('defaults the required role to VIEWER when no @Roles metadata is present', async () => {
    reflector.get.mockReturnValue(undefined);
    authService.hasProjectAccess.mockResolvedValue(true);
    const ctx = buildContext({ user: { id: 'u1' }, params: { projectId: 'p1' }, body: {} });

    await guard.canActivate(ctx);
    expect(authService.hasProjectAccess).toHaveBeenCalledWith('u1', 'p1', 'VIEWER');
  });

  it('falls back to projectId from the request body when absent in params', async () => {
    reflector.get.mockReturnValue(undefined);
    authService.hasProjectAccess.mockResolvedValue(true);
    const ctx = buildContext({ user: { id: 'u1' }, params: {}, body: { projectId: 'p-body' } });

    await guard.canActivate(ctx);
    expect(authService.hasProjectAccess).toHaveBeenCalledWith('u1', 'p-body', 'VIEWER');
  });
});
