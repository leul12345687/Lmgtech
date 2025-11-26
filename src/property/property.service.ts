import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  ForbiddenException,NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { I18nService } from 'nestjs-i18n';
import { Asset, AssetDocument, AssetCategory, AssetStatus } from './property.schema';
import { User, UserDocument, UserRole } from '../schema/user.schema';
import { CloudinaryService } from '../cloudinary/cloudinary.service';

export interface ICreateAssetPayload {
  name: string;
  description: string;
  customCategory?: string; // ✅ Added '?' to make it optional
  category: AssetCategory;
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
    @InjectModel(Asset.name) private readonly assetModel: Model<AssetDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly i18n: I18nService,
    private readonly cloudinaryService: CloudinaryService, // ✅ Now globally available
  ) {}

  /**
   * Creates a new property (asset) for a merchant.
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
      rentalPriceperday,
      rentalPriceperhour,
      rentalPriceperweek,
      rentalPricepermonth,
      rentalPriceperyear,
      numberOfProperty,
      customCategory,
      imageFiles,
    } = assetPayload;

    // 🧩 Translations
    const missingFieldsError = await this.i18n.translate('property.ERROR_REQUIRED_FIELDS', { lang });
    const successMessage = await this.i18n.translate('property.SUCCESS_PROPERTY_CREATED', { lang });
    const notMerchantError = await this.i18n.translate('property.ERROR_NOT_MERCHANT', { lang });

    //1,🔍 Validate merchant role
    const merchant = await this.userModel.findById(merchantId).exec();
    if (!merchant || merchant.role !== UserRole.MERCHANT) {
      throw new ForbiddenException(notMerchantError);
    }
// 2. Validate "Other" Category Logic
  if (category === AssetCategory.OTHER && (!customCategory || customCategory.trim() === '')) {
    throw new BadRequestException(
      await this.i18n.translate('property.ERROR_SPECIFY_OTHER_CATEGORY', { lang })
    );
  }

  // 3. Image Validation
  if (!imageFiles || imageFiles.length === 0) {
    throw new BadRequestException(
      await this.i18n.translate('property.ERROR_REQUIRED_FIELDS', { lang })
    );
  }

  // 4. Optimized Parallel Uploads
  // Promise.all is much faster than a for-loop for multiple images
  let imageUrls: string[] = [];
  try {
    const uploadPromises = imageFiles.map((file) =>
      this.cloudinaryService.uploadImage(file, 'property-images'),
    );
    imageUrls = await Promise.all(uploadPromises);
  } catch (error) {
    
    throw new InternalServerErrorException('Failed to upload images to Cloudinary.');
  }
    // 💾 Create the asset record
    const newAsset = new this.assetModel({
      merchant: merchantId,
      name,
      description,
      category,
      rentalPriceperday,
      rentalPriceperhour,
      rentalPriceperweek,
      rentalPricepermonth,
      rentalPriceperyear,
      numberOfProperty,
      imageUrls,
      status: AssetStatus.AVAILABLE,
    });

    await newAsset.save();

    // 👤 Populate merchant info before returning
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
