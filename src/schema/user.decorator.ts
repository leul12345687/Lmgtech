// src/decorators/user.decorator.ts

import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { User } from './user.schema'; // Import your base User model/interface

/**
 * Custom parameter decorator to retrieve the authenticated user from the request object.
 * * The JWT strategy or Guard (like MerchantJwtAuthGuard) attaches the user payload 
 * to `request.user`.
 * * Usage:
 * @User() user: User             // Returns the entire user object
 * @User('email') email: string   // Returns the user's email field
 * @User('_id') userId: Types.ObjectId // Returns the user's ID
 */
export const UUser = createParamDecorator(
  (data: string, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user; // The user object attached by the AuthGuard

    if (!user) {
        // This should not happen if the AuthGuard is correctly applied and active,
        // but it's a good practice for safety.
        return null;
    }
    
    // If a specific key is passed (e.g., '@User("email")'), return only that property.
    if (data) {
      return user[data];
    }
    
    // If no key is passed, return the entire user object.
    return user as User;
  },
);