import {
  Injectable,
  Logger,
  InternalServerErrorException,
  OnModuleInit,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class AiService implements OnModuleInit {
  private readonly logger = new Logger(AiService.name);
  private AI_BASE_URl: string;

  constructor(private readonly httpService: HttpService) {}

  // ===================================================
  // 🚀 Run When Module Initializes
  // ===================================================
  async onModuleInit() {
    const baseUrl = process.env.AI_BASE_URl;
    if (!baseUrl) {
      throw new Error('AI_BASE_URL is not defined in environment variables');
    }

    this.AI_BASE_URl = baseUrl;
    this.logger.log(`AI Service initialized with base URL: ${this.AI_BASE_URl}`);

    // Optional: Test AI connection at startup
    try {
      await firstValueFrom(
        this.httpService.get(`${this.AI_BASE_URl}/health`, { timeout: 5000 }),
      );
      this.logger.log('AI service connection successful');
    } catch (error) {
      this.logger.warn('AI service is not reachable during startup. Continuing...');
    }
  }

  // ===================================================
  // 💰 Merchant Financial Information
  // ===================================================
  async getMerchantIncome(merchantId: string) {
    try {
      this.logger.log(`Fetching AI financial data for merchant: ${merchantId}`);

      const response = await firstValueFrom(
        this.httpService.get(`${this.AI_BASE_URl}/merchant-income/${merchantId}`, {
          timeout: 120000,
        }),
      );

      // Handle AI response safely
      const aiData = response.data?.data ?? response.data;
      this.logger.log(`AI raw response: ${JSON.stringify(aiData)}`);

      if (!aiData || aiData.status !== 'success') {
        this.logger.warn(`AI returned unsuccessful response for merchant ${merchantId}`);
        return null; // Frontend will handle null safely
      }

      const data = aiData.data ?? aiData; // In case response wraps fields inside data

      // 🔄 Normalize response (snake_case → camelCase) with fallback values
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
    } catch (error) {
      this.logger.error(
        `AI Income Service Error for merchant ${merchantId}: ${error.message}`,
        error.stack,
      );

      throw new InternalServerErrorException(
        'Failed to retrieve financial information from AI service',
      );
    }
  }
}