export declare class ImportTaskRowDto {
    level: number;
    activityId: string;
    description: string;
    type?: string;
    duration?: number;
    startDate?: string;
    finishDate?: string;
    predecessors?: string;
    resourcing?: string;
    budget?: number;
    notes?: string;
}
export declare class ImportScheduleDto {
    projectId: string;
    tasks: ImportTaskRowDto[];
    options?: {
        replaceExisting?: boolean;
        generateWbsCodes?: boolean;
        validateDependencies?: boolean;
    };
}
