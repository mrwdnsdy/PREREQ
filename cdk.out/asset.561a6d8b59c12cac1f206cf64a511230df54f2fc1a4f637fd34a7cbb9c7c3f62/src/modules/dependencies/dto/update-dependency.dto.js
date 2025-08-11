"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateDependencyDto = void 0;
const mapped_types_1 = require("@nestjs/mapped-types");
const create_dependency_dto_1 = require("./create-dependency.dto");
class UpdateDependencyDto extends (0, mapped_types_1.PartialType)((0, mapped_types_1.OmitType)(create_dependency_dto_1.CreateDependencyDto, ['predecessorId', 'successorId'])) {
}
exports.UpdateDependencyDto = UpdateDependencyDto;
//# sourceMappingURL=update-dependency.dto.js.map