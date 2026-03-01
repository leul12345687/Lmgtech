import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  ForbiddenException,NotFoundException,
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
  private readonly AI_BASE_URL =
    'https://ai-merchant-portal.onrender.com';

  constructor(
    @InjectModel(Asset.name)
    private readonly assetModel: Model<AssetDocument>,

    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,

    private readonly i18n: I18nService,
    private readonly cloudinaryService: CloudinaryService,
    private readonly httpService: HttpService,
  ) {}

  /**
   * Normalize and reuse existing category if similar
   */
  private async findOrCreateCategory(
    inputCategory: string,
  ): Promise<string> {
    const normalized = inputCategory.trim().toLowerCase();

    const existingCategory = await this.assetModel.findOne({
      category: { $regex: new RegExp(`^${normalized}`, 'i') },
    });

    return existingCategory
      ? existingCategory.category
      : normalized;
  }

  /**
   * AI Image Validation
   */
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
        },
      ),
    );

    return response.data;

  }catch (error) {
  console.error('========= AI ERROR DEBUG =========');
  console.error('Status:', error.response?.status);
  console.error('Data:', error.response?.data);
  console.error('Message:', error.message);
  console.error('Stack:', error.stack);
  console.error('==================================');

  throw new BadRequestException(
    error.response?.data || 'AI validation failed',
  );
}
}

  /**
   * AI Demand Prediction
   */
  async getPreUploadDemand(category: string): Promise<{
  predictedDemand: number;
  demandLevel: string;
  notification: string;
  recommendedAction: string;
}> {
  try {
    const response = await firstValueFrom(
      this.httpService.get(`${this.AI_BASE_URL}/pre-upload-demand`, {
        params: { category },
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
    console.warn('AI demand service unavailable. Using default values.');

    return {
      predictedDemand: 0,
      demandLevel: 'UNKNOWN',
      notification: '',
      recommendedAction: '',
    };
  }
}

  /**
   * Create Property
   */
  async createProperty(
  merchantId: Types.ObjectId,
  assetPayload: ICreateAssetPayload,
  lang: string,
): Promise<{ message: string; asset: AssetDocument }> {
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

    // ================================
    // 1️⃣ TRANSLATIONS (i18n)
    // ================================
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

    // ================================
    // 2️⃣ MERCHANT VALIDATION
    // ================================
    const merchant = await this.userModel.findById(merchantId).exec();

    if (!merchant || merchant.role !== UserRole.MERCHANT) {
      throw new ForbiddenException(notMerchantError);
    }

    // ================================
    // 3️⃣ REQUIRED FIELD VALIDATION
    // ================================
    if (!category?.trim() || !location?.trim()) {
      throw new BadRequestException(missingFieldsError);
    }

    if (!imageFiles || imageFiles.length === 0) {
      throw new BadRequestException(missingFieldsError);
    }

    const normalizedLocation = location.trim().toLowerCase();

    const finalCategory = await this.findOrCreateCategory(category);

    // ================================
    // 4️⃣ AI IMAGE VALIDATION (FIRST IMAGE)
    // ================================
    const validation = await this.validateImageWithAI(imageFiles[0]);

    if (!validation || validation.status !== 'success') {
      throw new InternalServerErrorException(
        'AI validation service failed.',
      );
    }

    if (validation.allowed_upload === false) {
      throw new BadRequestException({
        message: 'AI detected invalid image. Registration failed.',
        prediction: validation.prediction,
        confidence: validation.confidence,
      });
    }

    // ================================
    // 5️⃣ AI DEMAND PREDICTION
    // ================================
    let demandPrediction;

    try {
      demandPrediction = await this.getPreUploadDemand(finalCategory);
    } catch (error) {
      console.warn(
        'AI demand service unavailable. Using default values.',
      );

      demandPrediction = {
        predictedDemand: 0,
        demandLevel: 'UNKNOWN',
        notification: '',
        recommendedAction: '',
      };
    }

    // ================================
    // 6️⃣ UPLOAD IMAGES TO CLOUDINARY
    // ================================
    let imageUrls: string[] = [];

    try {
      const uploadPromises = imageFiles.map((file) =>
        this.cloudinaryService.uploadImage(file, 'property-images'),
      );

      imageUrls = await Promise.all(uploadPromises);
    } catch (error) {
      throw new InternalServerErrorException(
        'Failed to upload images to Cloudinary.',
      );
    }

    // ================================
    // 7️⃣ CREATE MONGODB DOCUMENT
    // ================================
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

    // Populate merchant data
    const populatedAsset = await newAsset.populate(
      'merchant',
      'fullName email phonenumber businessName accountnumber',
    );

    // ================================
    // 8️⃣ SUCCESS RESPONSE
    // ================================
    return {
      message: successMessage,
      asset: populatedAsset,
    };
  } catch (error) {
    console.error('❌ Property creation error:', error);

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
