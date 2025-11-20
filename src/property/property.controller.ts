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
  Req,Get,Delete,Patch,Param
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Types } from 'mongoose';
import { I18nLang, I18nService } from 'nestjs-i18n';

import { PropertyService, ICreateAssetPayload } from './property.service';
import { AssetDocument } from './property.schema';
import { MerchantJwtAuthGuard } from 'src/merchant/merchantAuthGuard';
import { CreateAssetDto } from './property.dto';
import { ManagerJwtAuthGuard } from 'src/admin/AdminAuthguard';
@Controller('merchant/properties')
export class PropertyController {
  private readonly logger = new Logger(PropertyController.name);

  constructor(
    private readonly propertyService: PropertyService,
    private readonly i18n: I18nService,
  ) {}

  // ==========================================================
  // 📦 CREATE PROPERTY (Uploads images to Cloudinary)
  // ==========================================================
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(MerchantJwtAuthGuard)
  @UseInterceptors(
    FilesInterceptor('images', 5, {
      storage: memoryStorage(), // ✅ Store files in memory for Cloudinary
      limits: { fileSize: 10 * 1024 * 1024 }, // Max 10MB per file
    }),
  )
  async create(
    @Body() payload: CreateAssetDto,
    @UploadedFiles() files: Array<Express.Multer.File>,
    @Req() req: any,
    @I18nLang() lang: string,
  ): Promise<{ message: string; asset: AssetDocument }> {
    this.logger.log('📥 Received property creation request');

    // ✅ Validate files
    if (!files || files.length === 0) {
      const missingImageError = await this.i18n.translate('property.ERROR_IMAGE_REQUIRED', { lang });
      this.logger.error('❌ No images uploaded');
      throw new BadRequestException(missingImageError);
    }

    this.logger.log(`🖼️ ${files.length} image(s) received`);

    // ✅ Validate Merchant ID from JWT
    const merchantId = req.user?.sub;
    if (!merchantId || !Types.ObjectId.isValid(merchantId)) {
      this.logger.error('❌ Invalid or missing merchant ID in JWT token');
      throw new BadRequestException('Invalid or missing merchant ID in token');
    }

    // ✅ Prepare data for service
    const createAssetPayload: ICreateAssetPayload = {
      ...payload,
      imageFiles: files,
    };

    this.logger.log('🚀 Creating property via PropertyService...');

    // ✅ Delegate to service
    const result = await this.propertyService.createProperty(
      new Types.ObjectId(merchantId),
      createAssetPayload,
      lang,
    );

    this.logger.log('✅ Property created successfully');
    return result;
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