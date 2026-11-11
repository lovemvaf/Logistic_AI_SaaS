import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

export interface SmsProvider {
  send(phone: string, message: string): Promise<boolean>;
}

@Injectable()
export class TwilioSmsProvider implements SmsProvider {
  private readonly logger = new Logger('TwilioSmsProvider');
  private readonly accountSid: string;
  private readonly authToken: string;
  private readonly fromPhone: string;

  constructor(private readonly httpService: HttpService) {
    this.accountSid = process.env.TWILIO_ACCOUNT_SID || '';
    this.authToken = process.env.TWILIO_AUTH_TOKEN || '';
    this.fromPhone = process.env.TWILIO_FROM_PHONE || '';
  }

  async send(phone: string, message: string): Promise<boolean> {
    if (!this.accountSid || !this.authToken) {
      this.logger.warn('Twilio credentials not configured, falling back to console');
      this.logger.log(`[SMS-FALLBACK] To: ${phone} | Message: ${message}`);
      return true;
    }

    try {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;

      const formData = new URLSearchParams();
      formData.append('To', phone);
      formData.append('From', this.fromPhone);
      formData.append('Body', message);

      await firstValueFrom(
        this.httpService.post(url, formData.toString(), {
          headers: {
            Authorization: `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        })
      );

      this.logger.log(`SMS sent to ${phone}`);
      return true;
    } catch (error: any) {
      this.logger.error(`Twilio error: ${error.message}`);
      return false;
    }
  }
}
