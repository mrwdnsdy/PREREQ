import { DependenciesService } from './dependencies.service';
import { CreateDependencyDto } from './dto/create-dependency.dto';
import { UpdateDependencyDto } from './dto/update-dependency.dto';
export declare class DependenciesController {
    private readonly dependenciesService;
    constructor(dependenciesService: DependenciesService);
    create(createDependencyDto: CreateDependencyDto): Promise<any>;
    findAll(projectId?: string): Promise<any[]>;
    findByTaskId(taskId: string): Promise<{
        asPredecessor: any[];
        asSuccessor: any[];
    }>;
    findOne(id: string): Promise<any>;
    update(id: string, updateDependencyDto: UpdateDependencyDto): Promise<any>;
    remove(id: string): Promise<void>;
}
