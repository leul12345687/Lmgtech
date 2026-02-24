import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import FormData from 'form-data';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly AI_BASE_URL = process.env.AI_BASE_URL;

  constructor(private readonly httpService: HttpService) {}

  // ==========================================
  // 🟢 Merchant Financial Information
  // ==========================================
  async getMerchantIncome(merchantId: string) {
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.AI_BASE_URL}/merchant-income/${merchantId}`,
        ),
      );

      return response.data;
    } catch (error) {
      this.logger.error(
        `AI Income Service Error: ${error.message}`,
      );
      return null;
    }
  }

  // ==========================================
  // 🟢 Pre Upload Demand Prediction
  // ==========================================
  async getPreUploadDemand(category: string) {
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.AI_BASE_URL}/pre-upload-demand`,
          {
            params: { category },
          },
        ),
      );

      return response.data;
    } catch (error) {
      this.logger.warn(
        'AI Demand Service unavailable. Returning null.',
      );
      return null;
    }
  }

  // ==========================================
  // 🟢 AI Image Validation
  // ==========================================
  async validateAssetImage(image: Express.Multer.File) {
    try {
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
          },
        ),
      );

      return response.data;
    } catch (error) {
      this.logger.error(
        `AI Image Validation Error: ${error.message}`,
      );
      throw new Error('AI image validation failed');
    }
  }
}