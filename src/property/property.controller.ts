import {
  Controller,
  Post,
  Body,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
  UseGuards,
  HttpStatus,
  HttpCode,
  Logger,
  Req,
  Get,
  Query,Patch,Param,Delete
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Types } from 'mongoose';
import { I18nLang, I18nService } from 'nestjs-i18n';
import { ManagerJwtAuthGuard } from 'src/admin/AdminAuthguard';
import { PropertyService } from './property.service';
import { MerchantJwtAuthGuard } from 'src/merchant/merchantAuthGuard';
import { CreateAssetDto } from './property.dto';

@Controller('merchant/properties')
export class PropertyController {
  private readonly logger = new Logger(PropertyController.name);

  constructor(
    private readonly propertyService: PropertyService,
    private readonly i18n: I18nService,
  ) {}

  // =====================================================
  // 1️⃣ DEMAND PREVIEW ENDPOINT (CALL WHEN CATEGORY CHANGES)
  // =====================================================
  @Get('demand-preview')
  @UseGuards(MerchantJwtAuthGuard)
  async getDemandPreview(
    @Query('category') category: string,
  ) {
    if (!category?.trim()) {
      throw new BadRequestException('Category is required.');
    }

    return this.propertyService.getPreUploadDemand(category);
  }

  // =====================================================
  // 2️⃣ CREATE PROPERTY (FULL REGISTRATION)
  // =====================================================
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(MerchantJwtAuthGuard)
  @UseInterceptors(
    FilesInterceptor('images', 5, {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (req, file, callback) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|webp)$/)) {
          return callback(
            new BadRequestException('Only image files are allowed!'),
            false,
          );
        }
        callback(null, true);
      },
    }),
  )
  async create(
    @Body() payload: CreateAssetDto,
    @UploadedFiles() files: Array<Express.Multer.File>,
    @Req() req: any,
    @I18nLang() lang: string,
  ) {
    this.logger.log(`📥 Merchant request: ${req.user?.sub}`);

    if (!files?.length) {
      throw new BadRequestException(
        await this.i18n.translate('property.ERROR_IMAGE_REQUIRED', { lang }),
      );
    }

    const merchantId = req.user?.sub;

    if (!Types.ObjectId.isValid(merchantId)) {
      throw new BadRequestException('Invalid authentication credentials.');
    }

    return this.propertyService.createProperty(
      new Types.ObjectId(merchantId),
      {
        ...payload,
        imageFiles: files,
      },
      lang,
    );
  }



 @Get('all')
  @UseGuards(ManagerJwtAuthGuard)
  async getAllProperties(@Req() req) {
    const lang = req.query.lang || 'en';
    return this.propertyService.getAllProperties(lang);
  }

  // ===========================================================
  // UPDATE PROPERTY (BY MANAGER)
  // ===========================================================
  @Patch(':id')
  @UseGuards(ManagerJwtAuthGuard)
  async updateProperty(
    @Param('id') id: string,
    @Body() updateData: any,
    @Req() req,
  ) {
    const lang = req.query.lang || 'en';
    return this.propertyService.updatePropertyByManager(new Types.ObjectId(id), updateData, lang);
  }

  // ===========================================================
  // DELETE PROPERTY (BY MANAGER)
  // ===========================================================
  @Delete(':id')
  @UseGuards(ManagerJwtAuthGuard)
  async deleteProperty(
    @Param('id') id: string,
    @Req() req,
  ) {
    const lang = req.query.lang || 'en';
    return this.propertyService.deletePropertyByManager(new Types.ObjectId(id), lang);
  }
}