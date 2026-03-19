import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class RecommendationService {
  private readonly logger = new Logger(RecommendationService.name);

  private readonly AI_SERVICE_URL =
    'https://your-ai-service.onrender.com';

  constructor(private readonly httpService: HttpService) {}

  // ==============================
  // SAFE REQUEST WRAPPER
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
          `⚠️ Recommendation AI failed (attempt ${attempt}): ${error?.message}`,
        );

        if (attempt > retries) {
          this.logger.error('❌ Recommendation AI unavailable');
          return null;
        }

        await new Promise((res) => setTimeout(res, 2000));
      }
    }

    return null;
  }

  // ==============================
  // PROPERTY RANKING
  // ==============================
  async rankProperties(userId: string, properties: any[]) {
    const result = await this.safeRequest(async () => {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.AI_SERVICE_URL}/recommend`,
          {
            user_id: userId,
            properties: properties,
          },
          { timeout: 8000 }, // shorter timeout
        ),
      );

      return response.data;
    });

    // ==============================
    // FALLBACK (CRITICAL)
    // ==============================
    if (!result) {
      this.logger.warn('⚠️ Using fallback ranking');

      // simple fallback: return original properties
      return {
        ranked: properties,
        source: 'fallback',
      };
    }

    return {
      ...result,
      source: 'ai',
    };
  }
}