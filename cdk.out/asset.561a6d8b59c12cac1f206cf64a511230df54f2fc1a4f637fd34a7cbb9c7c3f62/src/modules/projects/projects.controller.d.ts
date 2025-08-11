import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
export declare class ProjectsController {
    private readonly projectsService;
    constructor(projectsService: ProjectsService);
    create(createProjectDto: CreateProjectDto, req: any): Promise<any>;
    findAll(req: any): Promise<any>;
    findOne(id: string, req: any): Promise<any>;
    update(id: string, updateProjectDto: UpdateProjectDto, req: any): Promise<any>;
    remove(id: string, user: any): Promise<any>;
    addMember(projectId: string, body: {
        userId: string;
        role: 'ADMIN' | 'PM' | 'VIEWER';
    }, req: any): Promise<any>;
    removeMember(projectId: string, memberUserId: string, req: any): Promise<{
        message: string;
    }>;
}
