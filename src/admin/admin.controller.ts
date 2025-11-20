import { 
    Controller, 
    Post, 
    Body, 
    UsePipes, 
    ValidationPipe, 
    HttpStatus, 
    HttpCode, 
    ForbiddenException 
} from '@nestjs/common';
// 🌟 NEW: Import the I18nLang decorator
import { I18nLang } from 'nestjs-i18n'; 

import { AdminService } from './admin.service';
import { User } from '../schema/user.schema'; 
import { IAdminLoginResponse } from './admin.service';

// Interface for login and registration payload (only email, password, fullName needed)
interface IAdminAuthBody {
    email: string;
    password: string;
    fullName?: string; // Optional for login
    phonenumber:number;
    address:string;

}interface IAAdminAuthBody {
    email: string;
    password: string;}

@Controller('admin') 
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ------------------------------------------------------------------
  // Public Endpoint: Login
  // ------------------------------------------------------------------
  // Route: POST /admin/login
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async login(
        @Body() payload: any,
        // 🌟 CAPTURE LANGUAGE: Extracts language code from Accept-Language header
        @I18nLang() lang: string 
    ): Promise<IAdminLoginResponse> {
        // 🌟 PASS LANGUAGE: Pass the captured 'lang' code to the service
        return this.adminService.login(payload, lang);
  }

  // ------------------------------------------------------------------
  // Restricted Endpoint: Admin Registration (Use with CAUTION)
  // ------------------------------------------------------------------
  // Route: POST /admin/register
  @Post('register') 
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async register(
        @Body() payload: IAdminAuthBody,
        // 🌟 CAPTURE LANGUAGE: Extracts language code from Accept-Language header
        @I18nLang() lang: string 
    ): Promise<User> {
    // Example of a basic security measure: 
    if (process.env.NODE_ENV === 'production') {
        throw new ForbiddenException('Admin registration is not allowed via public API in production.');
    }
    
    // 🌟 PASS LANGUAGE: Pass the captured 'lang' code to the service
    return this.adminService.registerAdmin(payload as any, lang);
  }
}
