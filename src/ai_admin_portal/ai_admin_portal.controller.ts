import { Controller, Get, Post } from '@nestjs/common';
import { AiAdminService } from './ai_admin_portal.service';

@Controller('admin/ai')
export class AiAdminController {

  constructor(private readonly aiAdminService: AiAdminService) {}

  // ==========================
  // Health Check (Optional)
  // ==========================
  @Get('health')
  async healthCheck() {
    return {
      message: 'AI Admin Service is running'
    };
  }

  // ==========================
  // Merchant Risk
  // ==========================
  @Get('merchant-risk')
  async getMerchantRisk() {
    return await this.aiAdminService.getMerchantRisk();
  }

  // ==========================
  // Fraud Detection
  // ==========================
  @Get('fraud-detection')
  async getFraudDetection() {
    return await this.aiAdminService.getFraudDetection();
  }

  // ==========================
  // System Analytics
  // ==========================
  @Get('analytics')
  async getAnalytics() {
    return await this.aiAdminService.getAnalytics();
  }

  // ==========================
  // Retrain Merchant Model
  // ==========================
  @Post('retrain-merchant')
  async retrainMerchantModel() {
    return await this.aiAdminService.retrainMerchantModel();
  }

  // ==========================
  // Retrain Fraud Model
  // ==========================
  @Post('retrain-fraud')
  async retrainFraudModel() {
    return await this.aiAdminService.retrainFraudModel();
  }
}