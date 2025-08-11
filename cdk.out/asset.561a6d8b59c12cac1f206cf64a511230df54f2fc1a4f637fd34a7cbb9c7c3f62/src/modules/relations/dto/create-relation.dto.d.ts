export declare enum RelationType {
    FS = "FS",
    SS = "SS",
    FF = "FF",
    SF = "SF"
}
export declare class CreateRelationDto {
    successorId: string;
    type: RelationType;
    lag: number;
}
