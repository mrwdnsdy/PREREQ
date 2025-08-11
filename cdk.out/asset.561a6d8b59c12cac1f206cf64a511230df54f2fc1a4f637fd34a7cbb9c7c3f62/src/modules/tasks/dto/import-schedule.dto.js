"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImportScheduleDto = exports.ImportTaskRowDto = void 0;
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const swagger_1 = require("@nestjs/swagger");
class ImportTaskRowDto {
}
exports.ImportTaskRowDto = ImportTaskRowDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'WBS Level (1, 2, 3, 4, 5)' }),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], ImportTaskRowDto.prototype, "level", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Activity ID (e.g., A1010, A1020)' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ImportTaskRowDto.prototype, "activityId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Activity Description/Title' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ImportTaskRowDto.prototype, "description", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Task type (Task, Milestone)' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ImportTaskRowDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Duration in days' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], ImportTaskRowDto.prototype, "duration", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Start date (YYYY-MM-DD or ISO format)' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(({ value }) => {
        if (!value || value === '' || value === null || value === undefined) {
            return undefined;
        }
        if (typeof value === 'string' && value.trim() !== '') {
            const date = new Date(value);
            if (!isNaN(date.getTime())) {
                return value;
            }
        }
        return undefined;
    }),
    (0, class_validator_1.IsDateString)({}, { message: 'startDate must be a valid ISO 8601 date string' }),
    __metadata("design:type", String)
], ImportTaskRowDto.prototype, "startDate", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Finish date (YYYY-MM-DD or ISO format)' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(({ value }) => {
        if (!value || value === '' || value === null || value === undefined) {
            return undefined;
        }
        if (typeof value === 'string' && value.trim() !== '') {
            const date = new Date(value);
            if (!isNaN(date.getTime())) {
                return value;
            }
        }
        return undefined;
    }),
    (0, class_validator_1.IsDateString)({}, { message: 'finishDate must be a valid ISO 8601 date string' }),
    __metadata("design:type", String)
], ImportTaskRowDto.prototype, "finishDate", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Predecessor activity IDs (comma-separated)' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(({ value }) => value === '' || value === null ? undefined : value),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ImportTaskRowDto.prototype, "predecessors", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Resource assignment (role and quantity)' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(({ value }) => value === '' || value === null ? undefined : value),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ImportTaskRowDto.prototype, "resourcing", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Budget amount' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], ImportTaskRowDto.prototype, "budget", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Additional notes or comments' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(({ value }) => value === '' || value === null ? undefined : value),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ImportTaskRowDto.prototype, "notes", void 0);
class ImportScheduleDto {
}
exports.ImportScheduleDto = ImportScheduleDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Project ID to import tasks into' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ImportScheduleDto.prototype, "projectId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Array of task rows to import', type: [ImportTaskRowDto] }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => ImportTaskRowDto),
    __metadata("design:type", Array)
], ImportScheduleDto.prototype, "tasks", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Import options' }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], ImportScheduleDto.prototype, "options", void 0);
//# sourceMappingURL=import-schedule.dto.js.map