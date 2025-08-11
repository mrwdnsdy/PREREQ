import { PrismaService } from '../../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { AuthService } from '../auth/auth.service';
export declare class ProjectsService {
    private prisma;
    private authService;
    constructor(prisma: PrismaService, authService: AuthService);
    private generateUniqueActivityId;
    create(createProjectDto: CreateProjectDto, userId: string): Promise<any>;
    findAll(userId: string): Promise<any>;
    findOne(id: string, userId: string): Promise<any>;
    update(id: string, updateProjectDto: UpdateProjectDto, userId: string): Promise<any>;
    getUserProjectRole(userId: string, projectId: string): Promise<any>;
    remove(id: string): Promise<any>;
    addMember(projectId: string, userId: string, memberUserId: string, role: 'ADMIN' | 'PM' | 'VIEWER'): Promise<any>;
    removeMember(projectId: string, userId: string, memberUserId: string): Promise<{
        message: string;
    }>;
}
