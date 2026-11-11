import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

export interface PushProvider {
  send(userId: string, title: string, body: string): Promise<boolean>;
}

@Injectable()
export class FcmPushProvider implements PushProvider {
  private readonly logger = new Logger('FcmPushProvider');
  private readonly serviceAccountKey: string;

  constructor(private readonly httpService: HttpService) {
    this.serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '';
  }

  async send(userId: string, title: string, body: string): Promise<boolean> {
    if (!this.serviceAccountKey) {
      this.logger.warn('Firebase credentials not configured, falling back to console');
      this.logger.log(`[PUSH-FALLBACK] User: ${userId} | Title: ${title} | Body: ${body}`);
      return true;
    }

    try {
      const accessToken = await this.getAccessToken();

      await firstValueFrom(
        this.httpService.post(
          'https://fcm.googleapis.com/v1/projects/smartlogi/messages:send',
          {
            message: {
              token: userId,
              notification: { title, body },
              android: { priority: 'high' },
              apns: { headers: { 'apns-priority': '10' } },
            },
          },
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          }
        )
      );

      this.logger.log(`Push sent to user ${userId}: ${title}`);
      return true;
    } catch (error: any) {
      this.logger.error(`FCM error: ${error.message}`);
      return false;
    }
  }

  private async getAccessToken(): Promise<string> {
    try {
      const serviceAccount = JSON.parse(this.serviceAccountKey);
      const now = Math.floor(Date.now() / 1000);

      const jwtPayload = {
        iss: serviceAccount.client_email,
        scope: 'https://www.googleapis.com/auth/firebase.messaging',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
      };

      const response = await firstValueFrom(
        this.httpService.post(
          'https://oauth2.googleapis.com/token',
          new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: this.signJwt(jwtPayload, serviceAccount.private_key),
          }).toString(),
          {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          }
        )
      );

      return response.data.access_token;
    } catch (error: any) {
      this.logger.error(`Failed to get FCM access token: ${error.message}`);
      throw error;
    }
  }

  private signJwt(payload: any, privateKey: string): string {
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.createSign('RSA-SHA256').update(`${header}.${body}`).sign(privateKey, 'base64url');
    return `${header}.${body}.${signature}`;
  }
}
