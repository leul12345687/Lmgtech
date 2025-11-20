import { Injectable, Logger } from '@nestjs/common';
import africastalking from 'africastalking';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private africastalking: any;
  private sms: any;

  constructor() {
    this.africastalking = africastalking({
      apiKey: process.env.AFRICASTALKING_API_KEY!,
      username: process.env.AFRICASTALKING_USERNAME!,
    });

    this.sms = this.africastalking.SMS;
  }

  async sendSms(to: string | string[], message: string) {
    try {
      const response = await this.sms.send({
        to: Array.isArray(to) ? to : [to],
        message,
        from: 'Sandbox', // Sender ID
      });
      this.logger.log(`📲 SMS sent successfully: ${JSON.stringify(response)}`);
    } catch (error) {
      this.logger.error('❌ Failed to send SMS', error);
    }
  }
}
