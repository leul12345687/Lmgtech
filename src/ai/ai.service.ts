import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import FormData from 'form-data';

@Injectable()
export class AiService implements OnModuleInit {
  private readonly logger = new Logger(AiService.name);
  private readonly AI_BASE_URL = 'https://ai-merchant-portal.onrender.com';

  constructor(private readonly httpService: HttpService) {}

  async onModuleInit() {
    this.logger.log('🚀 Waking AI at startup...');
    await this.ensureAIIsReady();
  }

  private async ensureAIIsReady() {
    const maxWaitTime = 3 * 60 * 1000;
    const start = Date.now();

    while (Date.now() - start < maxWaitTime) {
      try {
        const response = await firstValueFrom(
          this.httpService.get(`${this.AI_BASE_URL}/health`),
        );

        if (response.status === 200) {
          this.logger.log('✅ AI ready');
          return;
        }
      } catch {
        this.logger.log('⏳ AI booting...');
      }

      await new Promise((res) => setTimeout(res, 10000));
    }

    throw new Error('AI did not become ready.');
  }

  // ==============================
  // IMAGE VALIDATION
  // ==============================
  async validateImage(image: Express.Multer.File) {
    const formData = new FormData();

    formData.append('file', image.buffer, {
      filename: image.originalname,
      contentType: image.mimetype,
    });

    const response = await firstValueFrom(
      this.httpService.post(
        `${this.AI_BASE_URL}/validate-asset-image`,
        formData,
        {
          headers: formData.getHeaders(),
          maxBodyLength: Infinity,
          timeout: 120000,
        },
      ),
    );

    return response.data;
  }
  
// ==============================
// DEMAND PREDICTION
// ==============================
async getDemand(category: string) {
  const response = await firstValueFrom(
    this.httpService.get(`${this.AI_BASE_URL}/pre-upload-demand`, {
      params: { category },
      timeout: 120000,
    }),
  );

  const aiData = response.data;

  return {
    category: aiData.category,
    demandLevel: aiData.demand_level,
    predictedDemand: aiData.predicted_demand_value,
    recommendedAction: aiData.recommended_action,
    merchantNotification: aiData.merchant_notification,
    featureSnapshot: aiData.feature_snapshot,
  };
}}