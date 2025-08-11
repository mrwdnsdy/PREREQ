"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequireRole = exports.ROLES_KEY = void 0;
const common_1 = require("@nestjs/common");
exports.ROLES_KEY = 'requiredRole';
const RequireRole = (role) => (0, common_1.SetMetadata)(exports.ROLES_KEY, role);
exports.RequireRole = RequireRole;
//# sourceMappingURL=roles.decorator.js.map