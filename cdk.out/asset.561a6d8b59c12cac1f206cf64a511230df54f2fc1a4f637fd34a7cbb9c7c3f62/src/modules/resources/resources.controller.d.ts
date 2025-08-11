import { ResourcesService } from './resources.service';
import { CreateResourceTypeDto } from './dto/create-resource-type.dto';
import { CreateResourceDto } from './dto/create-resource.dto';
import { UpdateResourceDto } from './dto/update-resource.dto';
export declare class ResourcesController {
    private readonly resourcesService;
    constructor(resourcesService: ResourcesService);
    createResourceType(createResourceTypeDto: CreateResourceTypeDto): Promise<any>;
    findAllResourceTypes(): Promise<any>;
    findOneResourceType(id: string): Promise<any>;
    deleteResourceType(id: string): Promise<any>;
    createResource(createResourceDto: CreateResourceDto): Promise<any>;
    findAllResources(typeId?: string): Promise<any>;
    findOneResource(id: string): Promise<any>;
    updateResource(id: string, updateResourceDto: UpdateResourceDto): Promise<any>;
    deleteResource(id: string): Promise<any>;
}
