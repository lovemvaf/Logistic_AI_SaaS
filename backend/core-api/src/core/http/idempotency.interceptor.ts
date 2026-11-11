import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  ConflictException,
  Optional,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { Observable, of, throwError, from } from 'rxjs';
import { tap, catchError, concatMap } from 'rxjs/operators';
import { PrismaService } from '../prisma/prisma.service';
import { canonicalJsonString } from '../outbox/outbox.service';

interface CachedEntry {
  expiresAt: number;
  bodySha256: string;
  payload: any;
}

/**
 * DB-backed idempotency interceptor for `X-Sync-Id` / `Idempotency-Key` headers.
 *
 * Scoped by `(tenantId, principalId, operation, idempotencyKey)` and enforces
 * `body_sha256` payload matching (409 Conflict when an identical key is reused
 * with mutated request body). Falls back to an isolated in-memory map ONLY when
 * invoked without PrismaService (e.g., standalone unit tests).
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private static readonly TTL_MS = 24 * 60 * 60 * 1000;
  private static readonly MAX_ENTRIES = 5000;
  private static readonly memoryCache = new Map<string, CachedEntry>();
  private static readonly memoryInFlight = new Map<string, string>();

  constructor(@Optional() private readonly prisma?: PrismaService) {}

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

    const tenantScope = String(req?.tenantId || req?.user?.tenant_id || 'public');
    const userScope = String(req?.user?.sub || 'anon');
    const operation = `${method}:${req?.route?.path || req?.url || ''}`;
    const bodySha256 = crypto
      .createHash('sha256')
      .update(canonicalJsonString(req?.body ?? {}))
      .digest('hex');

    const dbDelegate = this.resolveDbDelegate(tenantScope);
    if (!dbDelegate) {
      return this.handleInMemory(
        `${tenantScope}:${userScope}:${operation}:${syncId}`,
        bodySha256,
        next,
      );
    }

    return new Observable((subscriber) => {
      this.executeWithDb(dbDelegate, {
        tenantId: tenantScope,
        principalId: userScope,
        operation,
        idempotencyKey: syncId,
        bodySha256,
      }, next).subscribe(subscriber);
    });
  }

  private resolveDbDelegate(tenantScope: string): any | null {
    if (!this.prisma) return null;
    try {
      const db =
        tenantScope === 'public'
          ? (this.prisma as any)
          : (this.prisma.getTenantDb() as any);
      if (db && db.apiIdempotencyRecord && typeof db.apiIdempotencyRecord.create === 'function') {
        return db;
      }
    } catch {
      return null;
    }
    return null;
  }

  private executeWithDb(
    db: any,
    key: {
      tenantId: string;
      principalId: string;
      operation: string;
      idempotencyKey: string;
      bodySha256: string;
    },
    next: CallHandler,
  ): Observable<any> {
    return new Observable((subscriber) => {
      const run = async () => {
        const now = new Date();
        const expiresAt = new Date(now.getTime() + IdempotencyInterceptor.TTL_MS);
        const compositeWhere = {
          tenantId_principalId_operation_idempotencyKey: {
            tenantId: key.tenantId,
            principalId: key.principalId,
            operation: key.operation,
            idempotencyKey: key.idempotencyKey,
          },
        };

        let claimMode: 'CREATED' | 'RECLAIMED' = 'CREATED';
        try {
          await db.apiIdempotencyRecord.create({
            data: {
              tenantId: key.tenantId,
              principalId: key.principalId,
              operation: key.operation,
              idempotencyKey: key.idempotencyKey,
              bodySha256: key.bodySha256,
              state: 'PROCESSING',
              expiresAt,
            },
          });
        } catch (err: any) {
          if (err?.code !== 'P2002') {
            throw err;
          }
          const existing = await db.apiIdempotencyRecord.findUnique({ where: compositeWhere });
          if (existing) {
            const isExpired = existing.expiresAt && new Date(existing.expiresAt) <= now;
            if (!isExpired) {
              if (existing.bodySha256 !== key.bodySha256) {
                throw new ConflictException(
                  'Idempotency key already used with a different request payload',
                );
              }
              if (existing.state === 'PROCESSING') {
                throw new ConflictException(
                  'A request with this X-Sync-Id is already being processed',
                );
              }
              if (existing.state === 'COMPLETED') {
                subscriber.next(existing.responseBody);
                subscriber.complete();
                return;
              }
            }
            // Retryable FAILED or expired entry -> re-claim atomically with updated digest/expiry
            await db.apiIdempotencyRecord.update({
              where: compositeWhere,
              data: {
                bodySha256: key.bodySha256,
                state: 'PROCESSING',
                expiresAt,
                responseBody: null,
                statusCode: null,
              },
            });
            claimMode = 'RECLAIMED';
          }
        }

        const inner = next.handle().pipe(
          concatMap((responseBody) =>
            from(
              (async () => {
                try {
                  await db.apiIdempotencyRecord.update({
                    where: compositeWhere,
                    data: {
                      state: 'COMPLETED',
                      statusCode: 200,
                      responseBody: responseBody ?? null,
                    },
                  });
                } catch {
                  // Ignore persistence noise if response already serialized in caller tx
                }
                return responseBody;
              })(),
            ),
          ),
          catchError((err) =>
            from(
              db.apiIdempotencyRecord
                .update({
                  where: compositeWhere,
                  data: { state: 'FAILED' },
                })
                .catch(() => undefined),
            ).pipe(concatMap(() => throwError(() => err))),
          ),
        );

        const sub = inner.subscribe({
          next: (val) => subscriber.next(val),
          error: (err) => subscriber.error(err),
          complete: () => subscriber.complete(),
        });

        return () => {
          void claimMode;
          sub.unsubscribe();
        };
      };

      run().catch((err) => subscriber.error(err));
    });
  }

  private handleInMemory(
    compositeKey: string,
    bodySha256: string,
    next: CallHandler,
  ): Observable<any> {
    const now = Date.now();
    this.pruneExpired(now);

    const existing = IdempotencyInterceptor.memoryCache.get(compositeKey);
    if (existing && existing.expiresAt > now) {
      if (existing.bodySha256 !== bodySha256) {
        throw new ConflictException(
          'Idempotency key already used with a different request payload',
        );
      }
      return of(existing.payload);
    }

    const inFlightDigest = IdempotencyInterceptor.memoryInFlight.get(compositeKey);
    if (inFlightDigest) {
      if (inFlightDigest !== bodySha256) {
        throw new ConflictException(
          'Idempotency key already used with a different request payload',
        );
      }
      throw new ConflictException('A request with this X-Sync-Id is already being processed');
    }

    IdempotencyInterceptor.memoryInFlight.set(compositeKey, bodySha256);
    return next.handle().pipe(
      tap((responseBody) => {
        IdempotencyInterceptor.memoryInFlight.delete(compositeKey);
        if (IdempotencyInterceptor.memoryCache.size >= IdempotencyInterceptor.MAX_ENTRIES) {
          const oldestKey = IdempotencyInterceptor.memoryCache.keys().next().value;
          if (oldestKey) IdempotencyInterceptor.memoryCache.delete(oldestKey);
        }
        IdempotencyInterceptor.memoryCache.set(compositeKey, {
          expiresAt: Date.now() + IdempotencyInterceptor.TTL_MS,
          bodySha256,
          payload: responseBody,
        });
      }),
      catchError((err) => {
        IdempotencyInterceptor.memoryInFlight.delete(compositeKey);
        return throwError(() => err);
      }),
    );
  }

  private pruneExpired(now: number): void {
    for (const [key, entry] of IdempotencyInterceptor.memoryCache.entries()) {
      if (entry.expiresAt <= now) {
        IdempotencyInterceptor.memoryCache.delete(key);
      }
    }
  }
}
