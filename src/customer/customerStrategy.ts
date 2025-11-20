import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { CustomerService } from './customer.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CustomerJwtStrategy extends PassportStrategy(Strategy, 'customer-jwt') {
  constructor(
    private readonly customerService: CustomerService,
    private readonly configService: ConfigService,
  ) {
    const secret = configService.get<string>('JWT_SECRET');

    console.log('🔐 [CustomerJwtStrategy] Initializing...');
    console.log('🔑 JWT Secret:', secret ? '(loaded successfully)' : '(❌ missing!)');

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: secret,
    });
  }

  async validate(payload: any): Promise<any> {
    console.log('\n========== [CustomerJwtStrategy.validate] ==========');
    console.log('🧾 Full JWT Payload:', JSON.stringify(payload, null, 2));

    try {
      if (!payload || !payload.sub) {
        throw new UnauthorizedException('Invalid token payload');
      }

      // ✅ Find the customer in the database
      const user = await this.customerService.findById(payload.sub);
      if (!user) {
        throw new UnauthorizedException('Customer not found');
      }

      // ✅ Verify role
      if (!user.role || !['customer', 'CUSTOMER'].includes(user.role)) {
        console.error(`🚫 Unauthorized role: ${user.role}`);
        throw new UnauthorizedException('Unauthorized: not a customer');
      }

      console.log('✅ Customer validated:', {
        id: user._id?.toString(),
        email: user.email,
        role: user.role,
      });
      console.log('===================================================\n');

      // ✅ Return what gets attached to req.user
      return { sub: user._id.toString(), email: user.email, role: user.role };
    } catch (error) {
      console.error('💥 Error during JWT validation:', error);
      throw new UnauthorizedException('Invalid token');
    }
  }
}
