import {
  Controller,
  Post,
  Body,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { BookingService } from './booking.service';
import { TimeInterval } from './booking.schema';
import { CustomerJwtAuthGuard } from 'src/customer/customerAuthGuard';
import { Types } from 'mongoose';

@Controller()
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  // ===================================================
  //  ✅ Create Booking (Customer Only)
  // ===================================================
  @Post('booking/create')
  @UseGuards(CustomerJwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async createBooking(@Req() req, @Body() body) {
    const {
      assetName,
      merchantEmail,
      startDate,
      endDate,
      timeInterval,
      numberOfProperty,
      securityDeposit,
      lang,
    } = body;

    if (
      !assetName ||
      !merchantEmail ||
      !startDate ||
      !endDate ||
      !timeInterval ||
      !numberOfProperty
    ) {
      throw new BadRequestException('Missing required booking fields.');
    }

    if (!Object.values(TimeInterval).includes(timeInterval)) {
      throw new BadRequestException(`Invalid time interval: ${timeInterval}`);
    }

    const customerId = req.user?.sub;
    if (!customerId) {
      throw new BadRequestException('Unauthorized');
    }

    const bookingResult = await this.bookingService.createBookingForPayment(
      new Types.ObjectId(customerId),
      assetName,
      merchantEmail,
      startDate,
      endDate,
      timeInterval,
      Number(numberOfProperty),
      securityDeposit ? Number(securityDeposit) : 0,
      lang || 'en',
    );

    return bookingResult;
  }

  // ===================================================
  //  🔔 Bank / Chapa Webhook Endpoint
  // ===================================================
  // PUBLIC endpoint for Chapa webhook
  @Post('/chapa/webhook')
  @HttpCode(HttpStatus.OK)
  async handleChapaWebhook(@Body() payload: any) {
    if (!payload) {
      return { ok: true };
    }

    try {
      await this.bookingService.handleChapaWebhook(payload); // Only payload, no req
      return { ok: true };
    } catch (error) {
      console.error('❌ Webhook processing error:', error?.message || error);
      return { ok: false };
    }
  }
}
