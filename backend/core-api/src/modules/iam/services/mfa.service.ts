import { Injectable } from '@nestjs/common';
import * as speakeasy from 'speakeasy';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../../core/prisma/prisma.service';

@Injectable()
export class MfaService {
  constructor(private readonly prisma: PrismaService) {}

  async generateSecret(userId: string): Promise<{ secret: string; otpauthUrl: string }> {
    const secret = speakeasy.generateSecret({
      name: 'SmartLogi (' + userId + ')',
      issuer: 'SmartLogi SaaS',
    });

    return {
      secret: secret.base32,
      otpauthUrl: secret.otpauth_url,
    };
  }

  async verifyToken(userId: string, token: string): Promise<boolean> {
    const mfaSecret = await (this.prisma as any).mfaSecret?.findUnique({
      where: { userId },
    });

    if (!mfaSecret || !mfaSecret.enabled) {
      return true;
    }

    return speakeasy.totp.verify({
      secret: mfaSecret.secret,
      encoding: 'base32',
      token,
      window: 1,
    });
  }

  async enableMfa(userId: string, secret: string, token: string): Promise<boolean> {
    const verified = speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: 1,
    });

    if (!verified) {
      return false;
    }

    const backupCodes = Array.from({ length: 8 }, () =>
      Math.random().toString(36).substring(2, 10)
    );

    await (this.prisma as any).mfaSecret.upsert({
      where: { userId },
      update: {
        secret,
        enabled: true,
        backupCodes: backupCodes.join(','),
      },
      create: {
        userId,
        secret,
        enabled: true,
        backupCodes: backupCodes.join(','),
      },
    });

    return true;
  }

  async disableMfa(userId: string): Promise<void> {
    await (this.prisma as any).mfaSecret?.update({
      where: { userId },
      data: { enabled: false },
    });
  }

  async isMfaEnabled(userId: string): Promise<boolean> {
    const mfaSecret = await (this.prisma as any).mfaSecret?.findUnique({
      where: { userId },
    });
    return mfaSecret?.enabled || false;
  }
}
