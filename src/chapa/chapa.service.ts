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
  private readonly secretKey = process.env.CHAPA_SECRET_KEY!;
  private readonly http: AxiosInstance;

  // Chapa TEST MODE limit
  private readonly MAX_TEST_AMOUNT = 1_000_000;

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
  // INITIALIZE PAYMENT
  // ===================================================
  async initializePayment(params: {
    txRef: string;
    amount: number;
    currency?: 'ETB';
    customerEmail: string;
    customerFirstName: string;
    customerLastName?: string;
    customerPhone?: string;
    callbackUrl: string;
    returnUrl: string;
    description?: string;
  }): Promise<{ checkoutUrl: string }> {
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

    if (!txRef || !customerEmail || amount <= 0) {
      throw new BadRequestException('Invalid Chapa parameters');
    }

    if (amount > this.MAX_TEST_AMOUNT) {
      throw new BadRequestException(
        `Amount exceeds Chapa test limit (${this.MAX_TEST_AMOUNT} ETB)`,
      );
    }

    const safeDescription =
      description?.slice(0, 50) ?? 'Booking payment';

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
          description: safeDescription,
        },

        meta: {
          bookingRef: txRef,
        },
      });

      const checkoutUrl = res?.data?.data?.checkout_url;
      if (!checkoutUrl) {
        this.logger.error('Invalid Chapa initialize response', res?.data);
        throw new InternalServerErrorException('Invalid Chapa response');
      }

      return { checkoutUrl };
    } catch (err: any) {
      this.logger.error(
        'Chapa initialize failed',
        err?.response?.data || err,
      );
      throw new InternalServerErrorException(
        'Failed to initialize Chapa payment',
      );
    }
  }

  // ===================================================
  // VERIFY PAYMENT (SOURCE OF TRUTH)
  // ===================================================
  async verifyTransaction(txRef: string) {
    if (!txRef) {
      throw new BadRequestException('txRef is required');
    }

    try {
      const res = await this.http.get(`/verify/${txRef}`);
      const data = res?.data?.data;

      if (!data) {
        throw new InternalServerErrorException(
          'Invalid verification response',
        );
      }

      return {
        status: data.status, // success | pending | failed
        amount: Number(data.amount),
        currency: data.currency,
        transactionId: data.id,
        paidAt: data.created_at,
        raw: data,
      };
    } catch (err: any) {
      this.logger.error(
        'Chapa verification failed',
        err?.response?.data || err,
      );
      throw new InternalServerErrorException(
        'Failed to verify Chapa payment',
      );
    }
  }
}
