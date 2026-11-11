import { Injectable, Logger } from '@nestjs/common';

export interface SmsProvider {
  send(phone: string, message: string): Promise<boolean>;
}

@Injectable()
export class ConsoleSmsProvider implements SmsProvider {
  private readonly logger = new Logger('ConsoleSmsProvider');

  async send(phone: string, message: string): Promise<boolean> {
    this.logger.log(`[SMS] To: ${phone} | Message: ${message}`);
    return true;
  }
}
