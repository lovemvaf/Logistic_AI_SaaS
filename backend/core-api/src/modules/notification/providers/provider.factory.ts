import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConsoleEmailProvider, EmailProvider } from './email.provider';
import { SendGridEmailProvider } from './sendgrid-email.provider';
import { ConsoleSmsProvider, SmsProvider } from './sms.provider';
import { TwilioSmsProvider } from './twilio-sms.provider';
import { ConsolePushProvider, PushProvider } from './push.provider';
import { FcmPushProvider } from './fcm-push.provider';

@Injectable()
export class ProviderFactory {
  private readonly logger = new Logger('ProviderFactory');
  private readonly emailProvider: EmailProvider;
  private readonly smsProvider: SmsProvider;
  private readonly pushProvider: PushProvider;

  constructor(private readonly httpService: HttpService) {
    const emailType = process.env.EMAIL_PROVIDER || 'console';
    const smsType = process.env.SMS_PROVIDER || 'console';
    const pushType = process.env.PUSH_PROVIDER || 'console';

    this.emailProvider = this.createEmailProvider(emailType);
    this.smsProvider = this.createSmsProvider(smsType);
    this.pushProvider = this.createPushProvider(pushType);

    this.logger.log(`Email provider: ${emailType}`);
    this.logger.log(`SMS provider: ${smsType}`);
    this.logger.log(`Push provider: ${pushType}`);

    if (emailType === 'console') {
      this.logger.warn('EMAIL_PROVIDER not set to "sendgrid" â€” emails will only be logged to console, not sent');
    }
    if (smsType === 'console') {
      this.logger.warn('SMS_PROVIDER not set to "twilio" â€” SMS will only be logged to console, not sent');
    }
    if (pushType === 'console') {
      this.logger.warn('PUSH_PROVIDER not set to "fcm" â€” push notifications will only be logged to console, not sent');
    }
  }

  getEmailProvider(): EmailProvider {
    return this.emailProvider;
  }

  getSmsProvider(): SmsProvider {
    return this.smsProvider;
  }

  getPushProvider(): PushProvider {
    return this.pushProvider;
  }

  private createEmailProvider(type: string): EmailProvider {
    switch (type) {
      case 'sendgrid':
        return new SendGridEmailProvider(this.httpService);
      default:
        return new ConsoleEmailProvider();
    }
  }

  private createSmsProvider(type: string): SmsProvider {
    switch (type) {
      case 'twilio':
        return new TwilioSmsProvider(this.httpService);
      default:
        return new ConsoleSmsProvider();
    }
  }

  private createPushProvider(type: string): PushProvider {
    switch (type) {
      case 'fcm':
        return new FcmPushProvider(this.httpService);
      default:
        return new ConsolePushProvider();
    }
  }
}
