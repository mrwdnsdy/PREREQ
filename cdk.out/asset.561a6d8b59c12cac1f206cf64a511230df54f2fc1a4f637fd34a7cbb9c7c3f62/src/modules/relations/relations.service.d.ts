import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { CreateRelationDto } from './dto/create-relation.dto';
import { UpdateRelationDto } from './dto/update-relation.dto';
export declare class RelationsService {
    private prisma;
    private authService;
    constructor(prisma: PrismaService, authService: AuthService);
    create(predecessorId: string, createRelationDto: CreateRelationDto, userId: string): Promise<any>;
    update(predecessorId: string, relationId: string, updateRelationDto: UpdateRelationDto, userId: string): Promise<any>;
    remove(predecessorId: string, relationId: string, userId: string): Promise<{
        message: string;
    }>;
    getTaskRelations(taskId: string, userId: string): Promise<{
        predecessors: any;
        successors: any;
    }>;
    private checkCircularDependency;
}
