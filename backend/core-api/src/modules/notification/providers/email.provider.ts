import { Injectable, Logger } from '@nestjs/common';

export interface EmailProvider {
  send(to: string, subject: string, body: string): Promise<boolean>;
}

@Injectable()
export class ConsoleEmailProvider implements EmailProvider {
  private readonly logger = new Logger('ConsoleEmailProvider');

  async send(to: string, subject: string, body: string): Promise<boolean> {
    this.logger.log(`[EMAIL] To: ${to} | Subject: ${subject} | Body: ${body}`);
    return true;
  }
}
