// src/Admin/admin/strategy.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AdminService } from './admin.service';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';

@Injectable()
export class ManagerJwtStrategy extends PassportStrategy(Strategy, "manager-jwt") {
    constructor(
        private readonly managerService: AdminService,
        private readonly configService: ConfigService,
    ) {
        const secret = configService.get<string>('JWT_SECRET');

        console.log('🔐 [ManagerJwtStrategy] Initializing strategy...');
        console.log('🔑 JWT Secret from ConfigService:', secret ? '(loaded successfully)' : '(❌ missing!)');

        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            secretOrKey: secret,
        });
    }

    async validate(payload: any): Promise<any> {
        console.log('\n========== [ManagerJwtStrategy.validate] ==========');
        console.log('🧾 Full JWT Payload:', JSON.stringify(payload, null, 2));

        try {
            if (!payload) {
                console.error('❌ JWT payload is missing or undefined!');
                throw new UnauthorizedException('Invalid token: missing payload');
            }

            if (!payload.sub) {
                console.error('❌ JWT payload missing "sub" field (user ID)');
                throw new UnauthorizedException('Invalid token: missing sub');
            }

            if (!payload.role) {
                console.warn('⚠️ JWT payload missing role — expected ADMIN role.');
            }

            console.log(`🔍 Fetching admin user from DB with ID: ${payload.sub}...`);
            const user = await this.managerService.findById(payload.sub);

            if (!user) {
                console.error(`❌ No admin found in DB for ID: ${payload.sub}`);
                throw new UnauthorizedException('User not found');
            }

            console.log('✅ User found:', {
                id: user._id?.toString(),
                email: user.email,
                role: user.role,
            });

            if (!user.role || user.role !== 'admin') {
                console.error(`🚫 Unauthorized role detected: ${user.role}`);
                throw new UnauthorizedException('Unauthorized: invalid role');
            }

            const userId = typeof user._id === 'string' ? user._id : user._id.toString();

            console.log('✅ Returning validated user:', {
                id: userId,
                email: user.email,
                role: user.role,
            });
            console.log('===================================================\n');

            return {
                id: userId,
                email: user.email,
                role: user.role,
            };

        } catch (error) {
            console.error('💥 Error during JWT validation:', error);
            console.error('---------------------------------------------------\n');
            throw new UnauthorizedException('Invalid token');
        }
    }
}