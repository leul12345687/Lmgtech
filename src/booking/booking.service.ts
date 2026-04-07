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
import { AssetDocument, AssetStatus, Asset } from '../property/property.schema';
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
import { ChapaService } from '../chapa/chapa.service';

export type BookingWithUsers = Booking & {
  customer: UserDocument;
  merchant: UserDocument;
};

export type BookingWithUsersAndAsset = Booking & {
  customer: User;
  asset: Asset;
};
// src/booking/booking.service.ts
@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);
  private readonly ET_TIMEZONE = 'Africa/Addis_Ababa';

  private readonly PAYMENT_EXPIRE_HOURS = 24;
  private readonly VAT_RATE = 0.15;

  private readonly AMOUNT_TOLERANCE = 0.5; // <--- here
  constructor(
    @InjectModel(Booking.name)
    private readonly bookingModel: Model<BookingDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly propertyService: PropertyService,
    private readonly mailService: MailService,
    private readonly smsService: SmsService,
    private readonly chapaService: ChapaService,
  ) {}

  // ===================================================
  // CREATE BOOKING → INITIATE CHAPA → RETURN CHECKOUT URL
  // ===================================================
  // ===================================================
// CREATE BOOKING → INITIATE CHAPA → RETURN CHECKOUT URL
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
  /* ===================================================
     1️⃣ VALIDATION
     =================================================== */
  if (!customerId || !assetName || !merchantEmail || numberOfProperty <= 0) {
    throw new BadRequestException('Invalid booking data');
  }

  /* ===================================================
     2️⃣ LOAD USERS
     =================================================== */
  const merchant = await this.userModel.findOne({
    email: merchantEmail,
    role: UserRole.MERCHANT,
  });

  if (!merchant || !merchant.acountnumber) {
    throw new BadRequestException('Merchant not properly configured');
  }

  const customer = await this.userModel.findById(customerId);
  if (!customer) {
    throw new NotFoundException('Customer not found');
  }

  /* ===================================================
     3️⃣ LOAD ASSET
     =================================================== */
  const assetModel = this.propertyService['assetModel'] as Model<AssetDocument>;
  const asset = await assetModel.findOne({
    name: assetName,
    merchant: merchant._id,
    status: AssetStatus.AVAILABLE,
  });

  if (!asset) {
    throw new NotFoundException('Asset not available');
  }

  /* ===================================================
     4️⃣ DATE HANDLING (ET → UTC)
     =================================================== */
  const startUTC = moment.tz(startDate, this.ET_TIMEZONE).utc().toDate();
  const endUTC = moment.tz(endDate, this.ET_TIMEZONE).utc().toDate();

  if (endUTC <= startUTC) {
    throw new BadRequestException('Invalid date range');
  }

  /* ===================================================
     5️⃣ PRICING
     =================================================== */
  const units = this.calculateDuration(startUTC, endUTC, timeInterval);
  if (units <= 0) {
    throw new BadRequestException('Invalid duration');
  }

  const pricePerUnit = {
    [TimeInterval.HOUR]: asset.rentalPriceperhour,
    [TimeInterval.DAY]: asset.rentalPriceperday,
    [TimeInterval.WEEK]: asset.rentalPriceperweek,
    [TimeInterval.MONTH]: asset.rentalPricepermonth,
    [TimeInterval.YEAR]: asset.rentalPriceperyear,
  }[timeInterval];

  if (!pricePerUnit) {
    throw new BadRequestException('Price not configured');
  }

  const grossAmount = Number(
    (pricePerUnit * units * numberOfProperty).toFixed(2),
  );

  if (grossAmount <= 0) {
    throw new BadRequestException('Invalid payment amount');
  }

  if (grossAmount > 1_000_000) {
    throw new BadRequestException(
      'Amount exceeds Chapa test limit (1,000,000 ETB)',
    );
  }

  const netAmount = Number((grossAmount / (1 + this.VAT_RATE)).toFixed(2));
  const vatAmount = Number((grossAmount - netAmount).toFixed(2));

  /* ===================================================
     6️⃣ PAYMENT METADATA
     =================================================== */
  const externalPaymentRef = `BOOK-${randomUUID()}`;
    // payment expiry: allow a short window from creation time (not booking start)
    const expiresAt = moment().utc().add(this.PAYMENT_EXPIRE_HOURS, 'hours').toDate();

  /* ===================================================
     7️⃣ INITIATE CHAPA (SOURCE OF CHECKOUT URL)
     =================================================== */
  let checkoutUrl: string;

  try {
    const chapaResponse = await this.chapaService.initializePayment({
      txRef: externalPaymentRef,
      amount: grossAmount,
      customerEmail: customer.email,
      customerFirstName: customer.fullName,
      webhookUrl: `${process.env.API_URL}/chapa/webhook`,
      description: `Booking payment for ${asset.name}`,
    });

    if (!chapaResponse?.checkoutUrl) {
      throw new Error('Missing checkout URL');
    }

    checkoutUrl = chapaResponse.checkoutUrl;
  } catch (err) {
    this.logger.error('Chapa initialization failed', err);
    throw new BadRequestException('Unable to initialize payment');
  }

  /* ===================================================
     8️⃣ DB TRANSACTION (ATOMIC)
     =================================================== */
  const session = await this.bookingModel.db.startSession();
  session.startTransaction();

  try {
    const [booking] = await this.bookingModel.create(
      [
        {
          customer: customer._id,
          merchant: merchant._id,
          asset: asset._id,

          startDate: startUTC,
          endDate: endUTC,
          timeInterval,
          numberOfUnits: units,
          numberOfProperty,

          pricePerUnit,
          totalPrice: grossAmount,
          securityDeposit,

          status: BookingStatus.PENDING,
          paymentStatus: PaymentStatus.UNPAID,

          externalPaymentRef,
          checkoutUrl,
          expiresAt,

          vatRate: this.VAT_RATE,
          vatAmount,
          netAmount,

          merchantAccountNumber: merchant.acountnumber,

          snapshot: {
            merchantName: merchant.businessName || merchant.fullName,
            merchantEmail: merchant.email,
            customerName: customer.fullName,
            customerEmail: customer.email,
            assetName: asset.name,
          },
        },
      ],
      { session },
    );

    await session.commitTransaction();
    session.endSession();

    /* ===================================================
       9️⃣ NOTIFY AFTER COMMIT
       =================================================== */
    await this.notifyBookingCreatedPaymentRequired(
      booking,
      customer,
      merchant,
      asset,
    );

    /* ===================================================
       🔟 RESPONSE
       =================================================== */
    return {
      bookingId: booking._id,
      paymentReference: externalPaymentRef,
      grossAmount,
      netAmount,
      vatAmount,
      vatRate: this.VAT_RATE,
      currency: 'ETB',
      expiresAt,
      checkoutUrl,
    };
  } catch (err) {
    await session.abortTransaction();
    session.endSession();

    this.logger.error('Booking creation failed', err);
    throw new InternalServerErrorException('Booking creation failed');
  }
}

// ===================================================
// Chapa Webhook → Update Booking Payment Status
// ===================================================
public async handleChapaWebhook(payload: any) {
  this.logger.warn('🔔 CHAPA WEBHOOK RECEIVED', JSON.stringify(payload));

  const reference =
    payload?.tx_ref ||
    payload?.reference ||
    payload?.data?.tx_ref ||
    payload?.data?.reference ||
    payload?.meta?.bookingRef;

  // 🚨 NEVER THROW IN WEBHOOKS
  if (!reference) {
    this.logger.warn('⚠️ Webhook missing tx_ref');
    return { ok: true };
  }

  const booking = await this.bookingModel
    .findOne({ externalPaymentRef: reference })
    .populate('merchant customer asset');

  if (!booking) {
    this.logger.warn(`⚠️ Webhook for unknown ref: ${reference}`);
    return { ok: true };
  }

  // 🔁 IDEMPOTENCY
  if (booking.paymentStatus === PaymentStatus.PAID) {
    this.logger.log(`🔁 Booking ${booking._id} already PAID`);
    return { ok: true };
  }

  // 🔐 VERIFY WITH CHAPA (SOURCE OF TRUTH)
  const verification = await this.chapaService.verifyTransaction(reference);

  booking.webhookPayload = payload;
  booking.paymentVerification = verification?.raw ?? null;

  // Defensive checks for verification
  if (!verification || typeof verification.status !== 'string') {
    this.logger.warn(`⚠️ Invalid verification payload for ref ${reference}`);
    return { ok: true };
  }

  // ⏳ PENDING → DO NOTHING
  if (verification.status === 'pending') {
    return { ok: true };
  }

  // ❌ FAILED PAYMENT
  if (verification.status === 'failed') {
    booking.paymentStatus = PaymentStatus.FAILED;
    await booking.save();
    return { ok: true };
  }

  // 💰 AMOUNT VALIDATION (SAFE FLOAT COMPARE)
  const expectedAmount = Number(booking.totalPrice);
  const receivedAmount = Number(verification.amount);

  // Use cents (integer) comparison to avoid float issues
  const expectedCents = Math.round(expectedAmount * 100);
  const receivedCents = Math.round(receivedAmount * 100);
  const toleranceCents = Math.round(this.AMOUNT_TOLERANCE * 100);

  if (Math.abs(expectedCents - receivedCents) > toleranceCents) {
    this.logger.error(
      `❌ Amount mismatch for ${reference}: expected ${expectedAmount}, got ${receivedAmount}`,
    );

    booking.paymentStatus = PaymentStatus.MISMATCH;
    await booking.save();
    return { ok: true };
  }

  // ✅ MARK AS PAID (FINAL STATE)
  booking.paymentStatus = PaymentStatus.PAID;
  booking.status = BookingStatus.CONFIRMED;
  booking.transactionId = verification.transactionId;
  booking.paymentApprovedAt = verification.paidAt
    ? new Date(verification.paidAt)
    : new Date();
  booking.expiresAt = null;

  await booking.save();

  // 🔔 Notify AFTER commit
  await this.notifyMerchantPaymentReceived(booking);

  this.logger.log(
    `✅ Payment confirmed for booking ${booking._id} (ref: ${reference})`,
  );

  return { ok: true };
}

  // ===================================================
  // Merchant confirms booking after verifying payment
  // Only merchant who owns the booking can confirm
  // ===================================================
  public async merchantConfirmBooking(bookingId: string | Types.ObjectId, merchantId: string | Types.ObjectId) {
    const booking = await this.bookingModel.findById(bookingId).populate('merchant customer asset');
    if (!booking) throw new NotFoundException('Booking not found');

    // Normalize merchant id whether populated object or id
    const bookingMerchantId = (booking.merchant as any)?._id ? String((booking.merchant as any)._id) : String(booking.merchant);
    if (bookingMerchantId !== String(merchantId)) {
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
       <p>Your booking for ${asset.name} is pending payment.</p>
       <p>Gross Amount (VAT included): ${amount}</p>
       <p>Payment Reference: ${ref}</p>
       <p>Account Number: ${accountNumber}</p>
       <p>Expires At (ET): ${moment(booking.expiresAt).tz(this.ET_TIMEZONE).format('YYYY-MM-DD HH:mm')}</p>`
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
       <p>Booking created for ${asset.name}.</p>
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
}// ============================
// Bank Reconciliation (every 5 minutes)
// ============================
@Cron('*/5 * * * *')
private async reconcileBankPayments() {
  this.logger.log('⏳ Running bank reconciliation...');

  try {
    // 1️⃣ Fetch unpaid & active bookings
    const unpaidBookings = await this.bookingModel.find({
      paymentStatus: PaymentStatus.UNPAID,
      expiresAt: { $gte: new Date() },
    }).populate('merchant customer asset');

    if (!unpaidBookings.length) {
      this.logger.log('✔ No unpaid bookings to reconcile.');
      return;
    }

    // 2️⃣ Fetch bank transactions
    const bankTransactions = await this.fetchCbeTransactions(); // implement fetching logic
    if (!bankTransactions?.length) {
      this.logger.warn('⚠ No transactions fetched from bank');
      return;
    }

    // 3️⃣ Index transactions by payment reference
    const txMap = new Map<string, any>();
    for (const tx of bankTransactions) {
      if (tx.reference) {
        txMap.set(tx.reference, tx);
      }
    }

    // 4️⃣ Reconcile bookings
    for (const booking of unpaidBookings) {
      if (!booking.externalPaymentRef) continue; // safety guard

      const tx = txMap.get(booking.externalPaymentRef);
      if (!tx) continue;

      // Amount check with tolerance (compare in cents)
      const txCents = Math.round(Number(tx.amount) * 100);
      const bookingCents = Math.round(Number(booking.totalPrice) * 100);
      const toleranceCents = Math.round(this.AMOUNT_TOLERANCE * 100);
      const amountMatches = Math.abs(txCents - bookingCents) <= toleranceCents;

      // Merchant account check
      const accountMatches = tx.beneficiaryAccount === booking.merchantAccountNumber;

      if (!amountMatches || !accountMatches) continue;

      // 5️⃣ Idempotent update
      const updated = await this.bookingModel.findOneAndUpdate(
        {
          _id: booking._id,
          paymentStatus: PaymentStatus.UNPAID,
        },
        {
          $set: {
            paymentStatus: PaymentStatus.PAID,
            paymentApprovedAt: tx.paidAt ? new Date(tx.paidAt) : new Date(),
            transactionId: tx.transactionId,
            reconciliationPayload: tx, // store full transaction for audit
            expiresAt: null,
          },
        },
        { new: true },
      ).populate('merchant customer asset');

      if (!updated) {
        this.logger.log(`ℹ Booking ${booking._id} already reconciled`);
        continue;
      }

      this.logger.log(`✅ Reconciled booking REF=${booking.externalPaymentRef}`);

      // 6️⃣ Notify merchant (non-blocking)
      try {
        await this.notifyMerchantPaymentReceived(updated);
      } catch (notifyErr) {
        this.logger.error(
          `⚠ Payment reconciled but merchant notification failed for booking ${updated._id}`,
          notifyErr?.message,
        );
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