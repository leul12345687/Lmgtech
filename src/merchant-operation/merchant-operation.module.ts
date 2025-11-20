import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MerchantOperationController } from './merchant-operation.controller';
import { MerchantOperationService } from './merchant-operation.service';

import { Booking, BookingSchema } from '../booking/booking.schema';
import { Asset, AssetSchema } from '../property/property.schema';
import { User, UserSchema } from '../schema/user.schema';
import { MerchantAuthModule } from '../merchant/MerchantAuthmodule'; // ✅ Merchant auth

@Module({
  imports: [
    // 🌍 Load environment variables globally
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // 🗄️ Register Mongoose models
    MongooseModule.forFeature([
      { name: Booking.name, schema: BookingSchema },
      { name: Asset.name, schema: AssetSchema },
      { name: User.name, schema: UserSchema },
    ]),

    // 🔐 Merchant authentication module
    MerchantAuthModule,

    // 🧩 JWT for token verification
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '1h' },
      }),
    }),
  ],

  // 🎯 Controller + Service
  controllers: [MerchantOperationController],
  providers: [MerchantOperationService],
  exports: [MerchantOperationService],
})
export class MerchantOperationModule {}
