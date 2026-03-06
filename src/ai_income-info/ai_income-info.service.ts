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

  this.AI_BASE_URL = baseUrl;

  this.logger.log(`AI Service initialized with base URL: ${this.AI_BASE_URl}`);

    // Optional: Test AI connection at startup
    try {
      await firstValueFrom(
        this.httpService.get(`${this.AI_BASE_URL}/health`, {
          timeout: 5000,
        }),
      );
      this.logger.log('AI service connection successful');
    } catch (error) {
      this.logger.warn(
        'AI service is not reachable during startup. Continuing...',
      );
    }
  }

  // ===================================================
  // 💰 Merchant Financial Information
  // ===================================================
  async getMerchantIncome(merchantId: string) {
    try {
      this.logger.log(
        `Fetching AI financial data for merchant: ${merchantId}`,
      );

      const response = await firstValueFrom(
        this.httpService.get(
          `${this.AI_BASE_URl}/merchant-income/${merchantId}`,
          {
            timeout: 120000,
          },
        ),
      );

      const aiData = response.data;

      if (!aiData || aiData.status !== 'success') {
        this.logger.warn(
          `AI returned unsuccessful response for merchant ${merchantId}`,
        );
        return null;
      }

      // 🔄 Normalize response (snake_case → camelCase)
      return {
        monthlyIncome: aiData.monthly_income,
        projectedCurrentMonth: aiData.projected_current_month,
        historicalMonthlyAverage: aiData.historical_monthly_average,
        trendSlope: aiData.trend_slope,
        yearlyIncome: aiData.yearly_income,
        predictedNextMonth: aiData.predicted_next_month,
        estimatedTaxYear: aiData.estimated_tax_year,
        profitAfterTax: aiData.profit_after_tax,
        monthsUsedForLearning: aiData.months_used_for_learning,
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