import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';
import { Booking, BookingSchema } from './booking.schema';
//import { PropertyService } from '../property/property.service';
import { PropertyModule } from '../property/property.module';
import { User, UserSchema } from '../schema/user.schema';

import { CustomerAuthModule } from 'src/customer/customerAuthMoodule';

@Module({
  imports: [
    // ✅ Register Mongo Schemas
    MongooseModule.forFeature([
      { name: Booking.name, schema: BookingSchema },
      { name: User.name, schema: UserSchema },
    ]),CustomerAuthModule,

    // ✅ JWT configuration (same pattern as CustomerModule)
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '1h' },
      }),
    }),


    // ✅ Property service for asset reference
    PropertyModule,
  ],

  controllers: [BookingController],
  providers: [BookingService, ],
  exports: [BookingService], // 👈 export for use in other modules
})
export class BookingModule {}