import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { I18nService } from 'nestjs-i18n';

import { User, UserDocument, UserRole } from '../schema/user.schema';
import { CloudinaryService } from '../cloudinary/cloudinary.service';

export interface IMerchantRegistrationPayload {
  email: string;
  password: string;
  fullName: string;
  phonenumber: number;
  acountnumber: number;
  businessName: string;
  address: string;
  profilePictureFile?: Express.Multer.File;
}

export interface IMerchantLoginPayload {
  email: string;
  password: string;
}

export interface IMerchantLoginResponse {
  token: string;
  message: string;
  merchant: {
    id: string;
    email: string;
    fullName: string;
    phonenumber: number;
    acountnumber: number;
    businessName: string;
    address: string;
    profilePictureUrl: string;
    role: UserRole;
  };
}

@Injectable()
export class MerchantService {
  private readonly logger = new Logger(MerchantService.name);

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly jwtService: JwtService,
    private readonly i18n: I18nService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  // ===========================================================
  // 🟢 REGISTER MERCHANT
  // ===========================================================
  async register(
    credentials: IMerchantRegistrationPayload,
    lang: string,
  ): Promise<IMerchantLoginResponse> {
    console.log('📥 [MerchantService.register] called with:', credentials);

    const {
      email,
      password,
      fullName,
      phonenumber,
      acountnumber,
      businessName,
      address,
      profilePictureFile,
    } = credentials;

    if (!email || !password || !fullName || !phonenumber || !acountnumber || !businessName || !address) {
      const msg = await this.i18n.translate('merchant.ERROR_REQUIRED_FIELDS', { lang });
      console.error('❌ Missing required fields for merchant registration');
      throw new BadRequestException(msg);
    }

    const existingUser = await this.userModel.findOne({ email }).exec();
    if (existingUser) {
      const msg = await this.i18n.translate('merchant.ERROR_EMAIL_EXISTS', { lang });
      console.warn(`⚠️ Merchant already exists for email: ${email}`);
      throw new ConflictException(msg);
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    let profilePictureUrl = '';
    if (profilePictureFile) {
      try {
        console.log('📸 Uploading merchant profile picture...');
        profilePictureUrl = await this.cloudinaryService.uploadImage(profilePictureFile, 'merchants');
        console.log('✅ Uploaded image URL:', profilePictureUrl);
      } catch (error) {
        console.error('❌ Failed to upload image:', error);
        throw new InternalServerErrorException('Image upload failed.');
      }
    }

    const newMerchant = await this.userModel.create({
      email,
      password: hashedPassword,
      fullName,
      phonenumber,
      acountnumber,
      businessName,
      address,
      profilePictureUrl,
      role: UserRole.MERCHANT,
      isActive: true,
    });

    console.log('✅ Merchant created:', newMerchant.email);

    const token = this.generateToken(newMerchant._id, newMerchant.role);
    const successMsg = await this.i18n.translate('merchant.SUCCESS_REGISTER', { lang });

    return {
      token,
      message: successMsg,
      merchant: {
        id: newMerchant._id.toString(),
        email: newMerchant.email,
        fullName: newMerchant.fullName,
        phonenumber: newMerchant.phonenumber,
        acountnumber: newMerchant.acountnumber,
        businessName: newMerchant.businessName,
        address: newMerchant.address,
        profilePictureUrl: newMerchant.profilePictureUrl,
        role: newMerchant.role,
      },
    };
  }

  // ===========================================================
  // 🟡 LOGIN MERCHANT
  // ===========================================================
  async login(
    credentials: IMerchantLoginPayload,
    lang: string,
  ): Promise<IMerchantLoginResponse> {
    console.log('🔑 [MerchantService.login] called with:', credentials);

    const { email, password } = credentials;

    const merchant = await this.userModel
      .findOne({ email, role: UserRole.MERCHANT, isActive: true })
      .select('+password')
      .exec();

    const invalidMsg = await this.i18n.translate('merchant.ERROR_INVALID_CREDENTIALS', { lang });
    const inactiveMsg = await this.i18n.translate('merchant.ERROR_INACTIVE_ACCOUNT', { lang });
    const successMsg = await this.i18n.translate('merchant.SUCCESS_LOGIN', { lang });

    if (!merchant || !merchant.password) {
      console.warn(`⚠️ No active merchant found for email: ${email}`);
      throw new UnauthorizedException(inactiveMsg);
    }

    const isMatch = await bcrypt.compare(password, merchant.password);
    if (!isMatch) {
      console.warn(`⚠️ Invalid password for merchant: ${email}`);
      throw new UnauthorizedException(invalidMsg);
    }

    merchant.lastLogin = new Date();
    await merchant.save();

    console.log('✅ Merchant login successful:', email);

    const token = this.generateToken(merchant._id, merchant.role);

    return {
      token,
      message: successMsg,
      merchant: {
        id: merchant._id.toString(),
        email: merchant.email,
        fullName: merchant.fullName,
        phonenumber: merchant.phonenumber,
        acountnumber: merchant.acountnumber,
        businessName: merchant.businessName,
        address: merchant.address,
        profilePictureUrl: merchant.profilePictureUrl,
        role: merchant.role,
      },
    };
  }

  // ===========================================================
  // 🔵 FETCH ALL MERCHANTS
  // ===========================================================
  async findAll(): Promise<User[]> {
    console.log('📡 [MerchantService.findAll] Fetching all merchants...');
    const merchants = await this.userModel.find({ role: UserRole.MERCHANT }).exec();
    console.log(`✅ Found ${merchants.length} merchants`);
    return merchants;
  }

  // ===========================================================
  // 🟣 FETCH MERCHANT BY ID
  // ===========================================================
  async findById(id: string): Promise<User> {
    console.log('📡 [MerchantService.findById] Fetching merchant ID:', id);
    const merchant = await this.userModel.findById(new Types.ObjectId(id)).exec();
    if (!merchant) {
      console.error('❌ Merchant not found with ID:', id);
      throw new NotFoundException('Merchant not found.');
    }
    console.log('✅ Merchant found:', merchant.email);
    return merchant;
  }

  // ===========================================================
  // ⚙️ PRIVATE: GENERATE TOKEN
  // ===========================================================
  private generateToken(userId: Types.ObjectId, role: UserRole): string {
    const payload = { sub: userId, role };
    return this.jwtService.sign(payload);
  }
   // ===========================================================
  // 🟠 UPDATE MERCHANT (Admin only)
  // ===========================================================
  async updateMerchant(
    id: string,
    updateData: any,
    file?: Express.Multer.File,
    lang?: string,
  ) {
    this.logger.log(`✏️ Updating merchant: ${id}`);

    const merchant = await this.userModel.findById(id).exec();
    if (!merchant) throw new NotFoundException('Merchant not found.');

    if (file) {
      this.logger.log('☁️ Uploading new profile picture to Cloudinary...');
      const newUrl = await this.cloudinaryService.uploadImage(
        file,
        'merchants',
      );
      updateData.profilePictureUrl = newUrl;
    }

    Object.assign(merchant, updateData);
    await merchant.save();

    this.logger.log(`✅ Merchant updated: ${merchant.email}`);
    return { message: 'Merchant updated successfully', merchant };
  }

  // ===========================================================
  // 🔴 DELETE MERCHANT (Admin only)
  // ===========================================================
  async deleteMerchant(id: string) {
    this.logger.log(`🗑️ Deleting merchant ID: ${id}`);

    const result = await this.userModel.findByIdAndDelete(id).exec();
    if (!result) throw new NotFoundException('Merchant not found.');

    this.logger.log(`✅ Merchant deleted: ${result.email}`);
    return { message: 'Merchant deleted successfully', deleted: result };
  }
}
