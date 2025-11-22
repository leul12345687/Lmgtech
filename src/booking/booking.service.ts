// src/booking/booking.service.ts
import {
  Injectable,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { I18nService } from 'nestjs-i18n';
import { Cron } from '@nestjs/schedule';
import * as moment from 'moment-timezone';
import {
  Booking,
  BookingDocument,
  BookingStatus,
  TimeInterval,
} from './booking.schema';
import { PropertyService } from '../property/property.service';
import { AssetDocument, AssetStatus } from '../property/property.schema';
import {
  differenceInHours,
  differenceInDays,
  differenceInWeeks,
  differenceInMonths,
  differenceInYears,
} from 'date-fns';
import { User, UserDocument, UserRole } from '../schema/user.schema';
import { MailService } from '../notifications/mail.service';
import { SmsService } from '../notifications/sms.service';

@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);
  private readonly ET_TIMEZONE = 'Africa/Addis_Ababa';

  constructor(
    @InjectModel(Booking.name) private readonly bookingModel: Model<BookingDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly propertyService: PropertyService,
    private readonly i18n: I18nService,
    private readonly mailService: MailService,
    private readonly smsService: SmsService,
  ) {}

  // ===================================================
  // CREATE BOOKING
  // Converts submitted dates from Ethiopia TZ → UTC
  // ===================================================
  async createBooking(
    customerId: Types.ObjectId,
    assetName: string,
    merchantEmail: string,
    startDate: string | Date,
    endDate: string | Date,
    timeInterval: TimeInterval,
    numberOfProperty: number,
    securityDeposit: number,
    lang: string,
  ) {
    this.logger.log('📦 [BookingService] createBooking() called');

    if (!customerId || !assetName || !merchantEmail || !startDate || !endDate || !timeInterval || !numberOfProperty) {
      throw new BadRequestException(await this.i18n.translate('booking.ERROR_MISSING_FIELDS', { lang }));
    }

    // Find merchant & customer
    const merchant = await this.userModel.findOne({ email: merchantEmail, role: UserRole.MERCHANT });
    if (!merchant) throw new NotFoundException(await this.i18n.translate('booking.ERROR_MERCHANT_NOT_FOUND', { lang }));
    const customer = await this.userModel.findById(customerId);
    if (!customer) throw new NotFoundException(await this.i18n.translate('booking.ERROR_CUSTOMER_NOT_FOUND', { lang }));

    // Find asset
    const assetModel = this.propertyService['assetModel'] as Model<AssetDocument>;
    const asset = await assetModel.findOne({ name: assetName, merchant: merchant._id }).exec();
    if (!asset) throw new NotFoundException(await this.i18n.translate('booking.ERROR_ASSET_NOT_FOUND', { lang }));
    if (asset.status !== AssetStatus.AVAILABLE) throw new BadRequestException(await this.i18n.translate('booking.ERROR_ASSET_UNAVAILABLE', { lang }));

    // Convert start/end dates to Ethiopia TZ then to UTC
    const startUTC = moment.tz(startDate, this.ET_TIMEZONE).utc().toDate();
    const endUTC = moment.tz(endDate, this.ET_TIMEZONE).utc().toDate();

    // Calculate duration
    const numberOfUnits = this.calculateDuration(startUTC, endUTC, timeInterval, lang);

    // Price
    const priceMap = {
      [TimeInterval.HOUR]: asset.rentalPriceperhour,
      [TimeInterval.DAY]: asset.rentalPriceperday,
      [TimeInterval.WEEK]: asset.rentalPriceperweek,
      [TimeInterval.MONTH]: asset.rentalPricepermonth,
      [TimeInterval.YEAR]: asset.rentalPriceperyear,
    };
    const pricePerUnit = priceMap[timeInterval];
    if (!pricePerUnit) throw new BadRequestException(await this.i18n.translate('booking.ERROR_INVALID_INTERVAL', { lang }));
    const totalPrice = pricePerUnit * numberOfUnits * numberOfProperty;

    // Transaction
    const session = await this.bookingModel.db.startSession();
    session.startTransaction();
    try {
      const overlapping = await this.bookingModel.find({
        asset: asset._id,
        status: { $in: [BookingStatus.CONFIRMED, BookingStatus.PENDING] },
        $or: [{ startDate: { $lte: endUTC }, endDate: { $gte: startUTC } }],
      }).session(session);

      const totalBooked = overlapping.reduce((sum, b) => sum + (b.numberOfProperty || 0), 0);
      const availableUnits = (asset.numberOfProperty || 0) - totalBooked;
      if (availableUnits < numberOfProperty) {
        await session.abortTransaction();
        throw new BadRequestException(await this.i18n.translate('booking.ERROR_NOT_ENOUGH_STOCK', { lang }));
      }

      const booking = await this.bookingModel.create(
        [
          {
            customer: customer._id,
            merchant: merchant._id,
            asset: asset._id,
            startDate: startUTC,
            endDate: endUTC,
            timeInterval,
            numberOfProperty,
            numberOfUnits,
            totalPrice,
            securityDeposit,
            status: BookingStatus.PENDING,
            notifiedEmail: false,
            notifiedSms: false,
            confirmedNotified: false,
          },
        ],
        { session },
      );

      await session.commitTransaction();
      session.endSession();
      const created = booking[0];
      this.logger.log(`✅ Booking created successfully with ID: ${created._id}`);

      // Notify creation
      await this.notifyBookingCreated(created, customer, asset, lang);

      return this.buildBookingSummary(created, customer, merchant, asset, availableUnits - numberOfProperty, pricePerUnit);
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      this.logger.error('Create booking failed', err.stack || err);
      if (err instanceof BadRequestException || err instanceof NotFoundException) throw err;
      throw new InternalServerErrorException(await this.i18n.translate('booking.ERROR_CREATE_BOOKING', { lang }));
    }
  }

  // ===================================================
  // Cancel booking
  // ===================================================
  async cancelBooking(bookingId: string, cancelledBy: string, lang = 'en') {
    if (!Types.ObjectId.isValid(bookingId)) throw new BadRequestException('Invalid booking id');
    const booking = await this.bookingModel.findById(bookingId);
    if (!booking) throw new NotFoundException(await this.i18n.translate('booking.ERROR_BOOKING_NOT_FOUND', { lang }));
    if (booking.status === BookingStatus.CANCELLED) throw new BadRequestException(await this.i18n.translate('booking.ERROR_ALREADY_CANCELLED', { lang }));

    booking.status = BookingStatus.CANCELLED;
    await booking.save();

    // Notify cancellation
    try {
      const pop = await booking.populate<{ customer: UserDocument; merchant: UserDocument; asset: AssetDocument }>('customer merchant asset');
      const customer = pop.customer;
      const merchant = pop.merchant;
      const assetName = pop.asset?.name || 'asset';
      await this.mailService.sendMail(customer.email, await this.i18n.translate('booking.EMAIL_SUBJECT_BOOKING_CANCELLED', { lang }),
        `<p>Hello ${customer.fullName},</p><p>Your booking for <strong>${assetName}</strong> was cancelled.</p>`);
      await this.mailService.sendMail(merchant.email, await this.i18n.translate('booking.EMAIL_SUBJECT_BOOKING_CANCELLED_MERCHANT', { lang }),
        `<p>Booking for <strong>${assetName}</strong> has been cancelled by ${cancelledBy}.</p>`);
      if (customer.phonenumber) await this.smsService.sendSms(customer.phonenumber.toString(), `Your booking for ${assetName} was cancelled.`);
      if (merchant.phonenumber) await this.smsService.sendSms(merchant.phonenumber.toString(), `Booking for ${assetName} was cancelled.`);
    } catch (notifyErr) {
      this.logger.warn('Cancellation notifications failed: ' + notifyErr?.message);
    }

    return { message: await this.i18n.translate('booking.SUCCESS_BOOKING_CANCELLED', { lang }), bookingId };
  }

  // ===================================================
  // Update booking status
  // ===================================================
  async updateBookingStatus(bookingId: string, status: BookingStatus, lang = 'en') {
    if (!Types.ObjectId.isValid(bookingId)) throw new BadRequestException('Invalid booking id');
    const booking = await this.bookingModel.findById(bookingId);
    if (!booking) throw new NotFoundException(await this.i18n.translate('booking.ERROR_BOOKING_NOT_FOUND', { lang }));

    booking.status = status;
    await booking.save();

    if (status === BookingStatus.CONFIRMED && !booking.confirmedNotified) {
      try {
        const pop = await booking.populate<{ customer: UserDocument; asset: AssetDocument }>('customer asset');
        await this.notifyBookingConfirmed(booking, pop.customer, pop.asset, lang);
      } catch (err) {
        this.logger.warn('Failed to send confirmation notification: ' + err?.message);
      }
    }

    return { message: await this.i18n.translate('booking.SUCCESS_STATUS_UPDATED', { lang }), bookingId, status };
  }

  // ===================================================
  // Helper: Duration Calculator
  // ===================================================
  private calculateDuration(startDate: Date, endDate: Date, timeInterval: TimeInterval, lang: string): number {
    switch (timeInterval) {
      case TimeInterval.HOUR: return Math.max(1, differenceInHours(endDate, startDate));
      case TimeInterval.DAY: return Math.max(1, differenceInDays(endDate, startDate));
      case TimeInterval.WEEK: return Math.max(1, differenceInWeeks(endDate, startDate));
      case TimeInterval.MONTH: return Math.max(1, differenceInMonths(endDate, startDate));
      case TimeInterval.YEAR: return Math.max(1, differenceInYears(endDate, startDate));
      default: throw new BadRequestException(this.i18n.translate('booking.ERROR_INVALID_INTERVAL', { lang }));
    }
  }

  // ===================================================
  // CRON → Notify customer + merchant when booking ends
  // ===================================================
  @Cron('*/5 * * * *')
  async checkBookingEnd() {
    const nowET = moment().tz(this.ET_TIMEZONE).toDate();

    const endedBookings = await this.bookingModel
      .find({
        endDate: { $lte: nowET },
        status: BookingStatus.CONFIRMED,
        $or: [{ notifiedEmail: { $ne: true } }, { notifiedSms: { $ne: true } }],
      })
      .populate<{ customer: UserDocument; asset: AssetDocument }>('customer asset');

    this.logger.log(`Cron checkBookingEnd: found ${endedBookings.length} ended bookings at ${nowET.toISOString()}`);

    for (const booking of endedBookings) {
      try {
        const customer = booking.customer;
        const assetName = booking.asset?.name || 'asset';
        const customerEmail = customer?.email;
        const customerPhone = (customer?.phonenumber || '').toString();

        if (!booking.notifiedEmail && customerEmail) {
          try {
            await this.mailService.sendMail(
              customerEmail,
              await this.i18n.translate('booking.EMAIL_SUBJECT_RENTAL_ENDED', { lang: 'en' }),
              `<p>Hello ${customer.fullName},</p><p>Your rental for <strong>${assetName}</strong> has ended. Thank you!</p>`
            );
            booking.notifiedEmail = true;
          } catch (mailErr) {
            this.logger.error(`Email failed for booking ${booking._id}: ${mailErr?.message}`);
          }
        }

        if (!booking.notifiedSms && customerPhone) {
          try {
            await this.smsService.sendSms(customerPhone, `Hello ${customer.fullName}, your rental for ${assetName} has ended. Thank you!`);
            booking.notifiedSms = true;
          } catch (smsErr) {
            this.logger.error(`SMS failed for booking ${booking._id}: ${smsErr?.message}`);
          }
        }

        if (booking.notifiedEmail || booking.notifiedSms) await booking.save();
      } catch (err) {
        this.logger.error(`Failed processing ended booking ${booking._id}: ${err.stack || err}`);
      }
    }
  }

  // ===================================================
  // Helpers for notifications
  // ===================================================
  private async notifyBookingCreated(booking: BookingDocument, customer: UserDocument, asset: AssetDocument, lang: string) {
    const customerPhone = (customer.phonenumber || '').toString();
    try {
      await this.mailService.sendMail(
        customer.email,
        await this.i18n.translate('booking.EMAIL_SUBJECT_BOOKING_CREATED', { lang }),
        `<p>Hello ${customer.fullName},</p><p>Your booking for <strong>${asset.name}</strong> has been created and is pending confirmation.</p>`
      );
      if (customerPhone) await this.smsService.sendSms(customerPhone, `Hi ${customer.fullName}, your booking for ${asset.name} is created (pending).`);
    } catch (err) {
      this.logger.warn('Booking created notification failed: ' + err.message);
    }
  }

  private async notifyBookingConfirmed(booking: BookingDocument, customer: UserDocument, asset: AssetDocument, lang: string) {
    const customerPhone = (customer.phonenumber || '').toString();
    try {
      await this.mailService.sendMail(
        customer.email,
        await this.i18n.translate('booking.EMAIL_SUBJECT_BOOKING_CONFIRMED', { lang }),
        `<p>Hello ${customer.fullName},</p><p>Your booking for <strong>${asset.name}</strong> is confirmed.</p>`
      );
      if (customerPhone) await this.smsService.sendSms(customerPhone, `Your booking for ${asset.name} is confirmed.`);
      booking.confirmedNotified = true;
      await booking.save();
    } catch (err) {
      this.logger.warn('Booking confirmed notification failed: ' + err.message);
    }
  }

  private buildBookingSummary(
    booking: BookingDocument,
    customer: UserDocument,
    merchant: UserDocument,
    asset: AssetDocument,
    availableUnitsAfterBooking: number,
    pricePerUnit: number
  ) {
    return {
      message: `Booking created successfully`,
      bookingSummary: {
        bookingId: booking._id,
        assetName: asset.name,
        merchantName: merchant.businessName || merchant.fullName,
        merchantEmail: merchant.email,
        merchantPhone: merchant.phonenumber,
        customerName: customer.fullName,
        customerEmail: customer.email,
        customerPhone: customer.phonenumber,
        startDate: moment(booking.startDate).tz(this.ET_TIMEZONE).format(),
        endDate: moment(booking.endDate).tz(this.ET_TIMEZONE).format(),
        interval: booking.timeInterval,
        numberOfProperty: booking.numberOfProperty,
        numberOfUnits: booking.numberOfUnits,
        pricePerUnit,
        totalPrice: booking.totalPrice,
        availableUnitsAfterBooking,
        currency: asset.priceUnit,
        securityDeposit: booking.securityDeposit,
        status: booking.status,
        createdBy: customer.email,
      },
    };
  }
}