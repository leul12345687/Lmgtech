import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';


import { CustomerOperationsController } from './operation-customer.controller';
import { CustomerOperationsService } from './operation-customer.service';

import { Asset, AssetSchema } from '../property/property.schema';
import { Booking, BookingSchema } from '../booking/booking.schema';
import { User, UserSchema } from '../schema/user.schema';
import { CustomerAuthModule } from 'src/customer/customerAuthMoodule';
@Module({
  imports: [
    // 🔧 Load .env variables globally
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // 🗄️ Register Mongoose models
    MongooseModule.forFeature([
      { name: Asset.name, schema: AssetSchema },
      { name: Booking.name, schema: BookingSchema },
      { name: User.name, schema: UserSchema },
    ]),

    CustomerAuthModule,

    // 🔐 JWT for auth verification
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '1h' },
      }),
    }),
  ],

  // 🧩 Controller + Service
  controllers: [CustomerOperationsController],
  providers: [CustomerOperationsService],
  exports: [CustomerOperationsService],
})
export class  OperationCustomerModule {}