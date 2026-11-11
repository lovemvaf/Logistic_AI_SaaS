import { Injectable, NestMiddleware, Logger, OnModuleDestroy } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { RATE_LIMIT, REDIS_CONFIG } from '../config/services.config';
import * as Redis from 'ioredis';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

@Injectable()
export class RateLimitMiddleware implements NestMiddleware, OnModuleDestroy {
  private readonly logger = new Logger(RateLimitMiddleware.name);
  private readonly windowMs = RATE_LIMIT.windowMs;
  private readonly maxRequests = RATE_LIMIT.global;
  private readonly fallbackClients: Map<string, RateLimitEntry> = new Map();
  private redisClient: Redis.Redis | null = null;
  private useRedis = false;

  constructor() {
    this.initRedis();
    if (!this.useRedis) {
      setInterval(() => this.cleanupFallback(), this.windowMs);
    }
  }

  private initRedis() {
    try {
      this.redisClient = new Redis.Redis({
        host: REDIS_CONFIG.host,
        port: REDIS_CONFIG.port,
        password: REDIS_CONFIG.password,
        maxRetriesPerRequest: 1,
        retryStrategy: (times) => {
          // Cho thêm cơ hội khi Redis khởi động chậm hơn gateway
          // (trước đây từ bỏ sau 2 lần => rơi về in-memory vĩnh viễn).
          if (times > 8) return null;
          return Math.min(1000 * times, 5000);
        },
        lazyConnect: true,
      });

      this.redisClient.on('error', (err) => {
        this.logger.warn(`Redis connection failed, falling back to in-memory: ${err.message}`);
        this.useRedis = false;
      });

      this.redisClient.on('connect', () => {
        this.logger.log('Redis connected for rate limiting');
        this.useRedis = true;
      });

      this.redisClient.connect().catch((err) => {
        this.logger.warn(`Could not connect to Redis for rate limiting: ${err.message}. Using in-memory fallback.`);
        this.useRedis = false;
      });
    } catch (err) {
      this.logger.warn(`Redis not available for rate limiting: ${err}. Using in-memory fallback.`);
      this.useRedis = false;
    }
  }

  async use(req: Request, res: Response, next: NextFunction) {
    const clientId = this.getClientId(req);

    if (this.useRedis && this.redisClient) {
      await this.handleRedisRateLimit(clientId, req, res, next);
    } else {
      this.handleInMemoryRateLimit(clientId, req, res, next);
    }
  }

  private async handleRedisRateLimit(clientId: string, req: Request, res: Response, next: NextFunction) {
    try {
      const key = `ratelimit:${clientId}`;
      const now = Date.now();
      const windowKey = Math.floor(now / this.windowMs);
      const redisKey = `${key}:${windowKey}`;

      const result = await this.redisClient.multi()
        .incr(redisKey)
        .pexpire(redisKey, this.windowMs)
        .exec();

      const count = result ? (result[0][1] as number) : 1;

      if (count > this.maxRequests) {
        this.logger.warn(`Rate limit exceeded for ${clientId}`);
        res.status(429).json({
          statusCode: 429,
          message: 'Too many requests',
          error: 'Rate Limit Exceeded',
          retryAfter: Math.ceil(this.windowMs / 1000),
        });
        return;
      }

      res.setHeader('X-RateLimit-Limit', this.maxRequests);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, this.maxRequests - count));
      res.setHeader('X-RateLimit-Reset', Math.ceil((windowKey + 1) * this.windowMs / 1000));

      next();
    } catch (err) {
      this.logger.error(`Redis rate limit error, falling back to in-memory: ${err}`);
      this.useRedis = false;
      this.handleInMemoryRateLimit(clientId, req, res, next);
    }
  }

  private handleInMemoryRateLimit(clientId: string, req: Request, res: Response, next: NextFunction) {
    const now = Date.now();
    let entry = this.fallbackClients.get(clientId);

    if (!entry || now > entry.resetTime) {
      entry = { count: 0, resetTime: now + this.windowMs };
      this.fallbackClients.set(clientId, entry);
    }

    entry.count++;

    if (entry.count > this.maxRequests) {
      this.logger.warn(`Rate limit exceeded for ${clientId}`);
      res.status(429).json({
        statusCode: 429,
        message: 'Too many requests',
        error: 'Rate Limit Exceeded',
        retryAfter: Math.ceil((entry.resetTime - now) / 1000),
      });
      return;
    }

    res.setHeader('X-RateLimit-Limit', this.maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, this.maxRequests - entry.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetTime / 1000));

    next();
  }

  private getClientId(req: Request): string {
    const userId = (req as any).user?.sub;
    if (userId) return `user:${userId}`;

    const tenantId = req.headers['x-tenant-id'];
    if (tenantId) return `tenant:${tenantId}`;

    return `ip:${req.ip || req.socket.remoteAddress || 'unknown'}`;
  }

  private cleanupFallback() {
    const now = Date.now();
    for (const [key, entry] of this.fallbackClients.entries()) {
      if (now > entry.resetTime) {
        this.fallbackClients.delete(key);
      }
    }
  }

  async onModuleDestroy() {
    if (this.redisClient) {
      await this.redisClient.quit().catch(() => {});
    }
  }
}
