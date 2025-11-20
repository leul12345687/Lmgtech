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
} from '@nestjs/common';
import { Types } from 'mongoose';
import { MerchantJwtAuthGuard } from '../merchant/merchantAuthGuard';
import { MerchantOperationService } from './merchant-operation.service';
import { BookingStatus } from '../booking/booking.schema';

@Controller('merchant/operations')
@UseGuards(MerchantJwtAuthGuard)
export class MerchantOperationController {
  constructor(private readonly merchantOpsService: MerchantOperationService) {}

  // 1️⃣ Get all bookings for merchant
  @Get('bookings')
  async getMerchantBookings(@Req() req) {
    const merchantId = new Types.ObjectId(req.user.sub);
    const lang = req.query.lang || 'en';
    return await this.merchantOpsService.getMerchantBookings(merchantId, lang);
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
