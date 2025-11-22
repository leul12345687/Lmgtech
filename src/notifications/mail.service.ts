import { Injectable } from '@nestjs/common';
import { Resend } from 'resend';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MailService {
  private resend: Resend;

  constructor(private config: ConfigService) {
    this.resend = new Resend(this.config.get('RESEND_API_KEY'));
  }

  async sendMail(to: string, subject: string, text: string, html?: string) {
    const from = this.config.get('RESEND_FROM') || 'noreply@resend.dev';

    const { data, error } = await this.resend.emails.send({
      from,
      to,
      subject,
      text,
      html,
    });

    if (error) {
      console.error('[Resend Email Error]', error);
      throw new Error('Failed to send email');
    }

    return data;
  }
}
