import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';

const VERIFY_TIMEOUT_MS = 3000;
const CACHE_TTL_MS = 60_000;
const CACHE_MAX_ENTRIES = 1000;

interface CacheEntry {
  valid: boolean;
  tenantId?: string;
  expiresAt: number;
}

/**
 * Validates `X-API-Key` when a client presents one.
 *
 * API keys are an additional credential for server-to-server integrations, not
 * a replacement for user authentication. Requests that use a Bearer token are
 * authenticated by the edge JWT check and by the target service's own guard.
 *
 * Crucially, a malformed key is always rejected. The previous implementation
 * accepted any non-empty value and skipped validation entirely when a Bearer
 * header was present.
 */
@Injectable()
export class ApiKeyMiddleware implements NestMiddleware {
  private readonly logger = new Logger(ApiKeyMiddleware.name);
  /**
   * Xác thực API key gọi tới service giữ endpoint `/api/v1/api-keys/verify`.
   * Khi core-api đã gom nhóm route IAM thì endpoint nằm ở core-api.
   */
  private readonly verifyUrl =
    (process.env.CORE_API_URL || 'http://core-api:8081') + '/api/v1/api-keys/verify';
  private readonly cache = new Map<string, CacheEntry>();

  async use(req: Request, res: Response, next: NextFunction) {
    const apiKey = req.headers['x-api-key'] as string;

    if (!apiKey) {
      return next();
    }

    let result: { valid: boolean; tenantId?: string };
    try {
      result = await this.verify(apiKey);
    } catch (error: any) {
      this.logger.error(`API key verification failed: ${error.message}`);
      res.status(503).json({
        statusCode: 503,
        message: 'API key verification is temporarily unavailable',
        error: 'Service Unavailable',
      });
      return;
    }

    if (!result.valid) {
      res.status(401).json({
        statusCode: 401,
        message: 'Invalid or revoked API key',
        error: 'Unauthorized',
      });
      return;
    }

    if (result.tenantId) {
      (req as any).apiKeyTenantId = result.tenantId;
    }
    next();
  }

  private async verify(apiKey: string): Promise<{ valid: boolean; tenantId?: string }> {
    const cacheKey = crypto.createHash('sha256').update(apiKey).digest('hex');
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return { valid: cached.valid, tenantId: cached.tenantId };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
    try {
      const response = await fetch(this.verifyUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: apiKey }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`API key verification upstream responded with ${response.status}`);
      }

      const body: any = await response.json();
      const result = { valid: body?.valid === true, tenantId: body?.tenantId };
      this.remember(cacheKey, result);
      return result;
    } finally {
      clearTimeout(timeout);
    }
  }

  private remember(key: string, result: { valid: boolean; tenantId?: string }) {
    if (this.cache.size >= CACHE_MAX_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest) this.cache.delete(oldest);
    }
    this.cache.set(key, { ...result, expiresAt: Date.now() + CACHE_TTL_MS });
  }
}
