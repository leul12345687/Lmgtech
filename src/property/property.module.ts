// src/property/property.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';

import { PropertyController } from './property.controller';
import { PropertyService } from './property.service';

import { MerchantAuthModule } from '../merchant/MerchantAuthmodule';
import { Asset, AssetSchema } from './property.schema';
import { User, UserSchema } from '../schema/user.schema';

@Module({
  imports: [
    // 🗄 Register Mongoose Schemas
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Asset.name, schema: AssetSchema },
    ]),

    // 🔐 JWT for merchant verification
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'JWT_SECRET',
      signOptions: { expiresIn: '1h' },
    }),

    // 👤 Merchant Auth Module
    MerchantAuthModule,
  ],

  controllers: [PropertyController],

  providers: [
    PropertyService, // ✅ Only your main business logic provider
  ],

  exports: [PropertyService],
})
export class PropertyModule {}
