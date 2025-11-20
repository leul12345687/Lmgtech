import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Asset } from '../property/property.schema';
import { User } from '../schema/user.schema';

export enum BookingStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  DECLINED = 'DECLINED',
  CONFIRMED = 'CONFIRMED',
  CANCELLED = 'CANCELLED',
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
  // Customer who made the booking
  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  customer: Types.ObjectId;

  // Merchant who owns the asset
  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  merchant: Types.ObjectId;

  // The booked asset
  @Prop({ type: Types.ObjectId, ref: Asset.name, required: true })
  asset: Types.ObjectId;

  // Rental start date
  @Prop({ required: true })
  startDate: Date;

  // Rental end date
  @Prop({ required: true })
  endDate: Date;

  // Rental interval
  @Prop({ enum: TimeInterval, required: true })
  timeInterval: TimeInterval;

  @Prop({ required: true, min: 1 })
  numberOfProperty: number;

  @Prop({ required: false })
  numberOfUnits?: number;

  @Prop({ required: false })
  totalPrice?: number;

  @Prop({ default: 0 })
  securityDeposit: number;

  @Prop({ enum: BookingStatus, default: BookingStatus.PENDING })
  status: BookingStatus;

  @Prop({ default: null })
  externalPaymentRef?: string;

  // LOCAL OR CLOUDINARY PATH
  @Prop({ required: false })
  paymentProofPath?: string;

  // =============================
  // 🔔 REAL-TIME NOTIFICATION FLAGS
  // =============================

  // End-of-rent email sent?
  @Prop({ type: Boolean, default: false })
  notifiedEmail: boolean;

  // End-of-rent SMS sent?
  @Prop({ type: Boolean, default: false })
  notifiedSms: boolean;

  // Booking confirmation (ACCEPTED/CONFIRMED) notification sent?
  @Prop({ type: Boolean, default: false })
  confirmedNotified: boolean;

  // =============================
  // 📅 TIMESTAMP TRACKING
  // =============================
  @Prop({ default: null })
  paymentApprovedAt?: Date;

  @Prop({ default: null })
  bookingConfirmedAt?: Date;

  @Prop({ default: null })
  cancelledAt?: Date;

  @Prop({ type: [String], default: [] })
  notificationHistory: string[];
}

export const BookingSchema = SchemaFactory.createForClass(Booking);
