// src/chapa/chapa.controller.ts
import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { BookingService } from '../booking/booking.service';

@Controller('chapa')
export class ChapaController {
  private readonly logger = new Logger(ChapaController.name);

  constructor(
    private readonly bookingService: BookingService,
  ) {}

  /* ===================================================
     CHAPA WEBHOOK ENDPOINT
     =================================================== */
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(@Body() payload: any) {
    this.logger.log('🔔 Chapa webhook received');
    this.logger.debug(`Payload: ${JSON.stringify(payload)}`);

    /**
     * Chapa usually sends:
     * payload.tx_ref OR payload.data.tx_ref
     */
    const txRef =
      payload?.tx_ref ||
      payload?.data?.tx_ref ||
      payload?.data?.reference;

    if (!txRef) {
      this.logger.warn('Webhook missing tx_ref');
      throw new BadRequestException('Missing tx_ref');
    }

    try {
      /**
       * 🔐 DO NOT TRUST WEBHOOK STATUS
       * Always verify with Chapa API
       */
      await this.bookingService.handleChapaWebhook(txRef);

      this.logger.log(`✅ Webhook processed successfully | txRef=${txRef}`);
      return { ok: true };
    } catch (err: any) {
      /**
       * ⚠️ IMPORTANT
       * Return 200 OK to stop Chapa retries,
       * but LOG the real error
       */
      this.logger.error(
        `❌ Webhook processing failed | txRef=${txRef}`,
        err?.stack || err,
      );
      return { ok: true };
    }
  }
}
