import { DependenciesController } from './dependencies.controller';

/**
 * Controller-level tests: verify each route delegates to the service with the
 * right arguments and returns its result. The controller is instantiated
 * directly with a mocked service (guards/pipes are exercised separately).
 */
describe('DependenciesController', () => {
  let controller: DependenciesController;
  let service: any;

  beforeEach(() => {
    service = {
      create: jest.fn(),
      findAll: jest.fn(),
      findByTaskId: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };
    controller = new DependenciesController(service);
  });

  it('create() delegates to the service', async () => {
    const dto: any = { predecessorId: 'a', successorId: 'b', type: 'FS', lag: 0 };
    service.create.mockResolvedValue({ id: 'dep1' });

    await expect(controller.create(dto)).resolves.toEqual({ id: 'dep1' });
    expect(service.create).toHaveBeenCalledWith(dto);
  });

  it('findAll() forwards the projectId filter', async () => {
    service.findAll.mockResolvedValue([]);
    await controller.findAll('proj1');
    expect(service.findAll).toHaveBeenCalledWith('proj1');
  });

  it('findByTaskId() forwards the task id', async () => {
    service.findByTaskId.mockResolvedValue({ asPredecessor: [], asSuccessor: [] });
    await controller.findByTaskId('task1');
    expect(service.findByTaskId).toHaveBeenCalledWith('task1');
  });

  it('findOne() forwards the id', async () => {
    service.findOne.mockResolvedValue({ id: 'dep1' });
    await controller.findOne('dep1');
    expect(service.findOne).toHaveBeenCalledWith('dep1');
  });

  it('update() forwards the id and dto', async () => {
    const dto: any = { lag: 5 };
    service.update.mockResolvedValue({ id: 'dep1', lag: 5 });
    await controller.update('dep1', dto);
    expect(service.update).toHaveBeenCalledWith('dep1', dto);
  });

  it('remove() delegates and returns nothing (204)', async () => {
    service.remove.mockResolvedValue({ id: 'dep1' });
    await expect(controller.remove('dep1')).resolves.toBeUndefined();
    expect(service.remove).toHaveBeenCalledWith('dep1');
  });
});
