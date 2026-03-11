import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class AiAdminService implements OnModuleInit {

  private readonly logger = new Logger(AiAdminService.name);
  private AI_BASE_URL = 'https://messi-tech-1.onrender.com';

  constructor(private httpService: HttpService) {}

  // ==========================
  // Module Initialization
  // ==========================
  async onModuleInit() {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.AI_BASE_URL}/`)
      );

      this.logger.log(`AI Service Status: ${response.data.status}`);
    } catch (error) {
      this.logger.error('AI Service is not reachable', error.message);
    }
  }

  // ==========================
  // Get Merchant Risk
  // ==========================
  async getMerchantRisk() {
    const response = await firstValueFrom(
      this.httpService.get(`${this.AI_BASE_URL}/merchant-risk`, {
  timeout: 60000
})
    );

    return response.data;
  }

  // ==========================
  // Fraud Detection
  // ==========================
  async getFraudDetection() {
    const response = await firstValueFrom(
      this.httpService.get(`${this.AI_BASE_URL}/fraud-detection`, {
  timeout: 60000
})
    );

    return response.data;
  }

  // ==========================
  // System Analytics
  // ==========================
  async getAnalytics() {
    const response = await firstValueFrom(
      this.httpService.get(`${this.AI_BASE_URL}/analytics`, {
  timeout: 60000
})
    );

    return response.data;
  }

  // ==========================
  // Retrain Merchant Model
  // ==========================
  async retrainMerchantModel() {
    const response = await firstValueFrom(
      this.httpService.post(`${this.AI_BASE_URL}/retrain/merchant`)
    );

    return response.data;
  }

  // ==========================
  // Retrain Fraud Model
  // ==========================
  async retrainFraudModel() {
    const response = await firstValueFrom(
      this.httpService.post(`${this.AI_BASE_URL}/retrain/fraud`, {
  timeout: 60000
})
    );

    return response.data;
  }
}