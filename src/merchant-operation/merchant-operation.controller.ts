import {
  Controller,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
  InternalServerErrorException,
  UseInterceptors,
  UploadedFile,
  BadRequestException
} from '@nestjs/common';

import { Types } from 'mongoose';
import { MerchantJwtAuthGuard } from '../merchant/merchantAuthGuard';
import { MerchantOperationService } from './merchant-operation.service';

import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { BookingStatus } from '../booking/booking.schema';

@Controller('merchant/operations')
@UseGuards(MerchantJwtAuthGuard)
export class MerchantOperationController {
  constructor(private readonly merchantOpsService: MerchantOperationService) {}

  // =====================================================
  // 1️⃣ GET MERCHANT PROFILE
  // =====================================================
  @Get('profile')
  async getProfile(@Req() req) {
    const merchantId = req.user.sub;  // service expects string

    return await this.merchantOpsService.getMerchantProfile(merchantId);
  }

  // =====================================================
  // 2️⃣ UPDATE PROFILE
  // =====================================================
  @Patch('profile')
  @UseInterceptors(
    FileInterceptor('profilePictureFile', {
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
      limits: { fileSize: 10 * 1024 * 1024 },
    })
  )
  async updateProfile(
    @Req() req,
    @Body() body,
    @UploadedFile() profilePictureFile: Express.Multer.File
  ) {
    try {
      const merchantId = req.user.sub; // service expects string

      return await this.merchantOpsService.updateMerchantProfile(
        merchantId,
        body,
        profilePictureFile
      );
    } catch (error) {
      throw new InternalServerErrorException('Failed to update profile.');
    }
  }

  // =====================================================
  // 3️⃣ GET MERCHANT PROPERTIES
  // =====================================================
  @Get('properties')
  async getMerchantProperties(@Req() req) {
    const merchantId = new Types.ObjectId(req.user.sub);
    const lang = req.query.lang || 'en';

    return await this.merchantOpsService.getMerchantProperties(
      merchantId,
      lang
    );
  }

  // =====================================================
  // 4️⃣ UPDATE PROPERTY
  // =====================================================
  @Patch('properties/:id')
  async updateProperty(@Req() req, @Param('id') id: string, @Body() body) {
    const merchantId = new Types.ObjectId(req.user.sub);
    const lang = req.query.lang || 'en';

    return await this.merchantOpsService.updateProperty(
      merchantId,
      id,
      body,
      lang
    );
  }

  // =====================================================
  // 5️⃣ DELETE PROPERTY
  // =====================================================
  @Delete('properties/:id')
  async deleteProperty(@Req() req, @Param('id') id: string) {
    const merchantId = new Types.ObjectId(req.user.sub);
    const lang = req.query.lang || 'en';

    return await this.merchantOpsService.deleteProperty(
      merchantId,
      id,
      lang
    );
  }

  // =====================================================
  // 6️⃣ GET MERCHANT BOOKINGS
  // =====================================================
  @Get('bookings')
  async getMerchantBookings(@Req() req) {
    const merchantId = new Types.ObjectId(req.user.sub);
    const lang = req.query.lang || 'en';

    return await this.merchantOpsService.getMerchantBookings(
      merchantId,
      lang
    );
  }

  // =====================================================
  // 7️⃣ UPDATE BOOKING STATUS
  // =====================================================
  @Patch('bookings/:id/status')
  async updateBookingStatus(
    @Req() req,
    @Param('id') id: string,
    @Body() body
  ) {
    const merchantId = new Types.ObjectId(req.user.sub);
    const lang = req.query.lang || 'en';

    return await this.merchantOpsService.updateBookingStatus(
      merchantId,
      id,
      body.status as BookingStatus,
      lang
    );
  }

  // =====================================================
  // 8️⃣ DELETE BOOKING
  // =====================================================
  @Delete('bookings/:id')
  async deleteBooking(@Req() req, @Param('id') id: string) {
    const merchantId = new Types.ObjectId(req.user.sub);
    const lang = req.query.lang || 'en';

    return await this.merchantOpsService.deleteBooking(
      merchantId,
      id,
      lang
    );
  }
}
