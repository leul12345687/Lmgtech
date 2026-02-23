// src/chapa/chapa.controller.ts
import { Controller, Post, Body, HttpCode, HttpStatus, Logger,Get } from '@nestjs/common';
import { BookingService } from '../booking/booking.service';

@Controller('chapa')
export class ChapaController {
  private readonly logger = new Logger(ChapaController.name);

  constructor(private readonly bookingService: BookingService) {}

@Post('webhook')
@HttpCode(HttpStatus.OK)
async handleWebhook(@Body() payload: any) {
  this.logger.log('🔔 Chapa webhook received');
  this.logger.debug('Webhook payload: ' + JSON.stringify(payload));

  try {
    const result = await this.bookingService.handleChapaWebhook(payload);
    this.logger.log('Webhook processing result: ' + JSON.stringify(result));
    return { ok: true };
  } catch (err) {
    this.logger.error('Webhook processing failed', err?.message);
    return { ok: true };
  }
}

}

