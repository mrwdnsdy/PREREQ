import { RelationsService } from './relations.service';
import { CreateRelationDto } from './dto/create-relation.dto';
import { UpdateRelationDto } from './dto/update-relation.dto';
export declare class RelationsController {
    private readonly relationsService;
    constructor(relationsService: RelationsService);
    create(taskId: string, createRelationDto: CreateRelationDto, req: any): Promise<any>;
    getTaskRelations(taskId: string, req: any): Promise<{
        predecessors: any;
        successors: any;
    }>;
    update(taskId: string, relationId: string, updateRelationDto: UpdateRelationDto, req: any): Promise<any>;
    remove(taskId: string, relationId: string, req: any): Promise<{
        message: string;
    }>;
}
