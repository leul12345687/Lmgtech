// src/auth/teller-auth.module.ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { MerchantJwtStrategy } from './merchantStrategy';
import { MerchantModule } from './merchant.module';

@Module({
    imports: [
        ConfigModule.forRoot(), // Load environment variables
        PassportModule.register({ defaultStrategy: "merchant-jwt", session: false }), // Register Passport
        JwtModule.registerAsync({ // Configure JWT module
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: async (configService: ConfigService) => ({
                secret: configService.get<string>('JWT_SECRET'),
                signOptions: { expiresIn: '1h' },
            }),
        }),
        MerchantModule, // Import TellerModule
    ],
    providers: [MerchantJwtStrategy], // Provide TellerJwtStrategy
    exports: [JwtModule, PassportModule, MerchantJwtStrategy], // Export necessary components
})
export class MerchantAuthModule {}