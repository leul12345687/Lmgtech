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

@Controller('booking')
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  // ===================================================
  //  ✅ Create Booking (Customer Only)
  // ===================================================
  
  @Post('create')
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

    // 🔥 Call booking service
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
  // No authentication needed (webhook is public, verify via secret or IP in production)
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(@Body() payload: any) {
    if (!payload) {
      throw new BadRequestException('Empty webhook payload');
    }

    try {
      // Call the BookingService handler
      const result = await this.bookingService.handleChapaWebhook(payload);
      return result;
    } catch (error) {
      // Log but still respond with 200 OK for webhooks to avoid retries flooding
      return { ok: false, message: error.message || 'Webhook processing failed' };
    }
  }
}
