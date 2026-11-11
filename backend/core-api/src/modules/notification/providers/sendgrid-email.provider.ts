import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

export interface EmailProvider {
  send(to: string, subject: string, body: string): Promise<boolean>;
}

@Injectable()
export class SendGridEmailProvider implements EmailProvider {
  private readonly logger = new Logger('SendGridEmailProvider');
  private readonly apiKey: string;
  private readonly fromEmail: string;

  constructor(private readonly httpService: HttpService) {
    this.apiKey = process.env.SENDGRID_API_KEY || '';
    this.fromEmail = process.env.SENDGRID_FROM_EMAIL || 'noreply@smartlogi.com';
  }

  async send(to: string, subject: string, body: string): Promise<boolean> {
    if (!this.apiKey) {
      this.logger.warn('SENDGRID_API_KEY not configured, falling back to console');
      this.logger.log(`[EMAIL-FALLBACK] To: ${to} | Subject: ${subject}`);
      return true;
    }

    try {
      await firstValueFrom(
        this.httpService.post(
          'https://api.sendgrid.com/v3/mail/send',
          {
            personalizations: [{ to: [{ email: to }] }],
            from: { email: this.fromEmail },
            subject,
            content: [{ type: 'text/plain', value: body }],
          },
          {
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
            },
          }
        )
      );

      this.logger.log(`Email sent to ${to}: ${subject}`);
      return true;
    } catch (error: any) {
      this.logger.error(`SendGrid error: ${error.message}`);
      return false;
    }
  }
}
