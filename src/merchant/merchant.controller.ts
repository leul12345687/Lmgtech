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
  Param,
  Logger,
  Put,
  Delete,
  Req,
} from '@nestjs/common';
import { AiService } from '../ai_income-info/ai_income-info.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { MerchantService } from './merchant.service';
import { ManagerJwtAuthGuard } from 'src/admin/AdminAuthguard';
import { MerchantJwtAuthGuard } from './merchantAuthGuard';

@Controller('merchant')
export class MerchantController {
  private readonly logger = new Logger(MerchantController.name);

  constructor(
    private readonly merchantService: MerchantService,
    private readonly aiService: AiService,
  ) {}

  // ===========================================================
  // 🟢 REGISTER MERCHANT
  // ===========================================================

  @Post('register')
  @UseInterceptors(FileInterceptor('profilePictureFile'))
  @UsePipes(new ValidationPipe({ transform: true }))
  async register(
    @Body() body: any,
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

      console.log(
        '✅ [MerchantController.register] Merchant registration successful:',
        result.merchant?.email,
      );

      return result;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);

      console.error(
        '❌ [MerchantController.register] Error during registration:',
        message,
      );

      throw error;
    }
  }

  // ===========================================================
  // 🟡 LOGIN MERCHANT
  // ===========================================================

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ transform: true }))
  async login(@Body() body: any, @Query('lang') lang = 'en') {
    console.log('📤 [MerchantController.login] Login attempt for:', body.email);

    try {
      const result = await this.merchantService.login(body, lang);

      console.log(
        '✅ [MerchantController.login] Login successful for:',
        body.email,
      );

      return result;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);

      console.error(
        '❌ [MerchantController.login] Login failed for:',
        body.email,
        '| Reason:',
        message,
      );

      throw error;
    }
  }

  // ===========================================================
  // 🟢 GET FINANCIAL INFO
  // ===========================================================

  @Get('financial-info')
  @UseGuards(MerchantJwtAuthGuard)
  async getFinancialInfo(@Req() req: any) {
    const merchantId = req.user.sub;

    const financialInfo = await this.aiService.getMerchantIncome(merchantId);

    return { success: true, financialInfo: financialInfo ?? {} };
  }

  // ===========================================================
  // 🟣 FETCH ALL MERCHANTS
  // ===========================================================

  @Get('all')
  @UseGuards(ManagerJwtAuthGuard)
  async getAllMerchants() {
    this.logger.log(
      '📡 [MerchantController.getAllMerchants] Fetching all merchants...',
    );

    try {
      const merchants = await this.merchantService.findAll();

      this.logger.log(
        `✅ [MerchantController.getAllMerchants] Found ${merchants.length} merchants. Fetching financial info...`,
      );

      const merchantsWithFinancial = await Promise.all(
        merchants.map(async (m: any) => {
          try {
            const plain =
              'toObject' in m && typeof m.toObject === 'function'
                ? m.toObject()
                : { ...m };

            const merchantId =
              (plain.id ?? plain._id ?? plain._doc?.id)?.toString?.() ||
              (plain._id ?? plain.id)?.toString?.();

            const financialInfo = merchantId
              ? await this.aiService.getMerchantIncome(merchantId)
              : await this.aiService.getMerchantIncome(plain.email ?? '');

            return { ...plain, financialInfo: financialInfo ?? {} };
          } catch (err: unknown) {
            const idOrEmail =
              m._id || m.id || m.email || 'unknown';

            const message =
              err instanceof Error ? err.message : String(err);

            this.logger.error(
              `❌ [MerchantController.getAllMerchants] Failed to fetch financial info for merchant ${idOrEmail}: ${message}`,
            );

            const fallback =
              'toObject' in m && typeof m.toObject === 'function'
                ? m.toObject()
                : { ...m };

            return { ...fallback, financialInfo: {} };
          }
        }),
      );

      return merchantsWithFinancial;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);

      this.logger.error(
        `❌ [MerchantController.getAllMerchants] Failed to fetch merchants: ${message}`,
      );

      throw error;
    }
  }

  // ===========================================================
  // 🟣 FETCH SINGLE MERCHANT
  // ===========================================================

  @Get(':id')
  async getMerchantById(@Param('id') id: string) {
    console.log(
      '📡 [MerchantController.getMerchantById] Fetching merchant by ID:',
      id,
    );

    try {
      const merchant = await this.merchantService.findById(id);

      console.log(
        '✅ [MerchantController.getMerchantById] Found merchant:',
        merchant?.email,
      );

      return merchant;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);

      console.error(
        '❌ [MerchantController.getMerchantById] Error fetching merchant by ID:',
        id,
        '| Reason:',
        message,
      );

      throw error;
    }
  }

  // ===========================================================
  // 🟠 UPDATE MERCHANT
  // ===========================================================

  @Put('admin/update/:id')
  @UseGuards(ManagerJwtAuthGuard)
  @UseInterceptors(FileInterceptor('profilePictureFile'))
  async updateMerchant(
    @Param('id') id: string,
    @Body() updateData: any,
    @UploadedFile() file?: Express.Multer.File,
    @Query('lang') lang = 'en',
  ) {
    this.logger.log(`✏️ Updating merchant: ${id}`);

    return this.merchantService.updateMerchant(id, updateData, file, lang);
  }

  // ===========================================================
  // 🔴 DELETE MERCHANT
  // ===========================================================

  @Delete(':id')
  @UseGuards(ManagerJwtAuthGuard)
  async deleteMerchant(@Param('id') id: string) {
    this.logger.log(`🗑️ Deleting merchant: ${id}`);

    return this.merchantService.deleteMerchant(id);
  }
}