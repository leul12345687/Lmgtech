import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { User } from '../schema/user.schema';

export type AssetDocument = Asset & Document;

export enum AssetStatus {
  AVAILABLE = 'available',
  RENTED = 'rented',
  MAINTENANCE = 'maintenance',
}

@Schema({ timestamps: true })
export class Asset {
  @Prop({ type: Types.ObjectId, ref: User.name, required: true, index: true })
  merchant!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Booking', required: false })
  booking?: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: false, trim: true })
  priceUnit?: string;

  @Prop({ required: true, trim: true })
  description!: string;

  @Prop({ required: true, trim: true, lowercase: true, index: true })
  location: string;

  @Prop({ required: true, trim: true, lowercase: true, index: true })
  category: string;

  @Prop({ required: true, type: Number, min: 0 })
  rentalPriceperhour: number;

  @Prop({ required: true, type: Number, min: 0 })
  rentalPriceperday: number;

  @Prop({ required: true, type: Number, min: 0 })
  rentalPriceperweek: number;

  @Prop({ required: true, type: Number, min: 0 })
  rentalPricepermonth: number;

  @Prop({ required: true, type: Number, min: 0 })
  rentalPriceperyear: number;

  @Prop({ type: [String], default: [] })
  imageUrls: string[];

  @Prop({
    required: true,
    enum: AssetStatus,
    default: AssetStatus.AVAILABLE,
    index: true,
  })
  status: AssetStatus;

  @Prop({ required: true, type: Number, default: 1, min: 1 })
  numberOfProperty: number;

  @Prop({ type: Number, default: 0 })
  demandScore: number;

  @Prop({ type: Number })
  recommendedPrice?: number;

  @Prop({ type: Number, default: 0 })
  monthlyEstimatedIncome: number;
}

export const AssetSchema = SchemaFactory.createForClass(Asset);

AssetSchema.index({ location: 1, category: 1 });
AssetSchema.index({ merchant: 1 });
AssetSchema.index({ status: 1 });
