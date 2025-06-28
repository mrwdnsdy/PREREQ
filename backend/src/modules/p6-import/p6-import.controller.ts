import {
  Controller,
  Post,
  Param,
  UseGuards,
  Request,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiConsumes } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { P6ImportService } from './p6-import.service';

@ApiTags('P6 Import')
@Controller('projects/:projectId/import-p6')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class P6ImportController {
  constructor(private readonly p6ImportService: P6ImportService) {}

  @Post('xer')
  @ApiOperation({ summary: 'Import P6 XER file' })
  @ApiResponse({ status: 201, description: 'XER file imported successfully' })
  @ApiResponse({ status: 400, description: 'Invalid file format' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async importXER(
    @Param('projectId') projectId: string,
    @UploadedFile() file: Express.Multer.File,
    @Request() req,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    if (!file.originalname.toLowerCase().endsWith('.xer')) {
      throw new BadRequestException('File must be a .xer file');
    }

    return this.p6ImportService.importXERFile(file.buffer, projectId, req.user.id);
  }

  @Post('xml')
  @ApiOperation({ summary: 'Import P6 XML file' })
  @ApiResponse({ status: 201, description: 'XML file imported successfully' })
  @ApiResponse({ status: 400, description: 'Invalid file format' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async importXML(
    @Param('projectId') projectId: string,
    @UploadedFile() file: Express.Multer.File,
    @Request() req,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    if (!file.originalname.toLowerCase().endsWith('.xml')) {
      throw new BadRequestException('File must be a .xml file');
    }

    return this.p6ImportService.importXMLFile(file.buffer, projectId, req.user.id);
  }
} 