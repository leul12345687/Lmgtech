// src/auth/teller-auth.module.ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { CustomerJwtStrategy } from './customerStrategy';
import { CustomerModule } from './customer.module';

@Module({
    imports: [
        ConfigModule.forRoot(), // Load environment variables
        PassportModule.register({ defaultStrategy: "customer-jwt", session: false }), // Register Passport
        JwtModule.registerAsync({ // Configure JWT module
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: async (configService: ConfigService) => ({
                secret: configService.get<string>('JWT_SECRET'),
                signOptions: { expiresIn: '1h' },
            }),
        }),
        CustomerModule, // Import TellerModule
    ],
    providers: [CustomerJwtStrategy], // Provide TellerJwtStrategy
    exports: [JwtModule, PassportModule, CustomerJwtStrategy], // Export necessary components
})
export class CustomerAuthModule {}