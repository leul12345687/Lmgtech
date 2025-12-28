// src/chapa/chapa.service.ts
import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

export interface InitializePaymentParams {
  txRef: string;
  amount: number;
  currency?: 'ETB';
  customerEmail: string;
  customerFirstName: string;
  customerLastName?: string;
  customerPhone?: string;
  callbackUrl: string; // webhook endpoint
  returnUrl?: string;   // optional front-end redirect
  description?: string;
}

export interface InitializePaymentResult {
  checkoutUrl: string;
}

export interface VerifyTransactionResult {
  status: 'success' | 'pending' | 'failed';
  amount: number;
  currency: string;
  transactionId: string;
  paidAt: string;
  raw: any;
}

@Injectable()
export class ChapaService {
  private readonly logger = new Logger(ChapaService.name);
  private readonly baseUrl = 'https://api.chapa.co/v1/transaction';
  private readonly secretKey = process.env.CHAPA_SECRET_KEY!;
  private readonly http: AxiosInstance;

  private readonly MAX_TEST_AMOUNT = 1_000_000; // test mode limit

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
  // INITIALIZE PAYMENT → RETURNS CHECKOUT URL
  // ===================================================
  async initializePayment(params: InitializePaymentParams): Promise<InitializePaymentResult> {
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
      throw new BadRequestException(`Amount exceeds Chapa test limit (${this.MAX_TEST_AMOUNT} ETB)`);
    }

    const safeDescription = description?.slice(0, 50) ?? 'Booking payment';

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
        return_url: returnUrl, // optional → controls post-payment redirect

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

      this.logger.log(`Chapa checkout initialized: ${checkoutUrl}`);
      return { checkoutUrl };
    } catch (err: any) {
      this.logger.error('Chapa initialize failed', err?.response?.data || err);
      throw new InternalServerErrorException('Failed to initialize Chapa payment');
    }
  }

  // ===================================================
  // VERIFY PAYMENT (SOURCE OF TRUTH)
  // ===================================================
  async verifyTransaction(txRef: string): Promise<VerifyTransactionResult> {
    if (!txRef) throw new BadRequestException('txRef is required');

    try {
      const res = await this.http.get(`/verify/${txRef}`);
      const data = res?.data?.data;

      if (!data) {
        throw new InternalServerErrorException('Invalid verification response');
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
      this.logger.error('Chapa verification failed', err?.response?.data || err);
      throw new InternalServerErrorException('Failed to verify Chapa payment');
    }
  }

  // ===================================================
  // HELPER: FLOAT SAFE AMOUNT CHECK
  // ===================================================
  public amountsMatch(expected: number, received: number, tolerance = 0.5): boolean {
    return Math.abs(expected - received) <= tolerance;
  }
}
