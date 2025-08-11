import { P6ImportService } from './p6-import.service';
export declare class P6ImportController {
    private readonly p6ImportService;
    constructor(p6ImportService: P6ImportService);
    importXER(projectId: string, file: Express.Multer.File, req: any): Promise<{
        message: string;
        project: any;
        tasksImported: number;
        relationsImported: number;
    }>;
    importXML(projectId: string, file: Express.Multer.File, req: any): Promise<{
        message: string;
        project: any;
        tasksImported: number;
        relationsImported: number;
    }>;
    importExcel(projectId: string, file: Express.Multer.File, req: any): Promise<{
        message: string;
        project: string;
        tasksImported: number;
        resourcesImported: number;
        assignmentsImported: number;
    }>;
}
