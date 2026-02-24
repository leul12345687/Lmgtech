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
  async validateImageWithAI(
  image: Express.Multer.File,
): Promise<{ allowed: boolean; confidence: number; prediction: string; message: string }> {
  try {
    const formData = new FormData();

    formData.append('file', image.buffer, {
      filename: image.originalname,
      contentType: image.mimetype,
    });

    const response = await firstValueFrom(
      this.httpService.post(
        `${this.AI_BASE_URL}/validate-asset-image`,
        formData,
        {
          headers: {
            ...formData.getHeaders(),
          },
        },
      ),
    );

    const data = response.data;

    return {
      allowed: data.allowed_upload ?? false,
      confidence: data.confidence ?? 0.0,
      prediction: data.prediction ?? 'unknown',
      message: data.message ?? '',
    };
  } catch (error) {
    throw new BadRequestException(
      'Asset image validation failed by AI service.',
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

    const notMerchantError =
      await this.i18n.translate(
        'property.ERROR_NOT_MERCHANT',
        { lang },
      );

    const successMessage =
      await this.i18n.translate(
        'property.SUCCESS_PROPERTY_CREATED',
        { lang },
      );

    const missingFieldsError =
      await this.i18n.translate(
        'property.ERROR_REQUIRED_FIELDS',
        { lang },
      );

    // Validate Merchant
    const merchant = await this.userModel
      .findById(merchantId)
      .exec();

    if (!merchant || merchant.role !== UserRole.MERCHANT) {
      throw new ForbiddenException(notMerchantError);
    }

    // Validate required fields
    if (!category?.trim() || !location?.trim()) {
      throw new BadRequestException(missingFieldsError);
    }

    if (!imageFiles || imageFiles.length === 0) {
      throw new BadRequestException(missingFieldsError);
    }

    const normalizedLocation =
      location.trim().toLowerCase();

    const finalCategory =
      await this.findOrCreateCategory(category);

    // 🔥 1️⃣ AI IMAGE VALIDATION (before upload)
    await this.validateImageWithAI(imageFiles[0]);

    // 🔥 2️⃣ AI DEMAND PREDICTION
    const demandScore =
      await this.getPreUploadDemand(
        finalCategory,
      );

    // 🔥 3️⃣ Upload Images to Cloudinary
    let imageUrls: string[] = [];
    try {
      const uploadPromises = imageFiles.map((file) =>
        this.cloudinaryService.uploadImage(
          file,
          'property-images',
        ),
      );

      imageUrls = await Promise.all(uploadPromises);
    } catch (error) {
      throw new InternalServerErrorException(
        'Failed to upload images to Cloudinary.',
      );
    }

    // 🔥 4️⃣ Create Asset
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
      demandScore,
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
