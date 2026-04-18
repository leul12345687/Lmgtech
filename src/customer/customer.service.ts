// src/customer/customer.service.ts (Consolidated Service - No DTO Imports)

import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { I18nService } from 'nestjs-i18n';
import axios from 'axios';

import { User, UserDocument, UserRole } from '../schema/user.schema';
import { CloudinaryService } from '../cloudinary/cloudinary.service';

// --- INTERFACES (Used internally for type definition) ---
export interface ICustomerRegistrationPayload {
  email: string;
  password?: string;
  fullName: string;
  phonenumber: number;
  acountnumber: number;
  address: string;
  googleId?: string;
  provider?: string;
  googleToken?: string;
  profilePictureUrl?: string;
  profilePictureFile?: Express.Multer.File;
}

export interface ICustomerLoginPayload {
  email?: string;
  password?: string;
  googleId?: string;
  provider?: string;
  googleToken?: string;
}

export interface ICustomerLoginResponse {
  token: string;
  message: string;
  customer: {
    id: string;
    email: string;
    fullName: string;
    phonenumber: number;
    acountnumber: number;
    address: string;
    profilePictureUrl: string;
    role: UserRole;
  };
}

// Internal interface for Admin Update Payload (replaces imported DTO for type safety within service)
interface IAdminUpdatePayload {
  email?: string;
  newPassword?: string;
  fullName?: string;
  phonenumber?: number;
  acountnumber?: number;
  address?: string;
  isActive?: boolean;
  [key: string]: any; // Allow other fields if necessary
}
// -----------------------------------------------------------------

@Injectable()
export class CustomerService {
  private readonly logger = new Logger(CustomerService.name);

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly jwtService: JwtService,
    private readonly i18n: I18nService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  // ===========================================================
  // 🟢 REGISTER CUSTOMER (PUBLIC)
  // ===========================================================
  async register(credentials: ICustomerRegistrationPayload, lang: string): Promise<ICustomerLoginResponse> {
    this.logger.log('📥 [register] called');
    const {
      email,
      password,
      fullName,
      phonenumber,
      acountnumber,
      address,
      googleId,
      provider,
      googleToken,
      profilePictureUrl,
      profilePictureFile,
    } = credentials;

    let resolvedEmail = email;
    let resolvedFullName = fullName;
    let resolvedGoogleId = googleId;
    let resolvedProfilePictureUrl = profilePictureUrl ?? '';
    let resolvedProvider = provider;

    const isGoogleRegistration = !!googleToken || !!googleId;
    if (googleToken) {
      const googleUser = await this.verifyGoogleToken(googleToken, lang);
      resolvedEmail = googleUser.email;
      resolvedFullName = googleUser.fullName;
      resolvedGoogleId = googleUser.googleId;
      resolvedProfilePictureUrl = googleUser.profilePictureUrl;
      resolvedProvider = 'google';
    }

    if (!resolvedEmail || !resolvedFullName || !phonenumber || !acountnumber || !address) {
      const msg = await this.i18n.translate('customer.ERROR_REQUIRED_FIELDS', { lang });
      throw new BadRequestException(msg);
    }

    if (!isGoogleRegistration && !password) {
      const msg = await this.i18n.translate('customer.ERROR_PASSWORD_REQUIRED', { lang });
      throw new BadRequestException(msg);
    }

    const existingUser = await this.userModel.findOne({ email: resolvedEmail }).exec();
    if (existingUser) {
      if (isGoogleRegistration && resolvedGoogleId && existingUser.googleId === resolvedGoogleId) {
        return await this.login({ googleToken, email: resolvedEmail, googleId: resolvedGoogleId, provider: resolvedProvider }, lang);
      }

      const msg = await this.i18n.translate('customer.ERROR_EMAIL_EXISTS', { lang });
      throw new ConflictException(msg);
    }

    const hashedPassword = password ? await bcrypt.hash(password, 10) : undefined;
    let finalProfilePictureUrl = resolvedProfilePictureUrl;

    if (profilePictureFile) {
      try {
        finalProfilePictureUrl = await this.cloudinaryService.uploadImage(profilePictureFile, 'customers');
      } catch (error) {
        this.logger.error('❌ Failed to upload profile picture:', error);
        throw new InternalServerErrorException('Image upload failed.');
      }
    }

    const newCustomer = await this.userModel.create({
      email: resolvedEmail,
      password: hashedPassword,
      fullName: resolvedFullName,
      phonenumber,
      acountnumber,
      address,
      profilePictureUrl: finalProfilePictureUrl,
      googleId: resolvedGoogleId,
      provider: resolvedProvider ?? (isGoogleRegistration ? 'google' : undefined),
      role: UserRole.CUSTOMER,
      isActive: true,
    });

    const token = this.generateToken(newCustomer._id, newCustomer.role);
    const successMsg = await this.i18n.translate('customer.SUCCESS_REGISTER', { lang });

    return {
      token,
      message: successMsg,
      customer: {
        id: newCustomer._id.toString(),
        email: newCustomer.email,
        fullName: newCustomer.fullName,
        phonenumber: newCustomer.phonenumber ?? 0,
        acountnumber: newCustomer.acountnumber ?? 0,
        address: newCustomer.address,
        profilePictureUrl: newCustomer.profilePictureUrl ?? "" ,
        role: newCustomer.role,
      },
    };
  }

  // ===========================================================
  // 🟡 LOGIN CUSTOMER (PUBLIC)
  // ===========================================================
  async login(credentials: ICustomerLoginPayload, lang: string): Promise<ICustomerLoginResponse> {
    this.logger.log('🔑 [login] called');
    const { email: rawEmail, password, googleId: rawGoogleId, provider, googleToken } = credentials;
    let email = rawEmail;
    let googleId = rawGoogleId;
    let resolvedProvider = provider;

    if (googleToken) {
      const googleUser = await this.verifyGoogleToken(googleToken, lang);
      email = googleUser.email;
      googleId = googleUser.googleId;
      resolvedProvider = 'google';
    }

    const isGoogleLogin = !!googleToken || !!googleId;

    const invalidMsg = await this.i18n.translate('customer.ERROR_INVALID_CREDENTIALS', { lang });

    if (!email && !googleId) {
      throw new UnauthorizedException(invalidMsg);
    }

    const query = {
      role: UserRole.CUSTOMER,
      isActive: true,
      $or: [] as any[],
    };

    if (googleId) {
      query.$or.push({ googleId });
    }
    if (email) {
      query.$or.push({ email });
    }

    const customer = await this.userModel.findOne(query).select('+password').exec();

    if (!customer) {
      throw new UnauthorizedException(invalidMsg);
    }

    if (isGoogleLogin) {
      if (!customer.googleId) {
        customer.googleId = googleId;
        customer.provider = resolvedProvider ?? 'google';
      }
    } else {
      if (!password || !customer.password) {
        throw new UnauthorizedException(invalidMsg);
      }
      const isMatch = await bcrypt.compare(password, customer.password);
      if (!isMatch) {
        throw new UnauthorizedException(invalidMsg);
      }
    }

    customer.lastLogin = new Date();
    await customer.save();

    const token = this.generateToken(customer._id, customer.role);
    const successMsg = await this.i18n.translate('customer.SUCCESS_LOGIN', { lang });

    return {
      token,
      message: successMsg,
      customer: {
        id: customer._id.toString(),
        email: customer.email,
        fullName: customer.fullName,phonenumber: customer.phonenumber ?? 0,
        acountnumber: customer.acountnumber ?? 0,
        profilePictureUrl: customer.profilePictureUrl ?? '',
        address: customer.address,
        role: customer.role,
      },
    };
  }

  // ===========================================================
  // 🟣 FIND CUSTOMER BY ID (USED BY GUARDS/PROFILE)
  // ===========================================================
  async findById(id: string): Promise<User | null> {
    try {
      const objectId = new Types.ObjectId(id);
      return await this.userModel.findById(objectId).exec();
    } catch (error) {
      return null;
    }
  }
  
  // ===========================================================
  // 🛑 ADMIN: GET ALL CUSTOMERS
  // ===========================================================
  async findAllCustomers(lang: string) {
    try {
      const customers = await this.userModel
        .find({ role: UserRole.CUSTOMER })
        .select('-password').exec();

      if (!customers.length) {
        const msg = await this.i18n.translate('customer.ERROR_NO_CUSTOMERS_FOUND', { lang });
        throw new NotFoundException(msg);
      }

      return {
        message: await this.i18n.translate('customer.SUCCESS_CUSTOMERS_FETCHED', { lang }),
        totalCustomers: customers.length,
        customers: customers.map(c => ({
          id: c._id.toString(), fullName: c.fullName, email: c.email, phonenumber: c.phonenumber,
          address: c.address, isActive: c.isActive,
        })),
      };
    } catch (error) {
      if (error instanceof NotFoundException) throw error; 
      throw new InternalServerErrorException('Failed to fetch customers.');
    }
  }

  // ===========================================================
  // 🛑 ADMIN: UPDATE CUSTOMER (General Update and Password Reset)
  // ===========================================================
  async updateCustomerByAdmin(customerId: string, updateData: IAdminUpdatePayload, lang: string) {
    try {
      const customerObjectId = new Types.ObjectId(customerId);
      
      // Define allowed fields explicitly as DTO validation is not imported
      const allowedFields = ['fullName', 'email', 'phonenumber', 'acountnumber', 'address', 'isActive', 'newPassword'];
      const filteredUpdate: Record<string, any> = {};

      for (const key of allowedFields) {
        if (updateData[key] !== undefined) {
          if (key !== 'newPassword') {
            filteredUpdate[key] = updateData[key];
          }
        }
      }

      const newPassword = updateData.newPassword;
      if (newPassword) {
        if (typeof newPassword !== 'string' || newPassword.length < 8) {
          const msg = await this.i18n.translate('customer.ERROR_PASSWORD_LENGTH', { lang });
          throw new BadRequestException(msg);
        }
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        filteredUpdate['password'] = hashedPassword;
      }
      
      if (Object.keys(filteredUpdate).length === 0) {
          const msg = await this.i18n.translate('customer.ERROR_NO_VALID_FIELDS', { lang });
          throw new BadRequestException(msg);
      }

      const updatedCustomer = await this.userModel.findByIdAndUpdate(
        customerObjectId,
        { $set: filteredUpdate },
        { new: true }
      ).select('-password');

      if (!updatedCustomer || updatedCustomer.role !== UserRole.CUSTOMER) {
        const msg = await this.i18n.translate('customer.ERROR_CUSTOMER_NOT_FOUND', { lang });
        throw new NotFoundException(msg);
      }

      return {
        message: await this.i18n.translate('customer.SUCCESS_CUSTOMER_UPDATED', { lang }),
        customer: {
          id: updatedCustomer._id.toString(), fullName: updatedCustomer.fullName, email: updatedCustomer.email, isActive: updatedCustomer.isActive,
        },
      };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
          throw error;
      }
      throw new InternalServerErrorException('Failed to update customer profile.');
    }
  }

  // ===========================================================
  // 🛑 ADMIN: DELETE CUSTOMER
  // ===========================================================
  async deleteCustomerByAdmin(customerId: string, lang: string) {
    try {
      const customerObjectId = new Types.ObjectId(customerId);

      const deletedCustomer = await this.userModel.findOneAndDelete({
        _id: customerObjectId, role: UserRole.CUSTOMER,
      }).select('-password');

      if (!deletedCustomer) {
        const msg = await this.i18n.translate('customer.ERROR_CUSTOMER_NOT_FOUND', { lang });
        throw new NotFoundException(msg);
      }
      // TODO: Add logic here to delete related data (e.g., bookings, Cloudinary image)

      return {
        message: await this.i18n.translate('customer.SUCCESS_CUSTOMER_DELETED', { lang }),
        deletedCustomerId: customerId,
      };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException('Failed to delete customer.');
    }
  }

  // ===========================================================
  // ⚙️ PRIVATE: GENERATE TOKEN
  // ===========================================================
  private generateToken(userId: Types.ObjectId, role: UserRole): string {
    const payload = { sub: userId, role };
    return this.jwtService.sign(payload);
  }

  private async verifyGoogleToken(
    idToken: string,
    lang: string,
  ): Promise<{ googleId: string; email: string; fullName: string; profilePictureUrl: string }> {
    const invalidMsg = await this.i18n.translate('customer.ERROR_INVALID_CREDENTIALS', { lang });
    if (!idToken) {
      throw new UnauthorizedException(invalidMsg);
    }

    try {
      const response = await axios.get('https://oauth2.googleapis.com/tokeninfo', {
        params: { id_token: idToken },
      });

      const tokenInfo = response.data as {
        sub?: string;
        email?: string;
        email_verified?: string | boolean;
        name?: string;
        given_name?: string;
        picture?: string;
        aud?: string;
      };

      if (!tokenInfo.sub || !tokenInfo.email) {
        throw new UnauthorizedException(invalidMsg);
      }

      const clientId = process.env.GOOGLE_CLIENT_ID;
      if (clientId && tokenInfo.aud && tokenInfo.aud !== clientId) {
        throw new UnauthorizedException(invalidMsg);
      }

      const emailVerified = tokenInfo.email_verified === true || tokenInfo.email_verified === 'true';
      if (!emailVerified) {
        throw new UnauthorizedException(invalidMsg);
      }

      return {
        googleId: tokenInfo.sub,
        email: tokenInfo.email,
        fullName: tokenInfo.name ?? tokenInfo.given_name ?? tokenInfo.email.split('@')[0],
        profilePictureUrl: tokenInfo.picture ?? '',
      };
    } catch (error) {
      this.logger.warn('Google token verification failed', error as Error);
      throw new UnauthorizedException(invalidMsg);
    }
  }
}