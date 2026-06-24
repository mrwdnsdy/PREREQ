import { HttpException, HttpStatus } from '@nestjs/common';
import { AuthController } from './auth.controller';

/**
 * Controller-level tests for AuthController. The login/signup/confirm handlers
 * translate any service error into an HttpException with a specific status, so
 * both the happy path and the error-wrapping path are covered.
 */
describe('AuthController', () => {
  let controller: AuthController;
  let service: any;

  beforeEach(() => {
    service = {
      login: jest.fn(),
      signup: jest.fn(),
      confirmSignup: jest.fn(),
      devLogin: jest.fn(),
      getUserProjects: jest.fn(),
    };
    controller = new AuthController(service);
  });

  describe('login()', () => {
    it('returns the service result on success', async () => {
      service.login.mockResolvedValue({ accessToken: 'tok' });
      await expect(controller.login({ email: 'e', password: 'p' })).resolves.toEqual({
        accessToken: 'tok',
      });
      expect(service.login).toHaveBeenCalledWith('e', 'p');
    });

    it('wraps service errors as a 401 HttpException', async () => {
      service.login.mockRejectedValue(new Error('nope'));
      try {
        await controller.login({ email: 'e', password: 'p' });
        fail('expected an HttpException');
      } catch (err) {
        expect(err).toBeInstanceOf(HttpException);
        expect((err as HttpException).getStatus()).toBe(HttpStatus.UNAUTHORIZED);
        expect((err as HttpException).message).toBe('nope');
      }
    });
  });

  describe('signup()', () => {
    it('forwards email, password and full name', async () => {
      service.signup.mockResolvedValue({ ok: true });
      await controller.signup({ email: 'e', password: 'p', fullName: 'Full Name' });
      expect(service.signup).toHaveBeenCalledWith('e', 'p', 'Full Name');
    });

    it('wraps service errors as a 400 HttpException', async () => {
      service.signup.mockRejectedValue(new Error('bad'));
      await expect(controller.signup({ email: 'e', password: 'p' })).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
      });
    });
  });

  it('getProfile() echoes the authenticated user', async () => {
    const user = { id: 'u1', email: 'e' };
    await expect(controller.getProfile(user)).resolves.toEqual(user);
  });
});
