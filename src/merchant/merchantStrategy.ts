// src/merchant/merchant-jwt.strategy.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { MerchantService } from '../merchant/merchant.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MerchantJwtStrategy extends PassportStrategy(Strategy, 'merchant-jwt') {
  constructor(
    private readonly merchantService: MerchantService,
    private readonly configService: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: any): Promise<any> {
    try {
      const user = await this.merchantService.findById(payload.sub);

      if (!user) {
        console.error(`Merchant not found for ID: ${payload.sub}`);
        throw new UnauthorizedException('User not found');
      }

      console.log('✅ Merchant JWT validated:', user.email);
      return { sub: user._id.toString(), role: user.role };
    } catch (error) {
      console.error('❌ Error validating JWT:', error);
      throw new UnauthorizedException('Invalid token');
    }
  }
}
