import { 
  Injectable, 
  UnauthorizedException, 
  ConflictException,
  BadRequestException
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
// 🌟 NEW: Import I18nService
import { I18nService } from 'nestjs-i18n'; 

import { 
  UserRole, 
  User, 
  UserDocument 
} from '../schema/user.schema'; 

// Define the expected return structure for successful login
export interface IAdminLoginResponse {
    accessToken: string;
    message: string;
    admin: {
        id: string; // Changed to string for API response
        email: string;
        fullName: string;
        phonenumber: number;
        address: string;
        role: UserRole;
    };
}

// Define the required fields for admin authentication operations
interface IAdminCredentials {
    email: string;
    password: string;
    fullName?: string;
    phonenumber?: number;
    address?: string | number;
}

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private jwtService: JwtService,
    // 🌟 NEW: Inject the I18nService
    private readonly i18n: I18nService,
  ) {}

  // ==========================================================
  // REGISTER 
  // 💥 UPDATED: Accepts 'lang' parameter
  // ==========================================================
  async registerAdmin(credentials: IAdminCredentials, lang: string): Promise<User> {
        const { email, password, fullName,phonenumber,address } = credentials;
        
        // Basic validation - using translated error message
        const requiredFieldsError = await this.i18n.translate('admin.ERROR_REG_REQUIRED_FIELDS', { lang });
        if (!email || !password || !fullName || !phonenumber || !address) {
            throw new BadRequestException(requiredFieldsError);
        }

        // Check for existing user (Admin or any other role) - using translated error message
        const emailExistsError = await this.i18n.translate('admin.ERROR_EMAIL_EXISTS', { lang });
        const existingUser = await this.userModel.findOne({ email }).exec();
        if (existingUser) {
          throw new ConflictException(emailExistsError);
        }

        // Hash Password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create Admin User Document
        const newAdmin = await this.userModel.create({
          email,
          password: hashedPassword,
          fullName,
          phonenumber,address,
          role: UserRole.ADMIN, // Assign the ADMIN role
          isActive: true, 
        });

        return newAdmin;
  }

  // ==========================================================
  // LOGIN 
  // 💥 UPDATED: Accepts 'lang' parameter and uses translations
  // ==========================================================
  async login(credentials: IAdminCredentials, lang: string): Promise<IAdminLoginResponse> {
    const { email, password } = credentials;
    const invalidCredsOrInactive = await this.i18n.translate('admin.ERROR_INVALID_CREDENTIALS_INACTIVE', { lang });
    const invalidCredentials = await this.i18n.translate('admin.ERROR_INVALID_CREDENTIALS', { lang });
    const successLogin = await this.i18n.translate('admin.SUCCESS_LOGIN', { lang });


    // 1. Retrieve user, explicitly filtering for the ADMIN role
    const admin = await this.userModel
      .findOne({ email, role: UserRole.ADMIN, isActive: true }) 
      .select('+password') 
      .exec();

    if (!admin || !admin.password) {
      throw new UnauthorizedException(invalidCredsOrInactive);
    }

    // 2. Compare Passwords
    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      throw new UnauthorizedException(invalidCredentials);
    }
    
    // 3. Update last login time
    admin.lastLogin = new Date();
    await admin.save();

    // 4. Generate JWT
    const payload = { sub: admin._id, email: admin.email,role: admin.role};
    const accessToken = await this.jwtService.signAsync(payload);

    // 5. Structure and return the successful response
    return { accessToken,
        
        // 🌟 Translated success message
        message: successLogin, 
        admin: {
            id: (admin._id as Types.ObjectId).toString(), 
            email: admin.email,
            fullName: admin.fullName,
            phonenumber: admin.phonenumber,
            address: admin.address,
            role: admin.role
        }
    };
  }
  
  // ==========================================================
  // HELPER - Code remains the same
  // ==========================================================
  private generateToken(userId: Types.ObjectId, role: UserRole): string {
    const payload = { 
      sub: userId, 
      role: role 
    };
    return this.jwtService.sign(payload);
  }

  
   async findById(id: string): Promise<User | null> {
      console.log(`Finding manager with ID: ${id}`);
      try {
          const objectId = new Types.ObjectId(id);
          return this.userModel.findById(objectId).exec();
      } catch (error) {
          console.error('Error converting ID to ObjectId:', error);
          return null;
      }
  }
}
