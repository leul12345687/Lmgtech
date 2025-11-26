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
  @UseGuards(CustomerJwtAuthGuard)
  @Post('create')
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

    // -------------------------------
    // 1) Validate required fields
    // -------------------------------
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

    // Validate enum
    if (!Object.values(TimeInterval).includes(timeInterval)) {
      throw new BadRequestException(`Invalid time interval: ${timeInterval}`);
    }

    // Parse dates
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException('Invalid date format.');
    }

    // -------------------------------
    // 2) Validate JWT → customer ID
    // -------------------------------
    const customerId = req.user?.sub;
    if (!customerId) {
      return {
        statusCode: 401,
        message: 'Unauthorized: missing valid customer token',
      };
    }

    // -------------------------------
    // 3) Create booking via service
    // -------------------------------
    const bookingResult = await this.bookingService.createBookingForPayment(
      new Types.ObjectId(customerId),
      assetName,
      merchantEmail,
      start,
      end,
      timeInterval as TimeInterval,
      Number(numberOfProperty),
      securityDeposit ? Number(securityDeposit) : 0,
      lang || 'en',
    );

    // -------------------------------
    // 4) Unified response
    // -------------------------------
    return {
      statusCode: 201,
      message: bookingResult.message,
    };
  }
}
