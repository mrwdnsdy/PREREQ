import { TasksService } from './tasks.service';
import { ScheduleImportService } from './schedule-import.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { ImportScheduleDto } from './dto/import-schedule.dto';
export declare class TasksController {
    private readonly tasksService;
    private readonly scheduleImportService;
    constructor(tasksService: TasksService, scheduleImportService: ScheduleImportService);
    create(createTaskDto: CreateTaskDto, req: any): Promise<any>;
    findAll(projectId: string, req: any): Promise<any>;
    getWbsTree(projectId: string, req: any): Promise<any[]>;
    getMilestones(projectId: string, req: any): Promise<any>;
    recalculateBudgets(projectId: string, req: any): Promise<{
        message: string;
    }>;
    findOne(id: string, req: any): Promise<any>;
    update(id: string, updateTaskDto: UpdateTaskDto, req: any): Promise<any>;
    remove(id: string, req: any): Promise<{
        message: string;
    }>;
    importSchedule(projectId: string, importScheduleDto: ImportScheduleDto, req: any): Promise<{
        success: boolean;
        importedTasks: number;
        message: string;
    }>;
    importScheduleFromCsv(projectId: string, file: Express.Multer.File, req: any): Promise<{
        success: boolean;
        importedTasks: number;
        message: string;
    }>;
    private parseCsvToTasks;
}
