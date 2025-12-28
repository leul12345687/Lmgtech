// src/chapa/chapa.controller.ts
import { Controller, Post, Body, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { BookingService } from '../booking/booking.service';

@Controller('chapa')
export class ChapaController {
  private readonly logger = new Logger(ChapaController.name);

  constructor(private readonly bookingService: BookingService) {}

  // 🔔 PUBLIC WEBHOOK ENDPOINT
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(@Body() payload: any) {
    this.logger.log('🔔 Chapa webhook received');
    this.logger.debug(JSON.stringify(payload));

    try {
      await this.bookingService.handleChapaWebhook(payload);
      return { ok: true };
    } catch (err) {
      this.logger.error('Webhook processing failed', err?.message);
      return { ok: true }; // ALWAYS 200
    }
  }
}
