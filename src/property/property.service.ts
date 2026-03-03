import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  ForbiddenException,NotFoundException
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { I18nService } from 'nestjs-i18n';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import FormData from 'form-data';

import { Asset, AssetDocument, AssetStatus } from './property.schema';
import { User, UserDocument, UserRole } from '../schema/user.schema';
import { CloudinaryService } from '../cloudinary/cloudinary.service';

export interface ICreateAssetPayload {
  name: string;
  description: string;
  category: string;
  location: string;
  rentalPriceperday: number;
  rentalPriceperhour: number;
  rentalPriceperweek: number;
  rentalPricepermonth: number;
  rentalPriceperyear: number;
  numberOfProperty: number;
  imageFiles: Express.Multer.File[];
}

@Injectable()
export class PropertyService {
  private readonly AI_BASE_URL = 'https://ai-merchant-portal.onrender.com';

  constructor(
    @InjectModel(Asset.name)
    private readonly assetModel: Model<AssetDocument>,

    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,

    private readonly i18n: I18nService,
    private readonly cloudinaryService: CloudinaryService,
    private readonly httpService: HttpService,
  ) {}

  // =========================================================
  // CATEGORY NORMALIZATION (REUSE OR CREATE)
  // =========================================================
  private async findOrCreateCategory(inputCategory: string): Promise<string> {
    const normalized = inputCategory.trim().toLowerCase();

    const existingCategory = await this.assetModel.findOne({
      category: { $regex: new RegExp(`^${normalized}$`, 'i') },
    });

    return existingCategory ? existingCategory.category : normalized;
  }

  // =========================================================
  // CATEGORY SEARCH (DYNAMIC SUGGESTIONS)
  // =========================================================
  async searchCategories(query: string): Promise<string[]> {
    if (!query?.trim()) return [];

    return this.assetModel.distinct('category', {
      category: { $regex: new RegExp(query.trim(), 'i') },
    });
  }

  // =========================================================
  // AI IMAGE VALIDATION
  // =========================================================
  async validateImageWithAI(image: Express.Multer.File) {
    try {
      const formData = new FormData();

      formData.append('file', image.buffer, {
        filename: image.originalname,
        contentType: image.mimetype,
      });

      const headers = {
        ...formData.getHeaders(),
        'Content-Length': formData.getLengthSync(),
      };

      const response = await firstValueFrom(
        this.httpService.post(
          `${this.AI_BASE_URL}/validate-asset-image`,
          formData,
          {
            headers,
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
            timeout: 90000,
          },
        ),
      );

      return response.data;
    } catch (error) {
      console.error('AI validation error:', error.message);

      throw new BadRequestException(
        error.response?.data || 'AI validation failed',
      );
    }
  }

  // =========================================================
  // AI DEMAND PREDICTION
  // =========================================================
  async getPreUploadDemand(category: string) {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.AI_BASE_URL}/pre-upload-demand`, {
          params: { category },
          timeout: 90000,
        }),
      );

      const data = response.data;

      return {
        predictedDemand: data.predicted_demand_value ?? 0,
        demandLevel: data.demand_level ?? 'UNKNOWN',
        notification: data.merchant_notification ?? '',
        recommendedAction: data.recommended_action ?? '',
      };
    } catch (error) {
      console.warn('AI demand service unavailable.');

      return {
        predictedDemand: 0,
        demandLevel: 'UNKNOWN',
        notification: '',
        recommendedAction: '',
      };
    }
  }

  // =========================================================
  // CREATE PROPERTY
  // =========================================================
  async createProperty(
    merchantId: Types.ObjectId,
    assetPayload: ICreateAssetPayload,
    lang: string,
  ) {
    try {
      const {
        name,
        description,
        category,
        location,
        rentalPriceperday,
        rentalPriceperhour,
        rentalPriceperweek,
        rentalPricepermonth,
        rentalPriceperyear,
        numberOfProperty,
        imageFiles,
      } = assetPayload;

      const notMerchantError = await this.i18n.translate(
        'property.ERROR_NOT_MERCHANT',
        { lang },
      );

      const successMessage = await this.i18n.translate(
        'property.SUCCESS_PROPERTY_CREATED',
        { lang },
      );

      const missingFieldsError = await this.i18n.translate(
        'property.ERROR_REQUIRED_FIELDS',
        { lang },
      );

      // =====================================================
      // MERCHANT VALIDATION
      // =====================================================
      const merchant = await this.userModel.findById(merchantId).exec();

      if (!merchant || merchant.role !== UserRole.MERCHANT) {
        throw new ForbiddenException(notMerchantError);
      }

      // =====================================================
      // REQUIRED FIELD VALIDATION
      // =====================================================
      if (!category?.trim() || !location?.trim()) {
        throw new BadRequestException(missingFieldsError);
      }

      if (!imageFiles || imageFiles.length === 0) {
        throw new BadRequestException(missingFieldsError);
      }

      const normalizedLocation = location.trim().toLowerCase();

      // CATEGORY NORMALIZATION (NO HARDCODING)
      const finalCategory = await this.findOrCreateCategory(category);

      // =====================================================
      // AI IMAGE VALIDATION
      // =====================================================
      const validation = await this.validateImageWithAI(imageFiles[0]);

      if (!validation || validation.status !== 'success') {
        throw new InternalServerErrorException('AI validation failed.');
      }

      if (validation.allowed_upload === false) {
        throw new BadRequestException({
          message: 'AI detected invalid image. Registration failed.',
          prediction: validation.prediction,
          confidence: validation.confidence,
        });
      }

      // =====================================================
      // AI DEMAND PREDICTION
      // =====================================================
      let demandPrediction;

      try {
        demandPrediction = await this.getPreUploadDemand(finalCategory);
      } catch {
        demandPrediction = {
          predictedDemand: 0,
          demandLevel: 'UNKNOWN',
          notification: '',
          recommendedAction: '',
        };
      }

      // =====================================================
      // UPLOAD IMAGES TO CLOUDINARY
      // =====================================================
      let imageUrls: string[] = [];

      try {
        const uploadPromises = imageFiles.map((file) =>
          this.cloudinaryService.uploadImage(file, 'property-images'),
        );

        imageUrls = await Promise.all(uploadPromises);
      } catch {
        throw new InternalServerErrorException(
          'Failed to upload images to Cloudinary.',
        );
      }

      // =====================================================
      // CREATE MONGODB DOCUMENT
      // =====================================================
      const newAsset = new this.assetModel({
        merchant: merchantId,
        name,
        description,
        category: finalCategory,
        location: normalizedLocation,
        rentalPriceperday,
        rentalPriceperhour,
        rentalPriceperweek,
        rentalPricepermonth,
        rentalPriceperyear,
        numberOfProperty,
        imageUrls,
        status: AssetStatus.AVAILABLE,

        // AI Demand Data
        demandScore: demandPrediction.predictedDemand,
        monthlyEstimatedIncome: 0,
      });

      await newAsset.save();

      const populatedAsset = await newAsset.populate(
        'merchant',
        'fullName email phonenumber businessName accountnumber',
      );

      return {
        message: successMessage,
        asset: populatedAsset,
      };
    } catch (error) {
      console.error('Property creation error:', error);

      if (
        error instanceof BadRequestException ||
        error instanceof ForbiddenException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }

      throw new InternalServerErrorException(
        'Property creation failed.',
      );
    }
  }


// ===========================================================
// GET ALL PROPERTIES (MANAGER)
// ===========================================================
async getAllProperties(lang: string) {
  const properties = await this.assetModel
    .find()
    .populate('merchant', 'fullName email phonenumber businessName accountnumber')
    .lean();

  if (!properties.length) {
    throw new NotFoundException(
      await this.i18n.translate('property.ERROR_NO_PROPERTY_FOUND', { lang })
    );
  }

  return {
    message: await this.i18n.translate('property.SUCCESS_PROPERTIES_FETCHED', { lang }),
    totalProperties: properties.length,
    properties,
  };
}

// ===========================================================
// UPDATE PROPERTY (BY MANAGER)
// ===========================================================
async updatePropertyByManager(
  propertyId: Types.ObjectId,
  updateData: Partial<Asset>,
  lang: string,
) {
  const property = await this.assetModel.findById(propertyId);
  if (!property) {
    throw new NotFoundException(
      await this.i18n.translate('property.ERROR_NO_PROPERTY_FOUND', { lang })
    );
  }

  // Update only allowed fields
  const allowedFields = [
    'name', 'description', 'category',
    'rentalPriceperday', 'rentalPriceperhour', 'rentalPriceperweek',
    'rentalPricepermonth', 'rentalPriceperyear',
    'numberOfProperty', 'status'
  ];

  allowedFields.forEach(field => {
    if (updateData[field] !== undefined) {
      property[field] = updateData[field];
    }
  });

  await property.save();

  return {
    message: await this.i18n.translate('property.SUCCESS_PROPERTY_UPDATED', { lang }),
    updatedProperty: property,
  };
}

// ===========================================================
// DELETE PROPERTY (BY MANAGER)
// ===========================================================
async deletePropertyByManager(propertyId: Types.ObjectId, lang: string) {
  const property = await this.assetModel.findById(propertyId);
  if (!property) {
    throw new NotFoundException(
      await this.i18n.translate('property.ERROR_NO_PROPERTY_FOUND', { lang })
    );
  }

  await this.assetModel.deleteOne({ _id: propertyId });

  return {
    message: await this.i18n.translate('property.SUCCESS_PROPERTY_DELETED', { lang }),
    propertyId,
  };
}



}
