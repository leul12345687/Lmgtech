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
import * as sharp from 'sharp'
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

@Post('bookings/:bookingId/payment-proof')
@UseGuards(CustomerJwtAuthGuard)
@UseInterceptors(
  FileInterceptor('paymentProof', {
    storage: memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, callback) => {
      if (!file.mimetype.startsWith('image/')) {
        return callback(
          new BadRequestException('Only image files are allowed'),
          false,
        );
      }
      callback(null, true);
    },
  }),
)
async uploadPaymentProof(
  @Req() req: { user: { sub: string } },
  @Param('bookingId') bookingId: string,
  @UploadedFile() file: Express.Multer.File,
  @Query('lang') lang = 'en',
): Promise<any> {
  this.logger.log(`📤 Uploading payment proof for booking ${bookingId}`);

  if (!Types.ObjectId.isValid(bookingId)) {
    throw new BadRequestException('Invalid booking ID');
  }

  if (!file) {
    throw new BadRequestException('Payment proof image is required');
  }

  const customerId = new Types.ObjectId(req.user.sub);

  // ✅ Let service handle business logic & errors
  return this.customerOpsService.uploadPaymentProof(
    customerId,
    new Types.ObjectId(bookingId),
    file,
    lang,
  );
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