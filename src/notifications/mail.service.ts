import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MailService {
  private transporter;

  constructor(private config: ConfigService) {
    // Create transporter
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: this.config.get('GMAIL_USER'), // Your Gmail
        pass: this.config.get('GMAIL_PASS'), // 16-digit App Password
      },
    });
  }

  async sendMail(to: string, subject: string, text: string, html?: string) {
    const info = await this.transporter.sendMail({
      from: `"MyApp" <${this.config.get('GMAIL_USER')}>`,
      to,
      subject,
      text,
      html,
    });

    return info;
  }
}
