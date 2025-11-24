// ================= CUSTOMER PROFILE SERVICE =================

import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CloudinaryService } from 'src/cloudinary/cloudinary.service';
import { User } from 'src/schema/user.schema';

@Injectable()
export class CustomerOperationsService {
  private readonly logger = new Logger(CustomerOperationsService.name);

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  // =====================================================
  // 1️⃣ GET MY PROFILE
  // =====================================================
  async getMyProfile(customerId: string) {
    if (!Types.ObjectId.isValid(customerId)) {
      throw new BadRequestException('Invalid customer ID.');
    }

    const customer = await this.userModel
      .findById(customerId)
      .select('-password');

    if (!customer) {
      throw new NotFoundException('Customer not found.');
    }

    return {
      id: customer._id,
      fullName: customer.fullName,
      email: customer.email,
      phonenumber: customer.phonenumber,
      address: customer.address,
      profilePictureUrl: customer.profilePictureUrl || null,
    };
  }

  // =====================================================
  // 2️⃣ UPDATE PROFILE
  // =====================================================
  async updateMyProfile(
    customerId: string,
    updateData: any,
    profileImageFile?: Express.Multer.File,
  ) {
    if (!Types.ObjectId.isValid(customerId)) {
      throw new BadRequestException('Invalid customer ID.');
    }

    try {
      this.logger.log('🔹 Update request:', updateData);
      if (profileImageFile) {
        this.logger.log(
          `🔹 Uploaded image: ${profileImageFile.originalname}, size: ${profileImageFile.size}`,
        );
      }

      // Allowed fields only
      const allowedFields = ['fullName', 'email', 'phonenumber', 'address'];
      const filteredUpdate: Record<string, any> = {};

      for (const key of Object.keys(updateData)) {
        const value = updateData[key];

        if (
          allowedFields.includes(key) &&
          value !== undefined &&
          value !== null &&
          value.toString().trim() !== ''
        ) {
          filteredUpdate[key] = value.toString().trim();
        }
      }

      // If image provided -> upload to Cloudinary
      if (profileImageFile) {
        try {
          const url = await this.cloudinaryService.uploadImage(
            profileImageFile,
            'customers',
          );

          filteredUpdate.profilePictureUrl = url;

          this.logger.log('✅ Cloudinary upload success:', url);
        } catch (cloudErr) {
          this.logger.error('❌ Cloudinary upload failed:', cloudErr);
          throw new InternalServerErrorException('Failed to upload image.');
        }
      }

      if (Object.keys(filteredUpdate).length === 0) {
        throw new BadRequestException('No valid fields provided.');
      }

      // Update in DB
      const updatedCustomer = await this.userModel
        .findByIdAndUpdate(customerId, { $set: filteredUpdate }, { new: true })
        .select('-password');

      if (!updatedCustomer) {
        throw new NotFoundException('Customer not found.');
      }

      return {
        message: 'Profile updated successfully.',
        updatedCustomer: {
          id: updatedCustomer._id,
          fullName: updatedCustomer.fullName,
          email: updatedCustomer.email,
          phonenumber: updatedCustomer.phonenumber,
          address: updatedCustomer.address,
          profilePictureUrl: updatedCustomer.profilePictureUrl || null,
        },
      };
    } catch (error) {
      this.logger.error('❌ Profile update error:', error);
      throw new InternalServerErrorException(
        error?.message || 'Failed to update profile.',
      );
    }
  }
}
