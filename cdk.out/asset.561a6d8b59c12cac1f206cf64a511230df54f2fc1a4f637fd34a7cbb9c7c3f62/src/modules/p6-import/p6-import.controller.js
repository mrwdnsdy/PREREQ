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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.P6ImportController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const p6_import_service_1 = require("./p6-import.service");
let P6ImportController = class P6ImportController {
    constructor(p6ImportService) {
        this.p6ImportService = p6ImportService;
    }
    async importXER(projectId, file, req) {
        if (!file) {
            throw new common_1.BadRequestException('No file uploaded');
        }
        if (!file.originalname.toLowerCase().endsWith('.xer')) {
            throw new common_1.BadRequestException('File must be a .xer file');
        }
        return this.p6ImportService.importXERFile(file.buffer, projectId, req.user.id);
    }
    async importXML(projectId, file, req) {
        if (!file) {
            throw new common_1.BadRequestException('No file uploaded');
        }
        if (!file.originalname.toLowerCase().endsWith('.xml')) {
            throw new common_1.BadRequestException('File must be a .xml file');
        }
        return this.p6ImportService.importXMLFile(file.buffer, projectId, req.user.id);
    }
    async importExcel(projectId, file, req) {
        if (!file) {
            throw new common_1.BadRequestException('No file uploaded');
        }
        const validExtensions = ['.xlsx', '.xls'];
        const hasValidExtension = validExtensions.some(ext => file.originalname.toLowerCase().endsWith(ext));
        if (!hasValidExtension) {
            throw new common_1.BadRequestException('File must be an Excel file (.xlsx or .xls)');
        }
        return this.p6ImportService.importExcelFile(file.buffer, projectId, req.user.id);
    }
};
exports.P6ImportController = P6ImportController;
__decorate([
    (0, common_1.Post)('xer'),
    (0, swagger_1.ApiOperation)({ summary: 'Import P6 XER file' }),
    (0, swagger_1.ApiResponse)({ status: 201, description: 'XER file imported successfully' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Invalid file format' }),
    (0, swagger_1.ApiConsumes)('multipart/form-data'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file')),
    __param(0, (0, common_1.Param)('projectId')),
    __param(1, (0, common_1.UploadedFile)()),
    __param(2, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], P6ImportController.prototype, "importXER", null);
__decorate([
    (0, common_1.Post)('xml'),
    (0, swagger_1.ApiOperation)({ summary: 'Import P6 XML file' }),
    (0, swagger_1.ApiResponse)({ status: 201, description: 'XML file imported successfully' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Invalid file format' }),
    (0, swagger_1.ApiConsumes)('multipart/form-data'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file')),
    __param(0, (0, common_1.Param)('projectId')),
    __param(1, (0, common_1.UploadedFile)()),
    __param(2, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], P6ImportController.prototype, "importXML", null);
__decorate([
    (0, common_1.Post)('excel'),
    (0, swagger_1.ApiOperation)({ summary: 'Import Excel schedule template' }),
    (0, swagger_1.ApiResponse)({ status: 201, description: 'Excel file imported successfully' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Invalid file format' }),
    (0, swagger_1.ApiConsumes)('multipart/form-data'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file')),
    __param(0, (0, common_1.Param)('projectId')),
    __param(1, (0, common_1.UploadedFile)()),
    __param(2, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], P6ImportController.prototype, "importExcel", null);
exports.P6ImportController = P6ImportController = __decorate([
    (0, swagger_1.ApiTags)('P6 Import'),
    (0, common_1.Controller)('projects/:projectId/import-p6'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __metadata("design:paramtypes", [p6_import_service_1.P6ImportService])
], P6ImportController);
//# sourceMappingURL=p6-import.controller.js.map