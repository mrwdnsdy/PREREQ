"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateResourceDto = void 0;
const mapped_types_1 = require("@nestjs/mapped-types");
const create_resource_dto_1 = require("./create-resource.dto");
class UpdateResourceDto extends (0, mapped_types_1.PartialType)(create_resource_dto_1.CreateResourceDto) {
}
exports.UpdateResourceDto = UpdateResourceDto;
//# sourceMappingURL=update-resource.dto.js.map