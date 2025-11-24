import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CustomerModule } from './customer/customer.module';
import { MerchantModule } from './merchant/merchant.module';
import { AdminModule } from './admin/admin.module';
import { PropertyModule } from './property/property.module';
import { BookingModule } from './booking/booking.module';
import { OperationCustomerModule } from './operation-customer/operation-customer.module';
import { MerchantOperationModule } from './merchant-operation/merchant-operation.module';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { I18nModule, I18nJsonLoader, QueryResolver, HeaderResolver, AcceptLanguageResolver } from 'nestjs-i18n';
import { CloudinaryModule } from './cloudinary/cloudinary.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ScheduleModule } from '@nestjs/schedule';
import { SmsModule } from './notifications/sms.module';
import { ProfileModule  } from './gettingandupdatingprofile/gettingandupdatingprofile.module';

import * as path from 'path';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    I18nModule.forRoot({
      fallbackLanguage: 'en',
      loader: I18nJsonLoader,
      loaderOptions: {
        path: path.join(process.cwd(), 'src', 'i18n'),
        watch: true,
      },
      resolvers: [
        { use: QueryResolver, options: ['lang'] },
        new HeaderResolver(['x-lang']),
        AcceptLanguageResolver,
      ],
    }),

    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('MONGO_URI'),
        dbName: configService.get<string>('DB_NAME') || 'lmgtech',
        retryAttempts: 5,
        retryDelay: 2000,
      }),
    }),

    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'your-secret-key',
        signOptions: { expiresIn: '1h' },
      }),
    }),

    CloudinaryModule,
    CustomerModule,
    MerchantModule,
    AdminModule,
    PropertyModule,
    BookingModule,
    OperationCustomerModule,
    MerchantOperationModule,
    NotificationsModule,
    SmsModule,
    ScheduleModule.forRoot(),
    ProfileModule ,   // ✅ VERY IMPORTANT
  ],
  controllers: [AppController, ],
  providers: [AppService, ],
})
export class AppModule {}
