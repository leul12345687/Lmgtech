import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { MerchantController } from './merchant.controller';
import { MerchantService } from './merchant.service';
import { AdminAuthModule } from 'src/admin/AdminAuthmodule';
import { 
  User, 
  UserSchema, 
  UserRole,
  MerchantExtension // Import the extension class
} from '../schema/user.schema';
import { SchemaFactory } from '@nestjs/mongoose';

@Module({
  imports: [
    // 1. Mongoose Discriminator Setup for Merchant
   MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
    ]),AdminAuthModule,
    
    // 2. JWT Configuration
    JwtModule.register({
      secret: 'JWT_SECRET', 
      signOptions: { expiresIn: '1h' }, 
    }),
  ],
  controllers: [MerchantController],
  providers: [MerchantService],
  exports: [MerchantService], 
})
export class MerchantModule {}