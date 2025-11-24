// ================= CUSTOMER PROFILE CONTROLLER =================

import {
  Controller,
  Get,
  Patch,
  Req,
  UseGuards,
  UploadedFile,
  UseInterceptors,
  Body,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';

import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CustomerJwtAuthGuard } from '../customer/customerAuthGuard';
import { CustomerOperationsService } from './gettingandupdatingprofile.service';

@Controller('customer')
export class CustomerOperationsController {
  private readonly logger = new Logger(CustomerOperationsController.name);

  constructor(private readonly customerOpsService: CustomerOperationsService) {}

  // =====================================================
  // 1️⃣ GET CUSTOMER PROFILE
  // =====================================================
  @Get('profile')
  @UseGuards(CustomerJwtAuthGuard)
  async getMyProfile(@Req() req) {
    try {
      const customerId = req.user.sub;
      return await this.customerOpsService.getMyProfile(customerId);
    } catch (error) {
      this.logger.error('❌ Failed to fetch profile:', error);
      throw new InternalServerErrorException('Failed to fetch profile.');
    }
  }

  // =====================================================
  // 2️⃣ UPDATE CUSTOMER PROFILE
  // =====================================================
  @Patch('profile')
  @UseGuards(CustomerJwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('profileImage', {
      storage: memoryStorage(),
      fileFilter: (req, file, cb) => {
        if (!file.originalname.match(/\.(jpg|jpeg|png)$/i)) {
          return cb(
            new BadRequestException(
              'Only JPG, JPEG, or PNG image formats allowed!',
            ),
            false,
          );
        }
        cb(null, true);
      },
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async updateMyProfile(
    @Req() req,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: any,
  ) {
    this.logger.log('➡️ PATCH /customer/profile called');
    this.logger.log('📌 Body:', body);
    this.logger.log(
      '📌 File:',
      file ? { name: file.originalname, size: file.size } : 'No file uploaded',
    );

    try {
      const customerId = req.user.sub;
      return await this.customerOpsService.updateMyProfile(
        customerId,
        body,
        file,
      );
    } catch (error) {
      this.logger.error('❌ Update profile error:', error);
      throw new InternalServerErrorException('Failed to update profile.');
    }
  }
}
