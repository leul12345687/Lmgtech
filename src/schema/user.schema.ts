import { Prop, Schema, SchemaFactory, raw } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// 1. Define Role Enum
export enum UserRole {
  ADMIN = 'admin',
  MERCHANT = 'merchant',
  CUSTOMER = 'customer',
}

// 2. Define the base User Document type
export type UserDocument = User & Document;

// 3. Define the base User Schema
@Schema({ 
  timestamps: true,
  collection: 'users',
  discriminatorKey: 'role', 
})
export class User {
  // Common Fields
  @Prop({ required: true, unique: true, index: true })
  email: string;

  @Prop({ select: false }) 
  password?: string;

  @Prop({ required: true, unique: true, index: true })
  phonenumber: number;

  @Prop({ required:false })
  profilePictureUrl: string;

  @Prop({ required: true })
  fullName: string;
  
  @Prop({ required: false })
  campanyname: string; // Used for general company/business name
  

  @Prop({ required: true })
  address: string;
  
  @Prop({ unique: false,  })
  acountnumber: number;
  
  @Prop({ 
    type: String, 
    required: true, 
    enum: Object.values(UserRole),
    default: UserRole.CUSTOMER
  })
  role: UserRole;


 @Prop({ required:false })
    businessName: string; 

    @Prop({ type: [{ type: Types.ObjectId, ref: 'Asset' }], default: [] })
    assetInventoryIds: Types.ObjectId[];

    @Prop({ default: 'ETB' })
    payoutCurrency: string;



  // Account Status
  @Prop({ default: true })
  isActive: boolean;
  
  @Prop({ default: Date.now })
  lastLogin: Date;

    // Mongoose will automatically add _id, but for clarity:
    _id: Types.ObjectId; 
}

export const UserSchema = SchemaFactory.createForClass(User);

// ------------------------------------------------------------------
// DISCRIMINATOR EXTENSIONS (The previously incomplete section)
// ------------------------------------------------------------------

// Merchant Extension Fields (used to define the structure for the Merchant discriminator)
export class MerchantExtension {
  @Prop({ required: true })
  businessName: string; // Specific business name field (may overlap with campanyname)
  
  @Prop({ type: [{ type: Types.ObjectId, ref: 'Asset' }], default: [] })
  assetInventoryIds: Types.ObjectId[];
  
  @Prop({ default: 'ETB' })
  payoutCurrency: string; // The field that caused the TypeScript error



}

// 4. Define and EXPORT the Merchant Discriminator Class
// This class inherits all fields from User and adds Merchant-specific fields.
@Schema()
export class Merchant extends User {
    // Inherit the extension fields directly for Mongoose's discriminator logic

   
}

// 5. Define and EXPORT the Merchant Document Type
// 🌟 This export is crucial for resolving the TypeScript error in MerchantService.
export type MerchantDocument = Merchant & Document; 

// The schema is also needed if you register it manually
export const MerchantSchema = SchemaFactory.createForClass(Merchant);


// Customer Extension Fields (for completeness)
export class CustomerExtension {
  @Prop({ default: 'pending', enum: ['pending', 'verified', 'rejected'] })
  identityVerificationStatus: string; 
  
  @Prop({ type: Types.ObjectId, ref: 'Booking' })
  lastBookingId?: Types.ObjectId;
}

// 6. Define and EXPORT the Customer Discriminator Class (Optional, but good practice)
@Schema()
export class Customer extends User {
    @Prop({ default: 'pending', enum: ['pending', 'verified', 'rejected'] })
    identityVerificationStatus: string; 

    @Prop({ type: Types.ObjectId, ref: 'Booking' })
    lastBookingId?: Types.ObjectId;
}

export type CustomerDocument = Customer & Document;
export const CustomerSchema = SchemaFactory.createForClass(Customer);