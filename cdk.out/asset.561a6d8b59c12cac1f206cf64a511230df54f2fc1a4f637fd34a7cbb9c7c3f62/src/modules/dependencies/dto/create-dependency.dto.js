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
exports.CreateDependencyDto = exports.IsNotSelfLinkConstraint = void 0;
const class_validator_1 = require("class-validator");
let IsNotSelfLinkConstraint = class IsNotSelfLinkConstraint {
    validate(value, args) {
        const object = args.object;
        return value !== object.predecessorId;
    }
    defaultMessage(args) {
        return 'Successor task cannot be the same as predecessor task (self-link not allowed)';
    }
};
exports.IsNotSelfLinkConstraint = IsNotSelfLinkConstraint;
exports.IsNotSelfLinkConstraint = IsNotSelfLinkConstraint = __decorate([
    (0, class_validator_1.ValidatorConstraint)({ name: 'IsNotSelfLink', async: false })
], IsNotSelfLinkConstraint);
class CreateDependencyDto {
    constructor() {
        this.lag = 0;
    }
}
exports.CreateDependencyDto = CreateDependencyDto;
__decorate([
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateDependencyDto.prototype, "predecessorId", void 0);
__decorate([
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Validate)(IsNotSelfLinkConstraint),
    __metadata("design:type", String)
], CreateDependencyDto.prototype, "successorId", void 0);
__decorate([
    (0, class_validator_1.IsEnum)({
        message: 'Type must be one of: FS (Finish-to-Start), SS (Start-to-Start), FF (Finish-to-Finish), SF (Start-to-Finish)'
    }),
    __metadata("design:type", String)
], CreateDependencyDto.prototype, "type", void 0);
__decorate([
    (0, class_validator_1.IsInt)({ message: 'Lag must be an integer (can be negative for leads)' }),
    (0, class_validator_1.Min)(-365, { message: 'Lag cannot be less than -365 days' }),
    (0, class_validator_1.Max)(365, { message: 'Lag cannot be more than 365 days' }),
    __metadata("design:type", Number)
], CreateDependencyDto.prototype, "lag", void 0);
//# sourceMappingURL=create-dependency.dto.js.map