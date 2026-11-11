import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * ThrottlerGuard aware of upstream gateway X-Forwarded-For headers and
 * per-account scoping on authentication endpoints so multiple legitimate users
 * behind a shared proxy/NAT IP do not starve each other's login quota.
 */
@Injectable()
export class SmartThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const forwarded = req.headers?.['x-forwarded-for'];
    const firstForwarded = Array.isArray(forwarded)
      ? forwarded[0]
      : typeof forwarded === 'string'
        ? forwarded.split(',')[0].trim()
        : '';
    const ip = firstForwarded || req.ip || req.socket?.remoteAddress || 'unknown';
    const url: string = req.originalUrl || req.url || '';

    if (url.includes('/auth/') && req.body && typeof req.body.email === 'string' && req.body.email.trim()) {
      const slug = String(req.headers?.['x-tenant-slug'] || 'platform').trim().toLowerCase();
      return `${ip}:${slug}:${req.body.email.trim().toLowerCase()}`;
    }

    return ip;
  }
}
