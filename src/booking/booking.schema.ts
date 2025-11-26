// src/booking/booking.schema.ts

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Asset } from '../property/property.schema';
import { User } from '../schema/user.schema';

export enum BookingStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  CANCELLED = 'CANCELLED',
}

export enum PaymentStatus {
  UNPAID = 'UNPAID',
  PENDING = 'PENDING',
  PAID = 'PAID', 
  PENDING_REVIEW = 'PENDING_REVIEW', // ✅ ADD THIS
  EXPIRED = 'EXPIRED'
}

export enum TimeInterval {
  HOUR = 'hour',
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
  YEAR = 'year',
}

export type BookingDocument = Booking & Document;

@Schema({ timestamps: true, collection: 'bookings' })
export class Booking {
  // ============================
  // CUSTOMER + MERCHANT
  // ============================
  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  customer: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  merchant: Types.ObjectId;

  // Asset
  @Prop({ type: Types.ObjectId, ref: Asset.name, required: true })
  asset: Types.ObjectId;


  // RENTAL PERIOD
  // ============================
  @Prop({ required: true })
  startDate: Date;

  @Prop({ required: true })
  endDate: Date;

  @Prop({ enum: TimeInterval, required: true })
  timeInterval: TimeInterval;

  @Prop({ required: true })
  numberOfProperty: number;

  @Prop()
  numberOfUnits?: number;

  // ============================
  // PRICING
  // ============================
  @Prop()
  pricePerUnit?: number;

  @Prop()
  totalPrice?: number;

  // System fee/VAT for platform owner
  @Prop({ default: 0 })
  systemVatFee: number;

  @Prop({ default: 0 })
  securityDeposit: number;
  // ============================
  // PAYMENT PROCESSING
  // ============================
  @Prop({ default: BookingStatus.PENDING })
  status: BookingStatus;

  @Prop({ enum: PaymentStatus, default: PaymentStatus.UNPAID })
  paymentStatus: PaymentStatus;
// Mongoose will automatically add _id, but for clarity:
    _id: Types.ObjectId;
  // unique reference for bank
  @Prop({ default: null })
  externalPaymentRef?: string;

  @Prop({ type: Date, required: false, default: null })
expiresAt: Date | null;
  // merchant bank account number (NOT email)
  @Prop({ required: false })
  merchantAccountNumber?: string;

  // path for receipt upload (optional)
  @Prop()
  paymentProofPath?: string;

  // after bank webhook
  @Prop()
  transactionId?: string;

  @Prop({ type: Object, default: null })
  webhookPayload?: any;

  @Prop({ type: Object, default: null })
  rawWebhook?: any;

  @Prop({ default: null })
  paymentApprovedAt?: Date;

  @Prop({ default: null })
  bookingConfirmedAt?: Date;

  @Prop({ default: null })
  cancelledAt?: Date;

  // ============================
  // SNAPSHOT — IMMUTABLE INFO
  // ============================
  @Prop({
    type: {
      merchantName: String,
      merchantEmail: String,
      merchantPhone: String,
      customerName: String,
      customerEmail: String,
      customerPhone: String,
      assetName: String,
    },
    default: {},
  })
  snapshot: Record<string, any>;

  // ============================
  // NOTIFICATION FLAGS
  // ============================
  @Prop({ default: false })
  notifiedEmail: boolean;

  @Prop({ default: false })
  notifiedSms: boolean;
   // ============================
  // PAYMENT AMOUNTS
  // ============================
 

  @Prop({ default: 'ETB' })
  currency: string;
// ============================
// PAYMENT AMOUNTS (REQUIRED)
// ============================


@Prop({ required:false })
netAmount: number; // merchant share

@Prop({ required: false })
vatAmount: number;

@Prop({ required:false })
vatRate: number;

// ============================
// EXPIRY (FIX TYPE)
// ============================

  // ============================
  // PAYMENT REF
  // ============================
  

  @Prop({ default: false })
  notificationSentAfterConfirm: boolean;
  @Prop({ default: false })
  confirmedNotified: boolean;

  @Prop({ type: [String], default: [] })
  notificationHistory: string[];
}

export const BookingSchema = SchemaFactory.createForClass(Booking);
