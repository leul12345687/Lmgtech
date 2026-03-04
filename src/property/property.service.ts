import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  ForbiddenException,NotFoundException
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { I18nService } from 'nestjs-i18n';

import { AiService } from '../ai/ai.service';
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
  constructor(
    @InjectModel(Asset.name)
    private readonly assetModel: Model<AssetDocument>,

    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,

    private readonly aiService: AiService,
    private readonly i18n: I18nService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  // =========================================================
  // CATEGORY NORMALIZATION
  // =========================================================
  private async findOrCreateCategory(inputCategory: string): Promise<string> {
    const normalized = inputCategory.trim().toLowerCase();

    const existingCategory = await this.assetModel.findOne({
      category: { $regex: new RegExp(`^${normalized}$`, 'i') },
    });

    return existingCategory ? existingCategory.category : normalized;
  }

  // =========================================================
  // CATEGORY SEARCH
  // =========================================================
  async searchCategories(query: string): Promise<string[]> {
    if (!query?.trim()) return [];

    return this.assetModel.distinct('category', {
      category: { $regex: new RegExp(query.trim(), 'i') },
    });
  }

  // =========================================================
  // CREATE PROPERTY
  // =========================================================
  async createProperty(
    merchantId: Types.ObjectId,
    assetPayload: ICreateAssetPayload,
    lang: string,
  ) {
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

    // ==============================
    // TRANSLATIONS
    // ==============================
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

    // ==============================
    // MERCHANT VALIDATION
    // ==============================
    const merchant = await this.userModel.findById(merchantId);

    if (!merchant || merchant.role !== UserRole.MERCHANT) {
      throw new ForbiddenException(notMerchantError);
    }

    // ==============================
    // REQUIRED FIELD VALIDATION
    // ==============================
    if (!category?.trim() || !location?.trim()) {
      throw new BadRequestException(missingFieldsError);
    }

    if (!imageFiles?.length) {
      throw new BadRequestException(missingFieldsError);
    }

    const normalizedLocation = location.trim().toLowerCase();
    const finalCategory = await this.findOrCreateCategory(category);

    // ==============================
    // AI IMAGE VALIDATION
    // ==============================
    let validation;
    try {
      validation = await this.aiService.validateImage(imageFiles[0]);
    } catch (error) {
      throw new InternalServerErrorException(
        'AI image validation service unavailable.',
      );
    }

    if (!validation || validation.status !== 'success') {
      throw new InternalServerErrorException(
        'AI validation failed unexpectedly.',
      );
    }

    if (validation.allowed_upload === false) {
      throw new BadRequestException({
        message: 'AI detected invalid image.',
        prediction: validation.prediction,
        confidence: validation.confidence,
      });
    }

    // ==============================
    // AI DEMAND PREDICTION (SAFE)
    // ==============================
    let demandPrediction = {
      predictedDemand: 0,
      demandLevel: 'UNKNOWN',
      notification: '',
      recommendedAction: '',
    };

    try {
      demandPrediction = await this.aiService.getDemand(finalCategory);
    } catch {
      // Do NOT block property creation if demand fails
      console.warn('AI demand service unavailable. Using fallback.');
    }

    // ==============================
    // CLOUDINARY UPLOAD
    // ==============================
    let imageUrls: string[];

    try {
      const uploads = imageFiles.map((file) =>
        this.cloudinaryService.uploadImage(file, 'property-images'),
      );

      imageUrls = await Promise.all(uploads);
    } catch {
      throw new InternalServerErrorException(
        'Image upload failed.',
      );
    }

    // ==============================
    // CREATE DATABASE RECORD
    // ==============================
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
      demandInfo: demandPrediction,
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
