// src/customer-operations/operation-customer.controller.ts
import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Req,Delete,
  UseGuards,
  InternalServerErrorException,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { CustomerOperationsService } from './operation-customer.service';
import { CustomerJwtAuthGuard } from '../customer/customerAuthGuard';
import { ManagerJwtAuthGuard } from 'src/admin/AdminAuthguard';
@Controller('customer')

export class CustomerOperationsController {
  private readonly logger = new Logger(CustomerOperationsController.name);

  constructor(private readonly customerOpsService: CustomerOperationsService) {}

  // ===========================================================
  // 1️⃣ GET PROPERTIES BY CATEGORY
  // ===========================================================
  @Get('properties')
  async getPropertiesByCategory(@Query('category') category: string, @Req() req) {
    try {
      const lang = req.query.lang || 'en';
      return await this.customerOpsService.getPropertiesByCategory(category, lang);
    } catch (error) {
      this.logger.error('❌ Error fetching properties by category:', error);
      throw new InternalServerErrorException('Failed to fetch properties.');
    }
  }

  // ===========================================================
  // 2️⃣ GET BOOKINGS OF LOGGED-IN CUSTOMER
  // ===========================================================
  @Get('bookings')
  @UseGuards(CustomerJwtAuthGuard)
  async getMyBookings(@Req() req) {
    try {
      const lang = req.query.lang || 'en';
      const customerId = new Types.ObjectId(req.user.sub);
      return await this.customerOpsService.getMyBookings(customerId, lang);
    } catch (error) {
      this.logger.error('❌ Error fetching customer bookings:', error);
      throw new InternalServerErrorException('Failed to fetch bookings.');
    }
  }

  

  // ===========================================================
  // 4️⃣ UPLOAD PAYMENT PROOF (Cloudinary handled in service)
  // ===========================================================
  @Post('bookings/:bookingId/payment-proof')
  @UseGuards(CustomerJwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('paymentProof', {
      storage: memoryStorage(),
      fileFilter: (req, file, callback) => {
        if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/i)) {
          return callback(
            new BadRequestException('Only image files are allowed!'),
            false,
          );
        }
        callback(null, true);
      },
      limits: { fileSize: 10 * 1024 * 1024 }, // Max 10MB
    }),
  )
  async uploadPaymentProof(
    @Req() req,
    @Param('bookingId') bookingId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    this.logger.log('📤 Uploading payment proof...');
    const lang = req.query.lang || 'en';

    try {
      if (!file) {
        throw new BadRequestException('Payment proof image is required.');
      }

      const customerId = new Types.ObjectId(req.user.sub);

      // ✅ Pass file directly — Cloudinary handled in service
      return await this.customerOpsService.uploadPaymentProof(
        customerId,
        new Types.ObjectId(bookingId),
        file,
        lang,
      );
    } catch (error) {
      this.logger.error('❌ Error uploading payment proof:', error);
      throw new InternalServerErrorException('Failed to upload payment proof.');
    }
  }
  @Get('profile')
  @UseGuards(CustomerJwtAuthGuard)
  async getMyProfile(@Req() req) {
    try {
      const customerId = req.user.sub; // Already a string
      return await this.customerOpsService.getMyProfile(customerId);
    } catch (error) {
      throw new InternalServerErrorException('Failed to fetch profile.');
    }
  }

  // ===========================================================
  // 2️⃣ UPDATE MY PROFILE
  // ===========================================================
  @Patch('profile')
  @UseGuards(CustomerJwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('profileImage', {
      storage: memoryStorage(),
      fileFilter: (req, file, callback) => {
        if (!file.originalname.match(/\.(jpg|jpeg|png)$/i)) {
          return callback(
            new BadRequestException('Only JPG, JPEG, or PNG images are allowed!'),
            false,
          );
        }
        callback(null, true);
      },
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    }),
  )
  async updateMyProfile(
    @Req() req,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: any,
  ) {
    try {
      const customerId = req.user.sub; // Already a string
      return await this.customerOpsService.updateMyProfile(customerId, body, file);
    } catch (error) {
      console.error('❌ Error updating profile:', error);
      throw new InternalServerErrorException('Failed to update profile.');
    }
  }
// ===========================================================
// 3️⃣ GET ALL BOOKINGS (VISIBLE TO ALL CUSTOMERS)
// ===========================================================
@Get('bookings/all')
@UseGuards(ManagerJwtAuthGuard)
async getAllBookings(@Req() req) {
  try {
    const lang = req.query.lang || 'en';
    return await this.customerOpsService.getAllBookings(lang);
  } catch (error) {
    this.logger.error('❌ Error fetching all bookings:', error);
    throw new InternalServerErrorException('Failed to fetch all bookings.');
  }
}

// ===========================================================
// 5️⃣ UPDATE A BOOKING (BY MANAGER)
// ===========================================================
@Patch('bookings/:bookingId')
@UseGuards(ManagerJwtAuthGuard)
async updateBookingByManager(
  @Req() req,
  @Param('bookingId') bookingId: string,
  @Body() updateData: any,
) {
  try {
    const lang = req.query.lang || 'en';
    return await this.customerOpsService.updateBookingByManager(
      bookingId,
      updateData,
      lang,
    );
  } catch (error) {
    this.logger.error('❌ Error updating booking by manager:', error);
    throw new InternalServerErrorException('Failed to update booking.');
  }
}

// ===========================================================
// 6️⃣ DELETE A BOOKING (BY MANAGER)
// ===========================================================
@Delete('bookings/:bookingId')
@UseGuards(ManagerJwtAuthGuard)
async deleteBookingByManager(
  @Req() req,
  @Param('bookingId') bookingId: string,
) {
  try {
    const lang = req.query.lang || 'en';
    return await this.customerOpsService.deleteBookingByManager(
      bookingId,
      lang,
    );
  } catch (error) {
    this.logger.error('❌ Error deleting booking by manager:', error);
    throw new InternalServerErrorException('Failed to delete booking.');
  }
}
}