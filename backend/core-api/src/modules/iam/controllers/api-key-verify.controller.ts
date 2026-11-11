import { Body, Controller, Headers, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import * as crypto from 'crypto';
import { PrismaService } from '../../../core/prisma/prisma.service';

/**
 * Internal endpoint used by the API gateway to validate `X-API-Key` values.
 *
 * Keys are high-entropy random strings, so a SHA-256 digest is sufficient and
 * allows a direct indexed lookup (unlike bcrypt, which would require scanning
 * every key).
 */
@ApiTags('API Keys')
@Controller('api-keys')
export class ApiKeyVerifyController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('verify')
  async verify(
    @Body() body: { key?: string },
    @Headers('x-api-key') headerKey?: string,
  ): Promise<{ valid: boolean; tenantId?: string; scopes?: string[] }> {
    const rawKey = body?.key || headerKey;
    if (!rawKey) {
      return { valid: false };
    }

    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    // Gateway API-key check occurs prior to tenant context; run under platform bypass.
    const record = await this.prisma.runAsPlatform((db) =>
      db.tenantApiKey.findUnique({
        where: { keyHash },
        include: { tenant: true },
      }),
    );

    if (!record || record.revokedAt || record.deletedAt) {
      return { valid: false };
    }
    if (record.tenant?.status !== 'ACTIVE') {
      return { valid: false };
    }

    return {
      valid: true,
      tenantId: record.tenantId,
      scopes: record.scopes,
    };
  }
}
