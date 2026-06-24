import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Unit tests for the authorization logic in AuthService.hasProjectAccess —
 * the role-hierarchy check that gates every project-scoped route via
 * ProjectAccessGuard. Getting this wrong is a security issue, so the role
 * matrix is pinned explicitly here.
 */
describe('AuthService.hasProjectAccess', () => {
  let service: AuthService;

  const mockPrisma = {
    projectMember: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: { sign: jest.fn(), verify: jest.fn() } },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.resetAllMocks();
  });

  it('denies access when the user is not a member of the project', async () => {
    mockPrisma.projectMember.findUnique.mockResolvedValue(null);
    await expect(service.hasProjectAccess('u1', 'p1', 'VIEWER')).resolves.toBe(false);
  });

  it('grants access when the member role outranks the required role', async () => {
    mockPrisma.projectMember.findUnique.mockResolvedValue({ role: 'ADMIN' });
    await expect(service.hasProjectAccess('u1', 'p1', 'VIEWER')).resolves.toBe(true);
  });

  it('grants access when the member role equals the required role', async () => {
    mockPrisma.projectMember.findUnique.mockResolvedValue({ role: 'PM' });
    await expect(service.hasProjectAccess('u1', 'p1', 'PM')).resolves.toBe(true);
  });

  it('denies access when the member role is below the required role', async () => {
    mockPrisma.projectMember.findUnique.mockResolvedValue({ role: 'VIEWER' });
    await expect(service.hasProjectAccess('u1', 'p1', 'ADMIN')).resolves.toBe(false);
  });

  it('defaults the required role to VIEWER when none is provided', async () => {
    mockPrisma.projectMember.findUnique.mockResolvedValue({ role: 'VIEWER' });
    await expect(service.hasProjectAccess('u1', 'p1')).resolves.toBe(true);
  });
});
