// src/auth/teller-auth.module.ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { ManagerJwtStrategy } from './AdminStrategy';
import { AdminModule } from './admin.module';

@Module({
    imports: [
        ConfigModule.forRoot(), // Load environment variables
        PassportModule.register({ defaultStrategy: "manager-jwt", session: false }), // Register Passport
        JwtModule.registerAsync({ // Configure JWT module
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: async (configService: ConfigService) => ({
                secret: configService.get<string>('JWT_SECRET'),
                signOptions: { expiresIn: '1h' },
            }),
        }),
        AdminModule, // Import TellerModule
    ],
    providers: [ManagerJwtStrategy], // Provide TellerJwtStrategy
    exports: [JwtModule, PassportModule, ManagerJwtStrategy], // Export necessary components
})
export class AdminAuthModule {}