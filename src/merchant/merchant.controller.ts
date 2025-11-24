import {
  Controller,
  Post,
  Body,
  UploadedFile,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
  HttpCode,
  HttpStatus,
  Query,
  UseGuards,
  Get,
  Param,Logger,Put,Delete
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MerchantService } from './merchant.service';
import { ManagerJwtAuthGuard } from 'src/admin/AdminAuthguard';

@Controller('merchant')
export class MerchantController {
  private readonly logger = new Logger(MerchantController.name);

  constructor(private readonly merchantService: MerchantService) {}

  // ===========================================================
  // 🟢 REGISTER MERCHANT
  // ===========================================================
  @Post('register')
  @UseInterceptors(FileInterceptor('profilePictureFile'))
  @UsePipes(new ValidationPipe({ transform: true }))
  async register(
    @Body() body,
    @UploadedFile() file?: Express.Multer.File,
    @Query('lang') lang = 'en',
  ) {
    console.log('📤 [MerchantController.register] Incoming merchant registration request...');
    console.log('➡️ Request body:', body);
    if (file) {
      console.log('📸 Profile picture file received:', file.originalname);
    } else {
      console.log('⚠️ No profile picture provided.');
    }

    try {
      const result = await this.merchantService.register(
        { ...body, profilePictureFile: file },
        lang,
      );
      console.log('✅ [MerchantController.register] Merchant registration successful:', result.merchant?.email);
      return result;
    } catch (error) {
      console.error('❌ [MerchantController.register] Error during registration:', error.message);
      throw error;
    }
  }

  // ===========================================================
  // 🟡 LOGIN MERCHANT
  // ===========================================================
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ transform: true }))
  async login(@Body() body, @Query('lang') lang = 'en') {
    console.log('📤 [MerchantController.login] Login attempt for:', body.email);

    try {
      const result = await this.merchantService.login(body, lang);
      console.log('✅ [MerchantController.login] Login successful for:', body.email);
      return result;
    } catch (error) {
      console.error('❌ [MerchantController.login] Login failed for:', body.email, '| Reason:', error.message);
      throw error;
    }
  }

  // ===========================================================
  // 🟣 FETCH ALL MERCHANTS
  // ===========================================================
  @Get('all')
  @UseGuards(ManagerJwtAuthGuard)
  async getAllMerchants() {
    console.log('📡 [MerchantController.getAllMerchants] Fetching all merchants...');
    try {
      const merchants = await this.merchantService.findAll();
      console.log(`✅ [MerchantController.getAllMerchants] Found ${merchants.length} merchants.`);
      return merchants;
    } catch (error) {
      console.error('❌ [MerchantController.getAllMerchants] Failed to fetch merchants:', error.message);
      throw error;
    }
  }

  // ===========================================================
  // 🟣 FETCH SINGLE MERCHANT BY ID
  // ===========================================================
  @Get(':id')
  async getMerchantById(@Param('id') id: string) {
    console.log('📡 [MerchantController.getMerchantById] Fetching merchant by ID:', id);
    try {
      const merchant = await this.merchantService.findById(id);
      console.log('✅ [MerchantController.getMerchantById] Found merchant:', merchant?.email);
      return merchant;
    } catch (error) {
      console.error('❌ [MerchantController.getMerchantById] Error fetching merchant by ID:', id, '| Reason:', error.message);
      throw error;
    }
  }

   // 🟠 UPDATE MERCHANT (Admin only)
  // ===========================================================
  @Put('admin/update/:id')
  @UseGuards(ManagerJwtAuthGuard)
  @UseInterceptors(FileInterceptor('profilePictureFile'))
  async updateMerchant(
    @Param('id') id: string,
    @Body() updateData,
    @UploadedFile() file?: Express.Multer.File,
    @Query('lang') lang = 'en',
  ) {
    this.logger.log(`✏️ Updating merchant: ${id}`);
    return this.merchantService.updateMerchant(id, updateData, file, lang);
  }

  // ===========================================================
  // 🔴 DELETE MERCHANT (Admin only)
  // ===========================================================
  @Delete(':id')
  @UseGuards(ManagerJwtAuthGuard)
  async deleteMerchant(@Param('id') id: string) {
    this.logger.log(`🗑️ Deleting merchant: ${id}`);
    return this.merchantService.deleteMerchant(id);
  }

}
