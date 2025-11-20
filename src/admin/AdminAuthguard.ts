// src/Admin/admin/jwt-auth.guard.ts
import { Injectable, UnauthorizedException, ForbiddenException, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { User, UserRole } from '../schema/user.schema';

@Injectable()
export class ManagerJwtAuthGuard extends AuthGuard('manager-jwt') {
  
  handleRequest(err: any, user: any, info: any, context: ExecutionContext, status?: any): any {

    console.log('--- ManagerJwtAuthGuard ---');
    console.log('err:', err);
    console.log('user:', user);
    console.log('info:', info);

    if (err || !user) {
      if (info && info.message === 'jwt expired') {
        console.log('Token has expired');
        throw new UnauthorizedException('Token expired');
      }
      console.log('Invalid token detected');
      throw new UnauthorizedException('Invalid token');
    }

    console.log('Checking user role...');
    if (!(user instanceof Object)) {
      console.log('User is not an object:', user);
      throw new ForbiddenException('Unauthorized access');
    }

    if (!('role' in user)) {
      console.log('Role not found in user payload:', user);
      throw new ForbiddenException('Unauthorized access');
    }

    if (user.role !== UserRole.ADMIN && user.role !== 'admin') {
      console.log('User role is not admin:', user.role);
      throw new ForbiddenException('Unauthorized access');
    }

    console.log('User passed all checks:', user);
    return user as User;
  }

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | import('rxjs').Observable<boolean> {
    console.log('ManagerJwtAuthGuard canActivate called');
    return super.canActivate(context);
  }

  getRequest(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    console.log('Request object:', request.headers);
    return request;
  }
}