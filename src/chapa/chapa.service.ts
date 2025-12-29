import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

/* ===================================================
   TYPES
   =================================================== */

export interface InitializePaymentParams {
  txRef: string;
  amount: number;
  currency?: 'ETB';

  customerEmail: string;
  customerFirstName: string;
  customerLastName?: string;
  customerPhone?: string;

  /**
   * ⚠️ IMPORTANT
   * This is NOT a webhook.
   * It is a browser redirect URL after payment.
   */
  returnUrl?: string;

  /**
   * Chapa webhook URL
   * MUST ALSO be registered in Chapa Dashboard
   */
  webhookUrl: string;

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

/* ===================================================
   SERVICE
   =================================================== */

@Injectable()
export class ChapaService {
  private readonly logger = new Logger(ChapaService.name);

  private readonly baseUrl = 'https://api.chapa.co/v1/transaction';
  private readonly secretKey = process.env.CHAPA_SECRET_KEY!;
  private readonly http: AxiosInstance;

  private readonly MAX_TEST_AMOUNT = 1_000_000; // Chapa sandbox limit

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
      timeout: 15_000,
    });
  }

  /* ===================================================
     INITIALIZE PAYMENT
     =================================================== */
  async initializePayment(
    params: InitializePaymentParams,
  ): Promise<InitializePaymentResult> {
    const {
      txRef,
      amount,
      currency = 'ETB',
      customerEmail,
      customerFirstName,
      customerLastName = '',
      customerPhone,
      webhookUrl,
      returnUrl,
      description,
    } = params;

    /* ---------- VALIDATION ---------- */
    if (!txRef || !customerEmail || !customerFirstName) {
      throw new BadRequestException('Missing required Chapa parameters');
    }

    if (amount <= 0) {
      throw new BadRequestException('Invalid payment amount');
    }

    if (amount > this.MAX_TEST_AMOUNT) {
      throw new BadRequestException(
        `Amount exceeds Chapa test limit (${this.MAX_TEST_AMOUNT} ETB)`,
      );
    }

    if (!webhookUrl) {
      throw new BadRequestException('webhookUrl is required');
    }

    const safeDescription =
      description?.slice(0, 50) ?? 'Booking payment';

    /* ---------- API CALL ---------- */
    try {
      const response = await this.http.post('/initialize', {
        tx_ref: txRef,
        amount,
        currency,

        email: customerEmail,
        first_name: customerFirstName,
        last_name: customerLastName,
        phone_number: customerPhone,

        /**
         * ⚠️ Chapa does NOT guarantee webhook delivery
         * unless webhook is ALSO registered in dashboard
         */
        callback_url: webhookUrl,

        /**
         * Browser redirect after payment
         */
        return_url: returnUrl,

        customization: {
          title: 'Booking Payment',
          description: safeDescription,
        },

        meta: {
          bookingRef: txRef,
        },
      });

      const checkoutUrl = response?.data?.data?.checkout_url;

      if (!checkoutUrl) {
        this.logger.error(
          'Invalid Chapa initialize response',
          response?.data,
        );
        throw new InternalServerErrorException(
          'Chapa did not return checkout URL',
        );
      }

      this.logger.log(
        `✅ Chapa initialized | txRef=${txRef}`,
      );

      return { checkoutUrl };
    } catch (err: any) {
      this.logger.error(
        '❌ Chapa initialize failed',
        err?.response?.data || err,
      );
      throw new InternalServerErrorException(
        'Failed to initialize Chapa payment',
      );
    }
  }
async verifyTransaction(txRef: string): Promise<VerifyTransactionResult> {
  if (!txRef) throw new BadRequestException('txRef is required');

  try {
    const response = await this.http.get(`/verify/${txRef}`);
    const data = response?.data?.data;

    if (!data) throw new InternalServerErrorException('Invalid verification response');

    // Normalize status
    let status: 'success' | 'pending' | 'failed';
    switch (data.status.toLowerCase()) {
      case 'successful':
        status = 'success';
        break;
      case 'failed':
        status = 'failed';
        break;
      case 'pending':
      default:
        status = 'pending';
        break;
    }

    return {
      status,
      amount: Number(data.amount),
      currency: data.currency,
      transactionId: data.id,
      paidAt: data.paid_at || data.created_at,
      raw: data,
    };
  } catch (err: any) {
    this.logger.error('❌ Chapa verification failed', err?.response?.data || err);
    throw new InternalServerErrorException('Failed to verify Chapa payment');
  }
}

  /* ===================================================
     AMOUNT SAFETY CHECK
     =================================================== */
  public amountsMatch(
    expected: number,
    received: number,
    tolerance = 0.5,
  ): boolean {
    return Math.abs(expected - received) <= tolerance;
  }
}
