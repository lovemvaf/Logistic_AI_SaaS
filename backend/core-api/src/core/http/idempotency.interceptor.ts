import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  ConflictException,
} from '@nestjs/common';
import { Observable, of, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';

interface CachedEntry {
  expiresAt: number;
  payload: any;
}

/**
 * Deduplicates mobile retry requests carrying an `X-Sync-Id` (or `Idempotency-Key`)
 * header, scoped by authenticated user and tenant so one caller cannot replay another's result.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private static readonly TTL_MS = 24 * 60 * 60 * 1000;
  private static readonly MAX_ENTRIES = 5000;
  private static readonly cache = new Map<string, CachedEntry>();
  private static readonly inFlight = new Set<string>();

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const method = String(req?.method || '').toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      return next.handle();
    }

    const rawKey =
      (req?.headers?.['x-sync-id'] as string | undefined) ||
      (req?.headers?.['idempotency-key'] as string | undefined);
    const syncId = typeof rawKey === 'string' ? rawKey.trim() : '';
    if (!syncId) {
      return next.handle();
    }

    const tenantScope = req?.tenantId || req?.user?.tenant_id || 'public';
    const userScope = req?.user?.sub || 'anon';
    const routeScope = `${method}:${req?.route?.path || req?.url || ''}`;
    const compositeKey = `${tenantScope}:${userScope}:${routeScope}:${syncId}`;

    const now = Date.now();
    this.pruneExpired(now);

    const existing = IdempotencyInterceptor.cache.get(compositeKey);
    if (existing && existing.expiresAt > now) {
      return of(existing.payload);
    }

    if (IdempotencyInterceptor.inFlight.has(compositeKey)) {
      throw new ConflictException('A request with this X-Sync-Id is already being processed');
    }

    IdempotencyInterceptor.inFlight.add(compositeKey);
    return next.handle().pipe(
      tap((responseBody) => {
        IdempotencyInterceptor.inFlight.delete(compositeKey);
        if (IdempotencyInterceptor.cache.size >= IdempotencyInterceptor.MAX_ENTRIES) {
          const oldestKey = IdempotencyInterceptor.cache.keys().next().value;
          if (oldestKey) IdempotencyInterceptor.cache.delete(oldestKey);
        }
        IdempotencyInterceptor.cache.set(compositeKey, {
          expiresAt: Date.now() + IdempotencyInterceptor.TTL_MS,
          payload: responseBody,
        });
      }),
      catchError((err) => {
        IdempotencyInterceptor.inFlight.delete(compositeKey);
        return throwError(() => err);
      }),
    );
  }

  private pruneExpired(now: number): void {
    for (const [key, entry] of IdempotencyInterceptor.cache.entries()) {
      if (entry.expiresAt <= now) {
        IdempotencyInterceptor.cache.delete(key);
      }
    }
  }
}
