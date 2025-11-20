import { MongooseModule} from '@nestjs/mongoose';
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { CustomerController } from './customer.controller';

import { ConfigModule, ConfigService } from '@nestjs/config';
import { CustomerService } from './customer.service';
import { User, UserSchema, UserRole, CustomerExtension } from '../schema/user.schema';
import { SchemaFactory } from '@nestjs/mongoose'; // Imported for SchemaFactory

@Module({
   imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '1h' }, // Example token expiration
      }),
    }),
  ],
  controllers: [CustomerController],
  providers: [CustomerService],
  exports: [CustomerService], 
})
export class CustomerModule {}