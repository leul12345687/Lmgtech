
// src/Admin/admin/jwt-auth.guard.ts
import { Injectable, UnauthorizedException, ForbiddenException, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { User,UserRole} from '../schema/user.schema';
@Injectable()
export class MerchantJwtAuthGuard extends AuthGuard('merchant-jwt') {
    handleRequest(err: any, user: any, info: any, context: ExecutionContext, status?: any): any {
        if (err || !user) {
            if (info && info.message === 'jwt expired') {
                throw new UnauthorizedException('Token expired');
            }
            console.log("invalid token", err);
            throw new UnauthorizedException('Invalid token');
        }

        if (!(user instanceof Object) || !('role' in user) || user.role !== UserRole.MERCHANT) {
            throw new ForbiddenException('Unauthorized access');
        }
        return user as User;
    }

    canActivate(context: ExecutionContext): boolean | Promise<boolean> | import('rxjs').Observable<boolean> {
        return super.canActivate(context);
    }

    getRequest(context: ExecutionContext) {
        const request = context.switchToHttp().getRequest();
        return request;
    }
}