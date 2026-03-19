import {
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class AiService implements OnModuleInit {
  private readonly logger = new Logger(AiService.name);
  private AI_BASE_URL: string;

  constructor(private readonly httpService: HttpService) {}

  // ===================================================
  // 🚀 NON-BLOCKING STARTUP (SAFE)
  // ===================================================
  async onModuleInit() {
    const baseUrl = process.env.AI_BASE_URL;

    if (!baseUrl) {
      // ❗ DO NOT THROW → prevents crash
      this.logger.error('AI_BASE_URL is not defined. AI features disabled.');
      return;
    }

    this.AI_BASE_URL = baseUrl;
    this.logger.log(`AI Service initialized: ${this.AI_BASE_URL}`);

    // ✅ Non-blocking warmup (does NOT crash app)
    this.warmUpAI();
  }

  private async warmUpAI() {
    try {
      await firstValueFrom(
        this.httpService.get(`${this.AI_BASE_URL}/health`, {
          timeout: 5000,
        }),
      );
      this.logger.log('✅ AI service reachable');
    } catch (error: any) {
      this.logger.warn(
        `⚠️ AI not reachable at startup: ${error?.message}`,
      );
    }
  }

  // ===================================================
  // 🔁 SAFE REQUEST WRAPPER (NO CRASH)
  // ===================================================
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

    return null; // ✅ satisfies TypeScript
  }

  // ===================================================
  // 💰 MERCHANT FINANCIAL INFORMATION (SAFE)
  // ===================================================
  async getMerchantIncome(merchantId: string) {
    if (!this.AI_BASE_URL) {
      this.logger.warn('AI_BASE_URL not set. Returning fallback.');
      return this.getFallbackIncome();
    }

    const result = await this.safeRequest(async () => {
      this.logger.log(`Fetching AI data for merchant: ${merchantId}`);

      const response = await firstValueFrom(
        this.httpService.get(
          `${this.AI_BASE_URL}/merchant-income/${merchantId}`,
          { timeout: 15000 }, // ✅ shorter timeout
        ),
      );

      return response.data;
    });

    // ===================================================
    // ❗ FALLBACK (NO CRASH)
    // ===================================================
    if (!result) {
      return this.getFallbackIncome();
    }

    const aiData = result?.data ?? result;

    if (!aiData || aiData.status !== 'success') {
      this.logger.warn(`AI returned invalid response`);
      return this.getFallbackIncome();
    }

    const data = aiData.data ?? aiData;

    // ===================================================
    // ✅ NORMALIZED SAFE RESPONSE
    // ===================================================
    return {
      monthlyIncome: data?.monthly_income ?? 0,
      projectedCurrentMonth: data?.projected_current_month ?? 0,
      historicalMonthlyAverage: data?.historical_monthly_average ?? 0,
      trendSlope: data?.trend_slope ?? 0,
      yearlyIncome: data?.yearly_income ?? 0,
      predictedNextMonth: data?.predicted_next_month ?? 0,
      estimatedTaxYear: data?.estimated_tax_year ?? 0,
      profitAfterTax: data?.profit_after_tax ?? 0,
      monthsUsedForLearning: data?.months_used_for_learning ?? 0,
    };
  }

  // ===================================================
  // 🛟 FALLBACK RESPONSE (VERY IMPORTANT)
  // ===================================================
  private getFallbackIncome() {
    return {
      monthlyIncome: 0,
      projectedCurrentMonth: 0,
      historicalMonthlyAverage: 0,
      trendSlope: 0,
      yearlyIncome: 0,
      predictedNextMonth: 0,
      estimatedTaxYear: 0,
      profitAfterTax: 0,
      monthsUsedForLearning: 0,
    };
  }
}