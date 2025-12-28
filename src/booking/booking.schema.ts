// src/booking/booking.schema.ts

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Asset } from '../property/property.schema';
import { User } from '../schema/user.schema';

export enum BookingStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  CANCELLED = 'CANCELLED',
  COMPLETED = 'COMPLETED',
  REJECTED = 'REJECTED',
}

export enum PaymentStatus {
  UNPAID = 'UNPAID',
  PENDING = 'PENDING',
  PAID = 'PAID',
  FAILED='FAILED',
  MISMATCH="MISMATCH",
  PENDING_REVIEW = 'PENDING_REVIEW',
  EXPIRED = 'EXPIRED',
}

export enum TimeInterval {
  HOUR = 'hour',
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
  YEAR = 'year',
}

// ✅ Include timestamps in document type
export type BookingDocument = Booking &
  Document & {
    createdAt: Date;
    updatedAt: Date;
  };

@Schema({ timestamps: true, collection: 'bookings' })
export class Booking {
  // ============================
  // CUSTOMER + MERCHANT
  // ============================
  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  customer: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  merchant: Types.ObjectId;

  // ============================
  // ASSET
  // ============================
  @Prop({ type: Types.ObjectId, ref: Asset.name, required: true })
  asset: Types.ObjectId;

  // ============================
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

  @Prop({ type: Object })
  paymentVerification?: any;
  // ============================
  // PRICING
  // ============================
  @Prop()
  pricePerUnit?: number;

  @Prop()
  totalPrice?: number;

  @Prop({ default: 0 })
  systemVatFee: number;

  @Prop({ default: 0 })
  securityDeposit: number;

  // ============================
  // STATUS & PAYMENT
  // ============================
  @Prop({ enum: BookingStatus, default: BookingStatus.PENDING })
  status: BookingStatus;

  @Prop({ enum: PaymentStatus, default: PaymentStatus.UNPAID })
  paymentStatus: PaymentStatus;

  // ============================
  // PAYMENT PROCESSING
  // ============================
  @Prop({ default: null })
  externalPaymentRef?: string;

  @Prop({ type: Date, default: null })
  expiresAt?: Date | null;

  @Prop()
  merchantAccountNumber?: string;

  @Prop()
  paymentProofPath?: string;

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
// Mongoose will automatically add _id, but for clarity:
    _id: Types.ObjectId; 
  // ============================
  // SNAPSHOT (IMMUTABLE)
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
  // NOTIFICATIONS
  // ============================
  @Prop({ default: false })
  notifiedEmail: boolean;

  @Prop({ default: false })
  notifiedSms: boolean;

  @Prop({ default: 'ETB' })
  currency: string;

  // ============================
  // PAYMENT AMOUNTS
  // ============================
  @Prop({ default: null })
  netAmount?: number;

  @Prop({ default: null })
  vatAmount?: number;

  @Prop({ default: null })
  vatRate?: number;

  // ============================
  // FLAGS & HISTORY
  // ============================
  @Prop({ default: false })
  notificationSentAfterConfirm: boolean;

  @Prop({ default: false })
  confirmedNotified: boolean;

  @Prop({ type: [String], default: [] })
  notificationHistory: string[];
}

export const BookingSchema = SchemaFactory.createForClass(Booking);
