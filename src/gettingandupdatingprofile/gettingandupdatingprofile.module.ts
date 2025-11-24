import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { CustomerOperationsController} from './gettingandupdatingprofile.controller';
import { CustomerOperationsService} from './gettingandupdatingprofile.service';

import { User, UserSchema } from '../schema/user.schema';
import { CustomerAuthModule } from '../customer/customerAuthMoodule';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';

@Module({
  imports: [
    // ENV
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // User Schema
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
    ]),

    // Customer Auth Guard (JWT)
    CustomerAuthModule,

    // JWT
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '1h' },
      }),
    }),

    // Cloudinary
    CloudinaryModule,
  ],

  controllers: [CustomerOperationsController],
  providers: [CustomerOperationsService],
  exports: [CustomerOperationsService],
})
export class ProfileModule {}
