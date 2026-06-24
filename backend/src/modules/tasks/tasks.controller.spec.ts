import { TasksController } from './tasks.controller';

/**
 * Controller-level tests for TasksController: delegation to the services, the
 * "no file" guard on CSV import, and the private parseCsvToTasks header-mapping
 * logic (a pure transform that turns raw CSV into import rows).
 */
describe('TasksController', () => {
  let controller: TasksController;
  let tasksService: any;
  let scheduleImportService: any;

  const req = { user: { id: 'u1' } } as any;

  beforeEach(() => {
    tasksService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };
    scheduleImportService = {
      importSchedule: jest.fn(),
    };
    controller = new TasksController(tasksService, scheduleImportService);
  });

  it('create() passes the authenticated user id', () => {
    const dto: any = { title: 'T', projectId: 'p1' };
    controller.create(dto, req);
    expect(tasksService.create).toHaveBeenCalledWith(dto, 'u1');
  });

  it('findAll() scopes by project and user', () => {
    controller.findAll('p1', req);
    expect(tasksService.findAll).toHaveBeenCalledWith('p1', 'u1');
  });

  it('importSchedule() forces the projectId from the route onto the DTO', () => {
    const dto: any = { projectId: 'stale', tasks: [] };
    controller.importSchedule('p1', dto, req);
    expect(dto.projectId).toBe('p1');
    expect(scheduleImportService.importSchedule).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'p1' }),
      'u1',
    );
  });

  it('importScheduleFromCsv() throws when no file is uploaded', async () => {
    await expect(
      controller.importScheduleFromCsv('p1', undefined as any, req),
    ).rejects.toThrow('No file uploaded');
  });

  describe('parseCsvToTasks', () => {
    const parse = (csv: string): any[] => (controller as any).parseCsvToTasks(csv);

    it('maps headers (case-insensitively) to task fields', () => {
      const csv = [
        'Level,Activity ID,Description,Duration,Budget',
        '2,A1010,Design the thing,5,1000',
      ].join('\n');

      const tasks = parse(csv);
      expect(tasks).toHaveLength(1);
      expect(tasks[0]).toMatchObject({
        level: 2,
        activityId: 'A1010',
        description: 'Design the thing',
        duration: 5,
        budget: 1000,
      });
    });

    it('skips rows missing an activity id or description', () => {
      const csv = [
        'Activity ID,Description',
        ',No id here',
        'A2,',
        'A3,Valid row',
      ].join('\n');

      const tasks = parse(csv);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].activityId).toBe('A3');
    });

    it('strips surrounding quotes from values', () => {
      const csv = ['"Activity ID","Description"', '"A1","Quoted title"'].join('\n');
      const tasks = parse(csv);
      expect(tasks[0]).toMatchObject({ activityId: 'A1', description: 'Quoted title' });
    });

    it('defaults level to 1 when not numeric', () => {
      const csv = ['Level,Activity ID,Description', 'abc,A1,Title'].join('\n');
      const tasks = parse(csv);
      expect(tasks[0].level).toBe(1);
    });
  });
});
