import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import FormData from 'form-data';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly AI_BASE_URL = 'https://new-ai-merchant-portal-fqhw.onrender.com';

  constructor(private readonly httpService: HttpService) {}

  // ==============================
  // SAFE HTTP CALL WRAPPER
  // ==============================
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
        this.logger.error('❌ AI service unavailable after retries');
        return null;
      }

      await new Promise((res) => setTimeout(res, 2000));
    }
  }

  // ✅ Add this line (fixes TS error)
  return null;
}
  // ==============================
  // OPTIONAL: NON-BLOCKING WARMUP
  // ==============================
  async warmUpAI() {
    this.safeRequest(async () => {
      const res = await firstValueFrom(
        this.httpService.get(`${this.AI_BASE_URL}/health`, { timeout: 5000 }),
      );
      this.logger.log('✅ AI warmed up');
      return res;
    });
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

    const result = await this.safeRequest(async () => {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.AI_BASE_URL}/validate-asset-image`,
          formData,
          {
            headers: formData.getHeaders(),
            maxBodyLength: Infinity,
            timeout: 15000, // shorter timeout
          },
        ),
      );
      return response.data;
    });

    // fallback response (VERY IMPORTANT)
    if (!result) {
      return {
        valid: false,
        message: 'AI service unavailable, try again later',
      };
    }

    return result;
  }

  // ==============================
  // DEMAND PREDICTION
  // ==============================
  async getDemand(category: string) {
    const result = await this.safeRequest(async () => {
      const response = await firstValueFrom(
        this.httpService.get(`${this.AI_BASE_URL}/pre-upload-demand`, {
          params: { category },
          timeout: 15000,
        }),
      );
      return response.data;
    });

    // fallback response
    if (!result) {
      return {
        category,
        demandLevel: 'UNKNOWN',
        predictedDemand: 0,
        recommendedAction: 'Try again later',
        merchantNotification: 'AI service temporarily unavailable',
        featureSnapshot: {},
      };
    }

    return {
      category: result.category,
      demandLevel: result.demand_level,
      predictedDemand: result.predicted_demand_value,
      recommendedAction: result.recommended_action,
      merchantNotification: result.merchant_notification,
      featureSnapshot: result.feature_snapshot,
    };
  }
}