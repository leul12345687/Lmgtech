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
import moment from 'moment-timezone';
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
  // Converts submitted dates from Ethiopia TZ → UTC (store UTC)
  // Notifies customer + merchant after creation
  // Returns booking summary with ET-formatted dates
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
    lang = 'en',
  ) {
    this.logger.log('📦 [BookingService] createBooking() called');

    // basic validation
    if (!customerId || !assetName || !merchantEmail || !startDate || !endDate || !timeInterval || !numberOfProperty) {
      throw new BadRequestException(await this.i18n.translate('booking.ERROR_MISSING_FIELDS', { lang }));
    }

    // find merchant & customer
    const merchant = await this.userModel.findOne({ email: merchantEmail, role: UserRole.MERCHANT });
    if (!merchant) throw new NotFoundException(await this.i18n.translate('booking.ERROR_MERCHANT_NOT_FOUND', { lang }));

    const customer = await this.userModel.findById(customerId);
    if (!customer) throw new NotFoundException(await this.i18n.translate('booking.ERROR_CUSTOMER_NOT_FOUND', { lang }));

    // find asset (through PropertyService's assetModel)
    const assetModel = this.propertyService['assetModel'] as Model<AssetDocument>;
    const asset = await assetModel.findOne({ name: assetName, merchant: merchant._id }).exec();
    if (!asset) throw new NotFoundException(await this.i18n.translate('booking.ERROR_ASSET_NOT_FOUND', { lang }));
    if (asset.status !== AssetStatus.AVAILABLE) throw new BadRequestException(await this.i18n.translate('booking.ERROR_ASSET_UNAVAILABLE', { lang }));

    // Convert start/end dates from Ethiopia timezone into UTC Date objects
    // Input is assumed to be the local ET time selected by user
    let startUTC: Date;
    let endUTC: Date;
    try {
      startUTC = moment.tz(startDate as any, this.ET_TIMEZONE).utc().toDate();
      endUTC = moment.tz(endDate as any, this.ET_TIMEZONE).utc().toDate();
    } catch (e) {
      throw new BadRequestException(await this.i18n.translate('booking.ERROR_INVALID_DATE', { lang }));
    }

    // Calculate number of units (duration)
    const numberOfUnits = this.calculateDuration(startUTC, endUTC, timeInterval, lang);

    // price lookup
    const priceMap: Record<TimeInterval, number | undefined> = {
      [TimeInterval.HOUR]: asset.rentalPriceperhour,
      [TimeInterval.DAY]: asset.rentalPriceperday,
      [TimeInterval.WEEK]: asset.rentalPriceperweek,
      [TimeInterval.MONTH]: asset.rentalPricepermonth,
      [TimeInterval.YEAR]: asset.rentalPriceperyear,
    };
    const pricePerUnit = priceMap[timeInterval];
    if (!pricePerUnit) throw new BadRequestException(await this.i18n.translate('booking.ERROR_INVALID_INTERVAL', { lang }));
    const totalPrice = pricePerUnit * numberOfUnits * numberOfProperty;

    // Use a transaction to avoid race conditions when checking available units
    const session = await this.bookingModel.db.startSession();
    session.startTransaction();
    try {
      // re-check overlapping bookings (within transaction)
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

      // create booking document (stored in UTC)
      const createdArr = await this.bookingModel.create(
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

      const created = createdArr[0];
      this.logger.log(`✅ Booking created successfully with ID: ${created._id}`);

      // Notify both merchant & customer (email + sms) with asset name, rental range, customer name
      await this.notifyBookingCreatedToBoth(created, customer, merchant, asset, lang);

      // Return booking summary with ET-formatted dates
      const summary = await this.buildBookingSummary(created, customer, merchant, asset, availableUnits - numberOfProperty, pricePerUnit, lang);
      return summary;
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      this.logger.error('Create booking failed', err.stack || err);
      if (err instanceof BadRequestException || err instanceof NotFoundException) throw err;
      throw new InternalServerErrorException(await this.i18n.translate('booking.ERROR_CREATE_BOOKING', { lang }));
    }
  }

  

  // ===================================================
  // Helper: Duration Calculator (keeps original logic)
  // ===================================================
  private calculateDuration(startDate: Date, endDate: Date, timeInterval: TimeInterval, lang: string): number {
    switch (timeInterval) {
      case TimeInterval.HOUR:
        return Math.max(1, differenceInHours(endDate, startDate));
      case TimeInterval.DAY:
        return Math.max(1, differenceInDays(endDate, startDate));
      case TimeInterval.WEEK:
        return Math.max(1, differenceInWeeks(endDate, startDate));
      case TimeInterval.MONTH:
        return Math.max(1, differenceInMonths(endDate, startDate));
      case TimeInterval.YEAR:
        return Math.max(1, differenceInYears(endDate, startDate));
      default:
        throw new BadRequestException(this.i18n.translate('booking.ERROR_INVALID_INTERVAL', { lang }));
    }
  }

  // ===================================================
  // CRON → Notify customer + merchant when booking ends
  // Runs every 5 minutes; recovers missed notifications if server was down
  // ===================================================
  @Cron('*/5 * * * *')
  async checkBookingEnd() {
    // Use UTC now as the stored dates are UTC instants; for logging show ET
    const nowUtc = moment().utc().toDate();
    const nowEtStr = moment(nowUtc).tz(this.ET_TIMEZONE).format('YYYY-MM-DD HH:mm');

    const endedBookings = await this.bookingModel
      .find({
        endDate: { $lte: nowUtc },
        status: BookingStatus.CONFIRMED,
        $or: [{ notifiedEmail: { $ne: true } }, { notifiedSms: { $ne: true } }],
      })
      .populate<{ customer: UserDocument; merchant: UserDocument; asset: AssetDocument }>('customer merchant asset');

    this.logger.log(`Cron checkBookingEnd: found ${endedBookings.length} ended bookings at ET ${nowEtStr}`);

    for (const booking of endedBookings) {
      try {
        const customer = booking.customer;
        const merchant = booking.merchant;
        const assetName = booking.asset?.name || 'asset';
        const customerEmail = customer?.email;
        const customerPhone = (customer?.phonenumber || '').toString();

        // Email
        if (!booking.notifiedEmail && customerEmail) {
          try {
            await this.mailService.sendMail(
              customerEmail,
              await this.i18n.translate('booking.EMAIL_SUBJECT_RENTAL_ENDED', { lang: 'en' }),
              `<p>Hello ${customer.fullName},</p><p>Your rental for <strong>${assetName}</strong> has ended. Thank you!</p>`,
            );
            booking.notifiedEmail = true;
          } catch (mailErr) {
            this.logger.error(`Email failed for booking ${booking._id}: ${mailErr?.message}`);
          }
        }

        // SMS
        if (!booking.notifiedSms && customerPhone) {
          try {
            await this.smsService.sendSms(customerPhone, `Hello ${customer.fullName}, your rental for ${assetName} has ended. Thank you!`);
            booking.notifiedSms = true;
          } catch (smsErr) {
            this.logger.error(`SMS failed for booking ${booking._id}: ${smsErr?.message}`);
          }
        }

        // persist flags
        if (booking.notifiedEmail || booking.notifiedSms) {
          await booking.save();
          this.logger.log(`Notifications updated for booking ${booking._id}: email=${booking.notifiedEmail} sms=${booking.notifiedSms}`);
        }
      } catch (err) {
        this.logger.error(`Failed processing ended booking ${booking._id}: ${err.stack || err}`);
      }
    }
  }

  // ===================================================
  // Helpers for notifications
  // ===================================================
  private async notifyBookingCreatedToBoth(
    booking: BookingDocument,
    customer: UserDocument,
    merchant: UserDocument,
    asset: AssetDocument,
    lang: string,
  ) {
    const customerPhone = (customer.phonenumber || '').toString();
    const merchantPhone = (merchant.phonenumber || '').toString();

    const startET = moment(booking.startDate).tz(this.ET_TIMEZONE).format('YYYY-MM-DD HH:mm');
    const endET = moment(booking.endDate).tz(this.ET_TIMEZONE).format('YYYY-MM-DD HH:mm');

    // Subjects (i18n)
    const customerSubject = await this.i18n.translate('booking.EMAIL_SUBJECT_BOOKING_CREATED', { lang });
    const merchantSubject = await this.i18n.translate('booking.EMAIL_SUBJECT_BOOKING_CREATED_MERCHANT', { lang });

    // Customer email
    try {
      await this.mailService.sendMail(
        customer.email,
        customerSubject,
        `<p>Hello ${customer.fullName},</p>
         <p>Your booking for <strong>${asset.name}</strong> has been created and is pending confirmation.</p>
         <p><strong>Rental Period:</strong> ${startET} → ${endET}</p>
         <p><strong>Merchant:</strong> ${merchant.businessName || merchant.fullName}</p>`,
      );
    } catch (err) {
      this.logger.warn('Failed to send booking-created email to customer: ' + err?.message);
    }

    // Merchant email
    try {
      await this.mailService.sendMail(
        merchant.email,
        merchantSubject,
        `<p>Hello ${merchant.businessName || merchant.fullName},</p>
         <p>A new booking has been created for <strong>${asset.name}</strong>.</p>
         <p><strong>Rental Period:</strong> ${startET} → ${endET}</p>
         <p><strong>Customer:</strong> ${customer.fullName} (${customer.email})</p>`,
      );
    } catch (err) {
      this.logger.warn('Failed to send booking-created email to merchant: ' + err?.message);
    }

    // Customer SMS
    if (customerPhone) {
      try {
        await this.smsService.sendSms(customerPhone, `Your booking for ${asset.name} is created. ${startET} → ${endET}`);
      } catch (err) {
        this.logger.warn('Failed to send booking-created SMS to customer: ' + err?.message);
      }
    }

    // Merchant SMS
    if (merchantPhone) {
      try {
        await this.smsService.sendSms(merchantPhone, `New booking: ${asset.name} by ${customer.fullName}. ${startET} → ${endET}`);
      } catch (err) {
        this.logger.warn('Failed to send booking-created SMS to merchant: ' + err?.message);
      }
    }
  }

  // ===================================================
  // Build booking summary (returns ET-formatted dates)
  // ===================================================
  private async buildBookingSummary(
    booking: BookingDocument,
    customer: UserDocument,
    merchant: UserDocument,
    asset: AssetDocument,
    availableUnitsAfterBooking: number,
    pricePerUnit: number,
    lang = 'en',
  ) {
    return {
      message: await this.i18n.translate('booking.SUCCESS_BOOKING_CREATED', { lang }),
      bookingSummary: {
        bookingId: booking._id,
        assetName: asset.name,
        merchantName: merchant.businessName || merchant.fullName,
        merchantEmail: merchant.email,
        merchantPhone: merchant.phonenumber,
        customerName: customer.fullName,
        customerEmail: customer.email,
        customerPhone: customer.phonenumber,
        startDate: moment(booking.startDate).tz(this.ET_TIMEZONE).format('YYYY-MM-DD HH:mm'),
        endDate: moment(booking.endDate).tz(this.ET_TIMEZONE).format('YYYY-MM-DD HH:mm'),
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