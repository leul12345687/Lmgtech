// src/booking/booking.service.ts
import {
  Injectable,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
  Logger,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import moment from 'moment-timezone';
import { randomUUID } from 'crypto';
import { Cron } from '@nestjs/schedule';
import {
  Booking,
  BookingDocument,
  BookingStatus,
  PaymentStatus,
  TimeInterval,
} from './booking.schema';
import { PropertyService } from '../property/property.service';
import { AssetDocument, AssetStatus,Asset } from '../property/property.schema';
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
export type BookingWithUsers = Booking & {
  customer: UserDocument;
  merchant: UserDocument;
};
// 👇 ADD THIS
export type BookingWithUsersAndAsset = Booking & {
  customer: User;
  asset: Asset;
};
@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);
  private readonly ET_TIMEZONE = 'Africa/Addis_Ababa';

  // config — adjust as needed
  private readonly PAYMENT_EXPIRE_HOURS = 24; // X hours to expire unpaid ref
  private readonly VAT_RATE = 0.15; // 15% VAT (VAT-included pricing model)
  private readonly AMOUNT_TOLERANCE = 0.5; // ETB tolerance for webhook amount comparison

  constructor(
    @InjectModel(Booking.name) private readonly bookingModel: Model<BookingDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly propertyService: PropertyService,
    private readonly mailService: MailService,
    private readonly smsService: SmsService,
  ) {}

  // ===================================================
  // CREATE BOOKING -> generate payment ref -> return info
  // VAT included: totalPriceGross is what customer pays (stored in totalPrice)
  // netAmount = gross / (1 + VAT_RATE)
  // vatAmount = gross - netAmount
  // ===================================================
  public async createBookingForPayment(
  customerId: Types.ObjectId,
  assetName: string,
  merchantEmail: string,
  startDate: string | Date,
  endDate: string | Date,
  timeInterval: TimeInterval,
  numberOfProperty: number,
  securityDeposit = 0,
  lang = 'en',
) {
  /* ===============================
     1️⃣ BASIC VALIDATION
  =============================== */
  if (
    !customerId ||
    !assetName ||
    !merchantEmail ||
    !startDate ||
    !endDate ||
    !timeInterval ||
    !numberOfProperty ||
    numberOfProperty <= 0
  ) {
    throw new BadRequestException('Missing or invalid booking fields');
  }

  /* ===============================
     2️⃣ LOAD USERS
  =============================== */
  const merchant = await this.userModel.findOne({
    email: merchantEmail,
    role: UserRole.MERCHANT,
  });
  if (!merchant) throw new NotFoundException('Merchant not found');

  const customer = await this.userModel.findById(customerId);
  if (!customer) throw new NotFoundException('Customer not found');

  /* ===============================
     3️⃣ MERCHANT ACCOUNT NUMBER (CBE)
     🔴 SINGLE SOURCE OF TRUTH
  =============================== */
  if (!merchant.acountnumber) {
    throw new BadRequestException(
      'Merchant CBE account number is not configured',
    );
  }

  const merchantAccountNumber = merchant.acountnumber.toString();

  /* ===============================
     4️⃣ LOAD ASSET
  =============================== */
  const assetModel =
    this.propertyService['assetModel'] as Model<AssetDocument>;

  const asset = await assetModel.findOne({
    name: assetName,
    merchant: merchant._id,
  });

  if (!asset) throw new NotFoundException('Asset not found');
  if (asset.status !== AssetStatus.AVAILABLE) {
    throw new BadRequestException('Asset is not available');
  }

  /* ===============================
     5️⃣ DATE HANDLING (ET → UTC)
  =============================== */
  let startUTC: Date;
  let endUTC: Date;

  try {
    startUTC = moment
      .tz(startDate, this.ET_TIMEZONE)
      .utc()
      .toDate();

    endUTC = moment
      .tz(endDate, this.ET_TIMEZONE)
      .utc()
      .toDate();
  } catch {
    throw new BadRequestException('Invalid date format');
  }

  if (endUTC <= startUTC) {
    throw new BadRequestException('End date must be after start date');
  }

  /* ===============================
     6️⃣ DURATION & PRICE
  =============================== */
  const numberOfUnits = this.calculateDuration(
    startUTC,
    endUTC,
    timeInterval,
  );

  if (numberOfUnits <= 0) {
    throw new BadRequestException('Invalid booking duration');
  }

  const priceMap: Record<TimeInterval, number | undefined> = {
    [TimeInterval.HOUR]: asset.rentalPriceperhour,
    [TimeInterval.DAY]: asset.rentalPriceperday,
    [TimeInterval.WEEK]: asset.rentalPriceperweek,
    [TimeInterval.MONTH]: asset.rentalPricepermonth,
    [TimeInterval.YEAR]: asset.rentalPriceperyear,
  };

  const pricePerUnit = priceMap[timeInterval];
  if (!pricePerUnit || pricePerUnit <= 0) {
    throw new BadRequestException(
      'Price not configured for selected time interval',
    );
  }

  /* ===============================
     7️⃣ PRICE CALCULATION (VAT INCLUDED)
  =============================== */
  const totalPriceGross = Number(
    (pricePerUnit * numberOfUnits * numberOfProperty).toFixed(2),
  );

  const netAmount = Number(
    (totalPriceGross / (1 + this.VAT_RATE)).toFixed(2),
  );

  const vatAmount = Number(
    (totalPriceGross - netAmount).toFixed(2),
  );

  /* ===============================
     8️⃣ PAYMENT REFERENCE & EXPIRY
  =============================== */
  const externalPaymentRef = this.generateReference();
  const expiresAt = moment()
    .add(this.PAYMENT_EXPIRE_HOURS, 'hours')
    .toDate();

  /* ===============================
     9️⃣ TRANSACTION
  =============================== */
  const session = await this.bookingModel.db.startSession();
  session.startTransaction();

  try {
    // Availability check
    const overlapping = await this.bookingModel
      .find({
        asset: asset._id,
        status: { $in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
        startDate: { $lte: endUTC },
        endDate: { $gte: startUTC },
      })
      .session(session);

    const alreadyBooked = overlapping.reduce(
      (sum, b) => sum + (b.numberOfProperty || 0),
      0,
    );

    const available =
      (asset.numberOfProperty || 0) - alreadyBooked;

    if (available < numberOfProperty) {
      throw new BadRequestException(
        'Not enough units available for selected dates',
      );
    }

    const [booking] = await this.bookingModel.create(
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
          pricePerUnit,
          totalPrice: totalPriceGross,
          securityDeposit,
          status: BookingStatus.PENDING,
          paymentStatus: PaymentStatus.UNPAID,
          externalPaymentRef,
          expiresAt,
          vatRate: this.VAT_RATE,
          vatAmount,
          netAmount,
          merchantAccountNumber,
          snapshot: {
            merchantName:
              merchant.businessName || merchant.fullName,
            merchantEmail: merchant.email,
            merchantPhone: merchant.phonenumber,
            customerName: customer.fullName,
            customerEmail: customer.email,
            customerPhone: customer.phonenumber,
            assetName: asset.name,
            merchantAccountNumber,
          },
        },
      ],
      { session },
    );

    await session.commitTransaction();
    session.endSession();

    await this.notifyBookingCreatedPaymentRequired(
      booking,
      customer,
      merchant,
      asset,
    );

    /* ===============================
       🔟 RESPONSE TO CLIENT
    =============================== */
    return {
      paymentReference: externalPaymentRef,
      amount: totalPriceGross,
      currency: 'ETB',
      bank: 'Commercial Bank of Ethiopia',
      accountNumber: merchantAccountNumber,
      expiresAt,
      vatAmount,
      netAmount,
      message:
        'Booking created. Pay the gross amount (VAT included) to the account number using the reference before expiry.',
    };
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    this.logger.error(
      'createBookingForPayment failed',
      error?.stack || error,
    );

    throw error instanceof BadRequestException
      ? error
      : new InternalServerErrorException(
          'Failed to create booking',
        );
  }
}


  // ===================================================
  // BANK WEBHOOK -> update payment status (idempotent)
  // Expect payload shape { reference, amount, transactionId, status, paidAt, payerPhone }
 public async handleBankWebhook(payload: any) {
  const { reference, amount, transactionId, status, paidAt } = payload || {};
  if (!reference) throw new BadRequestException('Missing payment reference in webhook');

  const booking = await this.bookingModel
    .findOne({ externalPaymentRef: reference })
    .populate('merchant customer asset');
  if (!booking) {
    this.logger.warn(`Unknown webhook reference: ${reference}`);
    throw new NotFoundException('Reference not found');
  }

  // idempotent: if already PAID, ignore (or update if different tx)
  if (booking.paymentStatus === PaymentStatus.PAID) {
    this.logger.log(`Webhook for already-paid booking ${booking._id} ignored`);
    return { ok: true };
  }

  // amount validation (tolerance)
  const receivedAmount = Number(amount);
  const expected = Number(booking.totalPrice);
  if (Math.abs(receivedAmount - expected) > this.AMOUNT_TOLERANCE) {
    this.logger.warn(`Amount mismatch for ${reference}: expected ${expected} got ${receivedAmount}`);
    booking.rawWebhook = payload;
    await booking.save();
    throw new BadRequestException('Amount mismatch — manual review required');
  }

  // mark payment paid, record transaction
  booking.paymentStatus = PaymentStatus.PAID;
  booking.paymentApprovedAt = paidAt ? new Date(paidAt) : new Date();
  booking.transactionId = transactionId || booking.transactionId;
  booking.webhookPayload = payload;

  // ✅ clear expiry safely
  booking.expiresAt = null;

  // ✅ use booking's own dates
  const startUTC = moment.tz(booking.startDate, this.ET_TIMEZONE).utc().toDate();
  const endUTC = moment.tz(booking.endDate, this.ET_TIMEZONE).utc().toDate();

  // optional: if you want to set an expiry for some reason
   booking.expiresAt = startUTC; // e.g., start date as the new expiry

  await booking.save();

  // notify merchant that payment is received
  await this.notifyMerchantPaymentReceived(booking);

  this.logger.log(`Payment recorded for booking ${booking._id} (ref ${reference})`);
  return { ok: true };
}


  // ===================================================
  // Merchant confirms booking after verifying payment
  // Only merchant who owns the booking can confirm
  // ===================================================
  public async merchantConfirmBooking(bookingId: string | Types.ObjectId, merchantId: string | Types.ObjectId) {
    const booking = await this.bookingModel.findById(bookingId).populate('merchant customer asset');
    if (!booking) throw new NotFoundException('Booking not found');

    if (booking.merchant.toString() !== new Types.ObjectId(merchantId).toString()) {
      throw new ForbiddenException('Not allowed to confirm this booking');
    }

    if (booking.paymentStatus !== PaymentStatus.PAID) {
      throw new BadRequestException('Cannot confirm booking: payment not received');
    }

    if (booking.status === BookingStatus.CONFIRMED) {
      return { message: 'Booking already confirmed' };
    }

    booking.status = BookingStatus.CONFIRMED;
    booking.bookingConfirmedAt = new Date();
    await booking.save();

    // notify customer
    await this.notifyCustomerBookingConfirmed(booking as BookingDocument);

    this.logger.log(`Merchant ${merchantId} confirmed booking ${booking._id}`);
    return { message: 'Booking confirmed' };
  }

  // ===================================================
  // AUTO-EXPIRE & HARD DELETE UNPAID BOOKINGS
  // Runs every 15 minutes
  // - Notify both customer & merchant
  // - Hard delete booking to free inventory
  // ===================================================
 @Cron('*/15 * * * *') // every 15 minutes
private async expireUnpaidBookings() {
  this.logger.log('⏳ Checking expired unpaid bookings...');

  const now = new Date();

  const expired = await this.bookingModel
    .find({
      paymentStatus: PaymentStatus.UNPAID,
      expiresAt: { $lte: now },
    })
    .populate('customer')
    .populate('merchant')
    .lean<BookingWithUsers[]>()
    .exec();

  if (!expired.length) {
    this.logger.log('✔ No expired unpaid bookings found.');
    return;
  }

  for (const booking of expired) {
    try {
      const customer = booking.customer;
      const merchant = booking.merchant;
      const assetName = booking.snapshot?.assetName || 'asset';

      this.logger.warn(`❌ Expiring unpaid booking REF=${booking.externalPaymentRef}`);

      // ===========================================================
      // 1) UPDATE BOOKING STATUS
      // ===========================================================
      await this.bookingModel.updateOne(
        { _id: booking._id },
        {
          $set: {
            status: BookingStatus.CANCELLED,
            paymentStatus: PaymentStatus.EXPIRED,
            cancelledAt: now,
            externalPaymentRef: undefined,
          },
          $push: {
            notificationHistory: `Booking expired at ${now.toISOString()}`,
          },
        },
      );

      // ===========================================================
      // 2) NOTIFY CUSTOMER (SMS + EMAIL)
      // ===========================================================

      const customerMsg = `Your booking for ${assetName} has expired due to non-payment.`;

      // SMS
      if (customer?.phonenumber) {
        await this.smsService.sendSms(
          customer.phonenumber.toString(),
          customerMsg,
        ).catch(err => {
          this.logger.warn(`⚠ Failed to send customer SMS: ${err?.message}`);
        });
      }

      // Email
      if (customer?.email) {
        await this.mailService.sendMail(
          customer.email,
          'Booking Expired — Payment Not Received',
          `<p>${customerMsg}</p>`
        ).catch(err => {
          this.logger.warn(`⚠ Failed to send customer email: ${err?.message}`);
        });
      }

      // ===========================================================
      // 3) NOTIFY MERCHANT (SMS + EMAIL)
      // ===========================================================

      const merchantMsg = `Booking REF: ${booking.externalPaymentRef || 'N/A'} for ${assetName} expired due to no payment from customer.`;

      // SMS
      if (merchant?.phonenumber) {
        await this.smsService.sendSms(
          merchant.phonenumber.toString(),
          merchantMsg
        ).catch(err => {
          this.logger.warn(`⚠ Failed to send merchant SMS: ${err?.message}`);
        });
      }

      // Email
      if (merchant?.email) {
        await this.mailService.sendMail(
          merchant.email,
          'Booking Expired — Customer Did Not Pay',
          `<p>${merchantMsg}</p>`
        ).catch(err => {
          this.logger.warn(`⚠ Failed to send merchant email: ${err?.message}`);
        });
      }

      this.logger.log(`✔ Notifications sent for expired booking ${booking._id}`);

    } catch (err) {
      this.logger.error(
        `🔥 Error processing expired booking ${booking._id}: ${err?.message}`
      );
    }
  }
}

@Cron('*/5 * * * *') // every 5 minutes
async notifyConfirmedBookings() {
  const confirmed = await this.bookingModel.find({
    status: BookingStatus.CONFIRMED,
    notificationSentAfterConfirm: { $ne: true }
  });

  for (const b of confirmed) {
    try {
      // send notifications
      await this.notifyCustomerBookingConfirmed(b);
      await this.notifyMerchantBookingConfirmed(b);

      // update flag
      await this.bookingModel.updateOne(
        { _id: b._id },
        { notificationSentAfterConfirm: true }
      );

      this.logger.log(`Notification sent for confirmed booking ${b._id}`);
    } catch (err) {
      this.logger.warn(
        `Failed sending confirm notifications for ${b._id}: ${err?.message}`
      );
    }
  }
}
private async notifyMerchantBookingConfirmed(booking: BookingDocument) {
  const merchant = await this.userModel.findById(booking.merchant);
  if (!merchant) return;

  const msg = `Booking ${booking._id} has been confirmed by the merchant.`;

  if (merchant.phonenumber) {
    await this.smsService.sendSms(merchant.phonenumber.toString(), msg)
      .catch(() => {});
  }

  if (merchant.email) {
    await this.mailService.sendMail(
      merchant.email,
      'Booking Confirmed',
      `<p>${msg}</p>`
    ).catch(() => {});
  }
}


  // ===================================================
  // NOTIFY END-DATE EVENTS
  // - 1 hour reminder (once)
  // - Final end notification when endDate <= now (once)
  // Runs every 5 minutes to be precise
  // ===================================================
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
 @Cron('*/5 * * * *')
private async notifyEndDateEvents() {
  const nowUtc = moment().utc().toDate();
  const oneHourLater = moment(nowUtc).add(1, 'hour').toDate();

  // =============================
  // 1) REMINDERS BEFORE END TIME
  // =============================
  const reminders = await this.bookingModel
    .find({
      status: BookingStatus.CONFIRMED,
      paymentStatus: PaymentStatus.PAID,
      endDate: { $lte: oneHourLater, $gt: nowUtc },
      remindedBeforeEnd: { $ne: true },
    })
    .populate('customer')
    .populate('asset')
    .lean<BookingWithUsersAndAsset[]>();  // ✅ fixed

  for (const b of reminders) {
    try {
      const cust = b.customer;
      const assetName = b.asset?.name || 'asset';

      const msg = `Reminder: your rental for ${assetName} ends at ${moment(b.endDate)
        .tz(this.ET_TIMEZONE)
        .format('YYYY-MM-DD HH:mm')}.`;

      // ✅ Convert phonenumber to string
      if (cust?.phonenumber)
        await this.smsService.sendSms(cust.phonenumber.toString(), msg);

      if (cust?.email)
        await this.mailService.sendMail(cust.email, 'Rental ending soon', `<p>${msg}</p>`);

      await this.bookingModel.updateOne(
        { _id: b._id },
        { remindedBeforeEnd: true }
      );
    } catch (err) {
      this.logger.warn(`Failed to send reminder for booking ${b._id}: ${err?.message}`);
    }
  }

  // =============================
  // 2) FINAL NOTIFICATION
  // =============================
  const ended = await this.bookingModel
    .find({
      status: BookingStatus.CONFIRMED,
      paymentStatus: PaymentStatus.PAID,
      endDate: { $lte: nowUtc },
      notifiedEnd: { $ne: true },
    })
    .populate('customer')
    .populate('asset')
    .lean<BookingWithUsersAndAsset[]>();  // ✅ fixed

  for (const b of ended) {
    try {
      const cust = b.customer;
      const assetName = b.asset?.name || 'asset';

      const msg = `Your rental for ${assetName} has ended. Thank you.`;

      // ✅ Convert phonenumber to string
      if (cust?.phonenumber)
        await this.smsService.sendSms(cust.phonenumber.toString(), msg);

      if (cust?.email)
        await this.mailService.sendMail(cust.email, 'Rental ended', `<p>${msg}</p>`);

      await this.bookingModel.updateOne(
        { _id: b._id },
        { notifiedEnd: true }
      );
    } catch (err) {
      this.logger.warn(`Failed to send end notification for booking ${b._id}: ${err?.message}`);
    }
  }
}


  // ===================================================
  // HELPERS & NOTIFICATION UTILITIES
  // ===================================================
  private calculateDuration(startDate: Date, endDate: Date, timeInterval: TimeInterval): number {
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
        return 1;
    }
  }
  private generateReference(): string {
  return `PAY-${moment().format('YYYYMMDDHHmmss')}-${randomUUID().slice(0, 8)}`.toUpperCase();
}


private async notifyBookingCreatedPaymentRequired(
  booking: BookingDocument,
  customer: UserDocument,
  merchant: UserDocument,
  asset: AssetDocument
) {
  const startET = moment(booking.startDate).tz(this.ET_TIMEZONE).format('YYYY-MM-DD HH:mm');
  const endET = moment(booking.endDate).tz(this.ET_TIMEZONE).format('YYYY-MM-DD HH:mm');
  const ref = booking.externalPaymentRef;
  const amount = booking.totalPrice;
  const accountNumber = booking.merchantAccountNumber || (merchant as any)?.acountnumber || 'N/A';

  // Email to customer
  try {
    await this.mailService.sendMail(
      customer.email,
      'Booking Created — Payment Required',
      `<p>Hello ${customer.fullName},</p>
       <p>Your booking for <strong>${asset.name}</strong> is pending payment.</p>
       <p>Gross Amount (VAT included): <strong>${amount}</strong></p>
       <p>Payment Reference: <strong>${ref}</strong></p>
       <p>Account Number: <strong>${accountNumber}</strong></p>
       <p>Expires At (ET): <strong>${moment(booking.expiresAt).tz(this.ET_TIMEZONE).format('YYYY-MM-DD HH:mm')}</strong></p>`
    );
  } catch (err) {
    this.logger.warn(`Failed to send booking-created email to customer: ${err?.message}`);
  }

  // SMS to customer
  if (customer.phonenumber) {
    try {
      await this.smsService.sendSms(
        customer.phonenumber.toString(),
        `Booking created for ${asset.name}. Gross: ${amount} Ref: ${ref}. Account: ${accountNumber}. Pay before ${moment(booking.expiresAt).tz(this.ET_TIMEZONE).format('YYYY-MM-DD HH:mm')}`
      );
    } catch (err) {
      this.logger.warn(`Failed to send SMS to customer: ${err?.message}`);
    }
  }

  // Notify merchant by email
  try {
    await this.mailService.sendMail(
      merchant.email,
      'New Booking — Awaiting Payment',
      `<p>Hello ${merchant.businessName || merchant.fullName},</p>
       <p>Booking created for <strong>${asset.name}</strong>.</p>
       <p>Customer: ${customer.fullName} (${customer.email})</p>
       <p>Gross Amount: ${amount}</p>
       <p>Payment Reference: <strong>${ref}</strong></p>`
    );
  } catch (err) {
    this.logger.warn(`Failed to send booking-created email to merchant: ${err?.message}`);
  }

  // SMS to merchant
  if (merchant.phonenumber) {
    try {
      await this.smsService.sendSms(
        merchant.phonenumber.toString(),
        `New booking for ${asset.name}. Gross: ${amount} Ref: ${ref}`
      );
    } catch (err) {
      this.logger.warn(`Failed to send SMS to merchant: ${err?.message}`);
    }
  }
}

private async notifyMerchantPaymentReceived(booking: BookingDocument) {
  const merchant = await this.userModel.findById(booking.merchant);
  const customerName = booking.snapshot?.customerName || 'customer';
  const msg = `Payment received for booking ${booking._id} (Ref: ${booking.externalPaymentRef}). Customer: ${customerName}. Please confirm the booking.`;

  if (!merchant) {
    this.logger.warn(`Merchant not found for booking ${booking._id}`);
    return;
  }

  // SMS
  if (merchant.phonenumber) {
    try {
      await this.smsService.sendSms(merchant.phonenumber.toString(), msg);
    } catch (err) {
      this.logger.warn(`SMS to merchant failed: ${err?.message}`);
    }
  }

  // Email
  if (merchant.email) {
    try {
      await this.mailService.sendMail(merchant.email, 'Payment Received — Confirm Booking', `<p>${msg}</p>`);
    } catch (err) {
      this.logger.warn(`Email to merchant failed: ${err?.message}`);
    }
  }
}

private async notifyCustomerBookingConfirmed(booking: BookingDocument) {
  const customer = await this.userModel.findById(booking.customer);
  const assetName = booking.snapshot?.assetName || 'asset';
  const msg = `Your booking ${booking._id} has been confirmed by the merchant.`;

  // SMS to customer
  if (customer?.phonenumber) {
    try {
      await this.smsService.sendSms(customer.phonenumber.toString(), msg);
    } catch (err) {
      this.logger.warn(`SMS to customer failed: ${err?.message}`);
    }
  }

  // Email to customer
  if (customer?.email) {
    try {
      await this.mailService.sendMail(customer.email, 'Booking Confirmed', `<p>${msg}</p>`);
    } catch (err) {
      this.logger.warn(`Email to customer failed: ${err?.message}`);
    }
  }
}
  // ============================
  // Bank Reconciliation (every 5 minutes)
  // ============================
  @Cron('*/5 * * * *') // runs every 5 minutes
  private async reconcileBankPayments() {
    this.logger.log('⏳ Running bank reconciliation...');

    try {
      // 1️⃣ Fetch all unpaid bookings
      const unpaidBookings = await this.bookingModel.find({
        paymentStatus: PaymentStatus.UNPAID,
        expiresAt: { $gte: new Date() }, // not expired yet
      }).lean();

      if (!unpaidBookings.length) {
        this.logger.log('✔ No unpaid bookings to reconcile.');
        return;
      }

      // 2️⃣ Fetch bank transactions from CBE API or CSV webhook
      const bankTransactions = await this.fetchCbeTransactions();
      if (!bankTransactions || !bankTransactions.length) {
        this.logger.warn('⚠ No transactions fetched from bank');
        return;
      }

      // 3️⃣ Match transactions with bookings by reference & amount
      for (const booking of unpaidBookings) {
        const match = bankTransactions.find(
          tx =>
            tx.reference === booking.externalPaymentRef &&
            Math.abs(Number(tx.amount) - Number(booking.totalPrice)) <= this.AMOUNT_TOLERANCE &&
            tx.beneficiaryAccount === booking.merchantAccountNumber
        );

        if (match) {
          this.logger.log(`✅ Reconciled booking REF=${booking.externalPaymentRef} via bank`);

          // Update booking as paid
          booking.paymentStatus = PaymentStatus.PAID;
          booking.paymentApprovedAt = match.paidAt ? new Date(match.paidAt) : new Date();
          booking.transactionId = match.transactionId;
          booking.webhookPayload = match;

          // save changes
          await this.bookingModel.updateOne({ _id: booking._id }, booking);

          // notify merchant
          await this.notifyMerchantPaymentReceived(booking as any);
        }
      }
    } catch (err) {
      this.logger.error('🔥 Bank reconciliation failed', err?.message);
    }
  }

  // ============================
  // Fetch transactions from CBE
  // ============================
  private async fetchCbeTransactions(): Promise<any[]> {
    // TODO: replace with actual API/CSV fetch logic
    // Example structure:
    // [
    //   { reference: 'PAY-20250212-143522-9F2A1BC3', amount: 1520, transactionId: 'TX123', paidAt: '2025-02-12T14:35:22Z', beneficiaryAccount: '123456' }
    // ]
    return [];
  }

}