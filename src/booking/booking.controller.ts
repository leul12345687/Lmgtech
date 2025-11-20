import {
  Controller,
  Post,
  Body,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { BookingService } from './booking.service';
import { TimeInterval } from './booking.schema';
import { CustomerJwtAuthGuard } from 'src/customer/customerAuthGuard';
import { Types } from 'mongoose';

@Controller('booking')
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  // ===================================================
  // ✅ Create Booking (Customer Only)
  // ===================================================
  @UseGuards(CustomerJwtAuthGuard)
  @Post('create')
  @HttpCode(HttpStatus.CREATED)
  async createBooking(@Req() req, @Body() body) {
    try {
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

      // Validate essential fields
      if (
        !assetName ||
        !merchantEmail ||
        !startDate ||
        !endDate ||
        !timeInterval ||
        !numberOfProperty
      ) {
        return {
          statusCode: 400,
          message: 'Missing required booking fields',
        };
      }

      // Extract customer ID from JWT payload
      const customerId = req.user?.sub;
      if (!customerId)
        return {
          statusCode: 401,
          message: 'Unauthorized: missing valid customer token',
        };

      // Call service
      const bookingResult = await this.bookingService.createBooking(
        new Types.ObjectId(customerId),
        assetName,
        merchantEmail,
        new Date(startDate),
        new Date(endDate),
        timeInterval as TimeInterval,
        Number(numberOfProperty),
        securityDeposit ? Number(securityDeposit) : 0,
        lang || 'en',
      );

      return {
        statusCode: 201,
        message: bookingResult.message,
        bookingSummary: bookingResult.bookingSummary,
      };
    } catch (error) {
      console.error('❌ Booking creation error:', error);
      throw error;
    }
  }
}
