import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ProviderFactory } from '../providers/provider.factory';
import { NotificationGateway } from '../gateways/notification.gateway';
import { assertSafeWebhookUrl } from '../../../core/utils/webhook-url.util';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
    private readonly providerFactory: ProviderFactory,
    private readonly gateway: NotificationGateway,
  ) {}

  private async logNotification(userId: string, type: string, subject: string, body: string) {
    if (!userId) {
      this.logger.warn(`Cannot log notification: userId is missing (Type: ${type}, Subject: ${subject})`);
      return;
    }

    try {
      await this.prisma.getTenantDb().notification.create({
        data: {
          userId,
          type,
          title: subject,
          body,
        }
      });
    } catch (error: any) {
      this.logger.error(`Failed to save notification to DB: ${error.message}`);
    }
  }

  async sendEmail(to: string, subject: string, body: string, userId?: string) {
    this.logger.log(`Sending Email to ${to}: [${subject}]`);
    
    const emailProvider = this.providerFactory.getEmailProvider();
    const sent = await emailProvider.send(to, subject, body);
    
    if (userId) {
      await this.logNotification(userId, 'EMAIL', subject, body);
      this.gateway.sendToUser(userId, 'notification', {
        type: 'EMAIL',
        title: subject,
        body,
        timestamp: new Date().toISOString(),
      });
    }
    
    return { success: sent, provider: process.env.EMAIL_PROVIDER || 'console' };
  }

  async sendSms(phone: string, message: string, userId?: string) {
    this.logger.log(`Sending SMS to ${phone}: ${message}`);
    
    const smsProvider = this.providerFactory.getSmsProvider();
    const sent = await smsProvider.send(phone, message);
    
    if (userId) {
      await this.logNotification(userId, 'SMS', 'SMS Notification', message);
      this.gateway.sendToUser(userId, 'notification', {
        type: 'SMS',
        title: 'SMS Notification',
        body: message,
        timestamp: new Date().toISOString(),
      });
    }

    return { success: sent, provider: process.env.SMS_PROVIDER || 'console' };
  }

  async sendPush(userId: string, title: string, body: string) {
    this.logger.log(`Sending Push to User ${userId}: ${title}`);
    
    const pushProvider = this.providerFactory.getPushProvider();
    const sent = await pushProvider.send(userId, title, body);
    await this.logNotification(userId, 'PUSH', title, body);

    this.gateway.sendToUser(userId, 'notification', {
      type: 'PUSH',
      title,
      body,
      timestamp: new Date().toISOString(),
    });

    return { success: sent, provider: process.env.PUSH_PROVIDER || 'console' };
  }

  async triggerWebhook(url: string, event: string, payload: any, secretToken?: string) {
    await assertSafeWebhookUrl(String(url || ''));
    const webhookServiceUrl = process.env.WEBHOOK_SERVICE_URL || 'http://webhook-service:8092';
    const authToken = process.env.WEBHOOK_AUTH_TOKEN || '';
    this.logger.log(`Triggering external webhook: ${event} -> ${url}`);

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${webhookServiceUrl}/deliver`,
          {
            url,
            event,
            secretToken,
            body: payload,
          },
          authToken ? { headers: { Authorization: `Bearer ${authToken}` } } : undefined,
        )
      );
      return response.status >= 200 && response.status < 300;
    } catch (error: any) {
      this.logger.error(`Webhook delivery failed: ${error.message}`);
      return false;
    }
  }
}
