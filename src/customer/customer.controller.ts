// src/customer/customer.controller.ts (Consolidated Controller - No DTO Imports)

import {
  Controller, Post, Get, Patch, Delete, Body, UsePipes, ValidationPipe, HttpStatus, HttpCode,
  UseInterceptors, UploadedFile, BadRequestException, Headers, Logger, UseGuards, Param,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CustomerService } from './customer.service';
import { ManagerJwtAuthGuard } from 'src/admin/AdminAuthguard';

// Define simplified interfaces locally for type clarity in the controller (optional, but better than 'any')
interface IRegisterBody {
  email: string;
  password: string;
  fullName: string;
  phonenumber: number;
  acountnumber: number;
  address: string;
}

@Controller('customer')
export class CustomerController {
  private readonly logger = new Logger(CustomerController.name);

  constructor(private readonly customerService: CustomerService) {}

  // ===========================================================
  // 🔑 PUBLIC ROUTES
  // ===========================================================

  // 🟢 1. REGISTER CUSTOMER
  @Post('register')
  @UseInterceptors(FileInterceptor('profilePictureFile', { storage: memoryStorage() }))
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async register(
    @Body() userPayload: IRegisterBody, // Using local interface or 'any'
    @UploadedFile() file: Express.Multer.File,
    @Headers('accept-language') langHeader?: string,
  ) {
    const lang = langHeader || 'en';
    this.logger.log('📥 [PUBLIC] Register endpoint hit');

    if (!file) {
      this.logger.warn('⚠️ No profile picture provided.');
    }

    try {
      const registrationData: any = { // Use 'any' to match service payload structure
        ...userPayload,
        profilePictureFile: file,
      };

      return await this.customerService.register(registrationData, lang);
    } catch (error) {
      this.logger.error('❌ Error during registration:', error.message);
      throw error;
    }
  }

  // 🟡 2. LOGIN CUSTOMER
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async login(
    @Body() userPayload: any, // Using 'any' for the login payload
    @Headers('accept-language') langHeader?: string,
  ) {
    const lang = langHeader || 'en';
    this.logger.log('🔑 [PUBLIC] Login endpoint hit');

    return await this.customerService.login(userPayload, lang);
  }
  
  // ===========================================================
  // 🛡️ ADMIN PROTECTED ROUTES
  // ===========================================================
  
  // 🛑 3. RETRIEVE ALL CUSTOMERS
  @Get('all')
  @UseGuards(ManagerJwtAuthGuard) // 🔒 Protected by Admin/Manager Guard
  async getAllCustomers(@Headers('accept-language') langHeader?: string) {
    const lang = langHeader || 'en';
    this.logger.log('📥 [ADMIN] Retrieving all customers.');
    
    return await this.customerService.findAllCustomers(lang);
  }

  // 🛑 4. UPDATE CUSTOMER (General Update/Password Reset)
  @Patch('admin/customers/:id')
  @UseGuards(ManagerJwtAuthGuard) // 🔒 Protected by Admin/Manager Guard
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true })) // Keep validation for basic checks
  async updateCustomer(
    @Param('id') customerId: string,
    @Body() updateData: any, // Using 'any' for the update payload
    @Headers('accept-language') langHeader?: string,
  ) {
    const lang = langHeader || 'en';
    this.logger.log(`✍️ [ADMIN] Updating customer: ${customerId}`);
    
    if (Object.keys(updateData).length === 0) {
        throw new BadRequestException('Update data cannot be empty.');
    }
    
    // Service handles hashing 'newPassword' if included
    return await this.customerService.updateCustomerByAdmin(
        customerId,
        updateData,
        lang,
    );
  }

  // 🛑 5. DELETE CUSTOMER
  @Delete(':id')
  @UseGuards(ManagerJwtAuthGuard) // 🔒 Protected by Admin/Manager Guard
  async deleteCustomer(
    @Param('id') customerId: string,
    @Headers('accept-language') langHeader?: string,
  ) {
    const lang = langHeader || 'en';
    this.logger.warn(`🗑️ [ADMIN] Deleting customer: ${customerId}`);

    return await this.customerService.deleteCustomerByAdmin(customerId, lang);
  }
}