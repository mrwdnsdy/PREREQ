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
exports.CreateRelationDto = exports.RelationType = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
var RelationType;
(function (RelationType) {
    RelationType["FS"] = "FS";
    RelationType["SS"] = "SS";
    RelationType["FF"] = "FF";
    RelationType["SF"] = "SF";
})(RelationType || (exports.RelationType = RelationType = {}));
class CreateRelationDto {
}
exports.CreateRelationDto = CreateRelationDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Successor task ID' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateRelationDto.prototype, "successorId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Relationship type',
        enum: RelationType,
        example: 'FS'
    }),
    (0, class_validator_1.IsEnum)(RelationType),
    __metadata("design:type", String)
], CreateRelationDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Lag in minutes (positive = delay, negative = lead)',
        example: 0
    }),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], CreateRelationDto.prototype, "lag", void 0);
//# sourceMappingURL=create-relation.dto.js.map