"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateRelationDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const create_relation_dto_1 = require("./create-relation.dto");
class UpdateRelationDto extends (0, swagger_1.PartialType)(create_relation_dto_1.CreateRelationDto) {
}
exports.UpdateRelationDto = UpdateRelationDto;
//# sourceMappingURL=update-relation.dto.js.map