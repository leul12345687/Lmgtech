// src/chapa/chapa.service.ts
import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

@Injectable()
export class ChapaService {
  private readonly logger = new Logger(ChapaService.name);

  private readonly baseUrl = 'https://api.chapa.co/v1/transaction';
  private readonly secretKey = process.env.CHAPA_SECRET_KEY;
  private readonly http: AxiosInstance;

  constructor() {
    if (!this.secretKey) {
      throw new Error('CHAPA_SECRET_KEY is not configured');
    }

    this.http = axios.create({
      baseURL: this.baseUrl,
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    });
  }

  // ===================================================
  // Initialize payment → returns checkout_url
  // ===================================================
  async initializePayment(params: {
    txRef: string;
    amount: number;
    currency?: 'ETB';
    customerEmail: string;
    customerFirstName: string;
    customerLastName?: string;
    customerPhone?: string;
    callbackUrl: string; // webhook
    returnUrl: string;   // frontend redirect
    description?: string;
  }) {
    const {
      txRef,
      amount,
      currency = 'ETB',
      customerEmail,
      customerFirstName,
      customerLastName = '',
      customerPhone,
      callbackUrl,
      returnUrl,
      description,
    } = params;

    if (!txRef || amount <= 0 || !customerEmail) {
      throw new BadRequestException('Invalid Chapa parameters');
    }

    try {
      const res = await this.http.post('/initialize', {
        tx_ref: txRef,
        amount,
        currency,

        email: customerEmail,
        first_name: customerFirstName,
        last_name: customerLastName,
        phone_number: customerPhone,

        callback_url: callbackUrl,
        return_url: returnUrl,

        customization: {
          title: 'Booking Payment',
          description: description ?? `Payment for booking ${txRef}`,
        },

        meta: {
          bookingRef: txRef,
        },
      });

      const checkoutUrl = res?.data?.data?.checkout_url;
      if (!checkoutUrl) {
        throw new InternalServerErrorException('Invalid Chapa response');
      }

      return { checkoutUrl };
    } catch (err) {
      this.logger.error('Chapa initialize failed', err?.response?.data || err);
      throw new InternalServerErrorException('Failed to initialize Chapa');
    }
  }

  // ===================================================
  // Verify payment (used by webhook or polling)
  // ===================================================
  async verifyTransaction(txRef: string) {
    if (!txRef) {
      throw new BadRequestException('txRef is required');
    }

    try {
      const res = await this.http.get(`/verify/${txRef}`);
      const data = res?.data?.data;
      if (!data) {
        throw new InternalServerErrorException('Invalid verification response');
      }

      return {
        status: data.status, // success | failed | pending
        amount: Number(data.amount),
        currency: data.currency,
        transactionId: data.id,
        paidAt: data.created_at,
        raw: data,
      };
    } catch (err) {
      this.logger.error('Chapa verification failed', err?.response?.data || err);
      throw new InternalServerErrorException('Failed to verify Chapa payment');
    }
  }
}
