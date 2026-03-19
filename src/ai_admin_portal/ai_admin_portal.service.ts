import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class AiAdminService implements OnModuleInit {
  private readonly logger = new Logger(AiAdminService.name);
  private readonly AI_BASE_URL = 'https://messi-tech-1.onrender.com';

  constructor(private httpService: HttpService) {}

  // ==========================
  // SAFE STARTUP CHECK (NON-BLOCKING)
  // ==========================
  async onModuleInit() {
    this.checkAIHealth();
  }

  private async checkAIHealth() {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.AI_BASE_URL}/`, { timeout: 5000 }),
      );

      this.logger.log(`✅ AI Status: ${response?.data?.status || 'OK'}`);
    } catch (error: any) {
      this.logger.warn(`⚠️ AI not reachable at startup: ${error?.message}`);
    }
  }

  // ==========================
  // SAFE REQUEST WRAPPER
  // ==========================
  private async safeRequest<T>(
    requestFn: () => Promise<T>,
    retries = 2,
  ): Promise<T | null> {
    for (let attempt = 1; attempt <= retries + 1; attempt++) {
      try {
        return await requestFn();
      } catch (error: any) {
        this.logger.warn(
          `⚠️ AI request failed (attempt ${attempt}): ${error?.message}`,
        );

        if (attempt > retries) {
          this.logger.error('❌ AI unavailable after retries');
          return null;
        }

        await new Promise((res) => setTimeout(res, 2000));
      }
    }

    return null;
  }

  // ==========================
  // MERCHANT RISK
  // ==========================
  async getMerchantRisk() {
    const result = await this.safeRequest(async () => {
      const response = await firstValueFrom(
        this.httpService.get(`${this.AI_BASE_URL}/merchant-risk`, {
          timeout: 10000,
        }),
      );
      return response.data;
    });

    return result ?? { message: 'AI unavailable', data: [] };
  }

  // ==========================
  // FRAUD DETECTION
  // ==========================
  async getFraudDetection() {
    const result = await this.safeRequest(async () => {
      const response = await firstValueFrom(
        this.httpService.get(`${this.AI_BASE_URL}/fraud-detection`, {
          timeout: 10000,
        }),
      );
      return response.data;
    });

    return result ?? { message: 'AI unavailable', data: [] };
  }

  // ==========================
  // ANALYTICS
  // ==========================
  async getAnalytics() {
    const result = await this.safeRequest(async () => {
      const response = await firstValueFrom(
        this.httpService.get(`${this.AI_BASE_URL}/analytics`, {
          timeout: 10000,
        }),
      );
      return response.data;
    });

    return result ?? { message: 'AI unavailable', data: {} };
  }

  // ==========================
  // RETRAIN MERCHANT MODEL
  // ==========================
  async retrainMerchantModel() {
    const result = await this.safeRequest(async () => {
      const response = await firstValueFrom(
        this.httpService.post(`${this.AI_BASE_URL}/retrain/merchant`, {}, {
          timeout: 15000,
        }),
      );
      return response.data;
    });

    return result ?? { message: 'AI unavailable' };
  }

  // ==========================
  // RETRAIN FRAUD MODEL
  // ==========================
  async retrainFraudModel() {
    const result = await this.safeRequest(async () => {
      const response = await firstValueFrom(
        this.httpService.post(`${this.AI_BASE_URL}/retrain/fraud`, {}, {
          timeout: 15000,
        }),
      );
      return response.data;
    });

    return result ?? { message: 'AI unavailable' };
  }
}