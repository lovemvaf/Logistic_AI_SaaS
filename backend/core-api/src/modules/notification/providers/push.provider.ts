import { Injectable, Logger } from '@nestjs/common';

export interface PushProvider {
  send(userId: string, title: string, body: string): Promise<boolean>;
}

@Injectable()
export class ConsolePushProvider implements PushProvider {
  private readonly logger = new Logger('ConsolePushProvider');

  async send(userId: string, title: string, body: string): Promise<boolean> {
    this.logger.log(`[PUSH] User: ${userId} | Title: ${title} | Body: ${body}`);
    return true;
  }
}
