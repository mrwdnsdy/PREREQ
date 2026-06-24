import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ProjectsController } from './projects.controller';

/**
 * Controller-level tests for ProjectsController. Beyond plain delegation,
 * remove() contains real authorization logic (only ADMIN members may delete),
 * so each of its branches is covered explicitly.
 */
describe('ProjectsController', () => {
  let controller: ProjectsController;
  let service: any;

  const req = { user: { id: 'u1', sub: 'u1' } } as any;

  beforeEach(() => {
    service = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      getUserProjectRole: jest.fn(),
      remove: jest.fn(),
      addMember: jest.fn(),
      removeMember: jest.fn(),
    };
    controller = new ProjectsController(service);
  });

  it('create() passes the authenticated user id', () => {
    const dto: any = { name: 'P' };
    controller.create(dto, req);
    expect(service.create).toHaveBeenCalledWith(dto, 'u1');
  });

  it('findAll() scopes to the authenticated user', () => {
    controller.findAll(req);
    expect(service.findAll).toHaveBeenCalledWith('u1');
  });

  it('findOne() forwards id and user', () => {
    controller.findOne('p1', req);
    expect(service.findOne).toHaveBeenCalledWith('p1', 'u1');
  });

  describe('remove()', () => {
    it('throws NotFoundException when the project does not exist', async () => {
      service.findOne.mockResolvedValue(null);
      await expect(controller.remove('p1', { sub: 'u1' })).rejects.toThrow(NotFoundException);
      expect(service.remove).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when the caller is not an ADMIN', async () => {
      service.findOne.mockResolvedValue({ id: 'p1' });
      service.getUserProjectRole.mockResolvedValue({ role: 'PM' });
      await expect(controller.remove('p1', { sub: 'u1' })).rejects.toThrow(ForbiddenException);
      expect(service.remove).not.toHaveBeenCalled();
    });

    it('deletes the project when the caller is an ADMIN', async () => {
      service.findOne.mockResolvedValue({ id: 'p1' });
      service.getUserProjectRole.mockResolvedValue({ role: 'ADMIN' });
      service.remove.mockResolvedValue({ id: 'p1' });

      await controller.remove('p1', { sub: 'u1' });
      expect(service.remove).toHaveBeenCalledWith('p1');
    });
  });

  it('addMember() forwards the membership details', () => {
    controller.addMember('p1', { userId: 'u2', role: 'VIEWER' }, req);
    expect(service.addMember).toHaveBeenCalledWith('p1', 'u1', 'u2', 'VIEWER');
  });
});
