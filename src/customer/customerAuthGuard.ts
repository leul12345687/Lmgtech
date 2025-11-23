import { Injectable, UnauthorizedException, ForbiddenException, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class CustomerJwtAuthGuard extends AuthGuard('customer-jwt') {
  
  handleRequest(err: any, user: any, info: any, context: ExecutionContext, status?: any): any {

    console.log('--- CustomerJwtAuthGuard ---');
    console.log('err:', err);
    console.log('user:', user);
    console.log('info:', info);

    if (err || !user) {
      if (info && info.message === 'jwt expired') {
        throw new UnauthorizedException('Token expired');
      }
      throw new UnauthorizedException('Invalid token');
    }

    if (!user.role || (user.role !== 'customer' && user.role !== 'customer')) {
      throw new ForbiddenException('Unauthorized access');
    }

    return user;
  }
}
