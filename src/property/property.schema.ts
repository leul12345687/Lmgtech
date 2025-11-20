import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { User } from '../schema/user.schema'; 
//import {Booking} from "../booking/booking.schema"
export type AssetDocument = Asset & Document;

export enum AssetCategory {
  EVENT_SUPPLY = 'EventSupply',
  CONSTRUCTION_EQUIPMENT = 'ConstructionEquipment',
  HEALTHCARE_MEDICAL = 'HealthcareMedical',
  OTHER = 'Other',
}

export enum AssetStatus {
  AVAILABLE = 'available',
  RENTED = 'rented',
  MAINTENANCE = 'maintenance',
}

@Schema({ timestamps: true })
export class Asset {
  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  merchant: Types.ObjectId;
 // ✅ Use string 'Booking' instead of importing Booking class
  @Prop({ type: Types.ObjectId, ref: 'Booking', required: false })
  booking?: Types.ObjectId;
  @Prop({ required: true, trim: true })
  name: string;
   @Prop({ required: false, trim: true })
priceUnit:string;
  @Prop({ required: true })
  description: string;

  @Prop({ required: true, type: Number })
  rentalPriceperday: number;
  
  
  @Prop({ required: true, type: Number })
  rentalPriceperhour: number;
  
  @Prop({ required: true, type: Number })
  rentalPriceperweek: number;
  
  @Prop({ required: true, type: Number })
  rentalPricepermonth: number;
  
  @Prop({ required: true, type: Number })
  rentalPriceperyear: number;
 

  @Prop({ required: true, enum: AssetCategory })
  category: AssetCategory;

  @Prop({ type: [String], default: [] })
  imageUrls: string[]; 

  @Prop({ required: true, enum: AssetStatus, default: AssetStatus.AVAILABLE })
  status: AssetStatus;
  
  @Prop({ required: true, type: Number, default: 1 })
  numberOfProperty: number;
}

export const AssetSchema = SchemaFactory.createForClass(Asset);