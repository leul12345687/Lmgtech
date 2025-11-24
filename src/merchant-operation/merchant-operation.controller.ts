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
  UploadedFile,BadRequestException
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

  

  @Get('profile')
  async getProfile(@Req() req) {
    const merchantId = new Types.ObjectId(req.user.sub);
    const lang = req.query.lang || 'en';
    return await this.merchantOpsService.getMerchantProfile(merchantId, lang);
  }
  // ===========================================================
// 2️⃣ UPDATE MERCHANT PROFILE (WITH IMAGE UPLOAD)
// ===========================================================
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
    limits: { fileSize: 10 * 1024 * 1024 }, // Max 10MB
  }),
)
async updateProfile(
  @Req() req,
  @Body() body,
  @UploadedFile() profilePictureFile: Express.Multer.File,
) {
  const lang = req.query.lang || 'en';

  try {
    const merchantId = new Types.ObjectId(req.user.sub);

    return await this.merchantOpsService.updateMerchantProfile(
      merchantId,
      body,
      profilePictureFile, // ← Cloudinary is handled in service
      lang,
    );
  } catch (error) {
    console.error('❌ Error updating merchant profile:', error);
    throw new InternalServerErrorException('Failed to update profile.');
  }
}

  // 2️⃣ Get all properties for merchant
  @Get('properties')
  async getMerchantProperties(@Req() req) {
    const merchantId = new Types.ObjectId(req.user.sub);
    const lang = req.query.lang || 'en';
    return await this.merchantOpsService.getMerchantProperties(merchantId, lang);
  }

  // 3️⃣ Update property
  @Patch('properties/:id')
  async updateProperty(@Req() req, @Param('id') id: string, @Body() body) {
    const merchantId = new Types.ObjectId(req.user.sub);
    const lang = req.query.lang || 'en';
    return await this.merchantOpsService.updateProperty(merchantId, id, body, lang);
  }

  // 4️⃣ Delete property
  @Delete('properties/:id')
  async deleteProperty(@Req() req, @Param('id') id: string) {
    const merchantId = new Types.ObjectId(req.user.sub);
    const lang = req.query.lang || 'en';
    return await this.merchantOpsService.deleteProperty(merchantId, id, lang);
  }
// 1️⃣ Get all bookings for merchant
  @Get('bookings')
  async getMerchantBookings(@Req() req) {
    const merchantId = new Types.ObjectId(req.user.sub);
    const lang = req.query.lang || 'en';
    return await this.merchantOpsService.getMerchantBookings(merchantId, lang);
  }
  // 5️⃣ Update booking status
  @Patch('bookings/:id/status')
  async updateBookingStatus(@Req() req, @Param('id') id: string, @Body() body) {
    const merchantId = new Types.ObjectId(req.user.sub);
    const lang = req.query.lang || 'en';
    const { status } = body;
    return await this.merchantOpsService.updateBookingStatus(
      merchantId,
      id,
      status as BookingStatus,
      lang,
    );
  }

  // 6️⃣ Delete booking
  @Delete('bookings/:id')
  async deleteBooking(@Req() req, @Param('id') id: string) {
    const merchantId = new Types.ObjectId(req.user.sub);
    const lang = req.query.lang || 'en';
    return await this.merchantOpsService.deleteBooking(merchantId, id, lang);
  }
}
