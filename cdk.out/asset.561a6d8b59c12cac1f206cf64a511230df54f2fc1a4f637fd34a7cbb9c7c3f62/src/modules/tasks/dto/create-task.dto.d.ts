export declare class CreateTaskDto {
    projectId: string;
    parentId?: string;
    wbsCode?: string;
    title: string;
    description?: string;
    startDate: string;
    endDate: string;
    isMilestone?: boolean;
    costLabor?: number;
    costMaterial?: number;
    costOther?: number;
    resourceRole?: string;
    resourceQty?: number;
    resourceUnit?: string;
    roleHours?: Record<string, number>;
}
