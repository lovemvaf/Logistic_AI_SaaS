import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as crypto from 'crypto';
import * as os from 'os';
import { PrismaService } from '../prisma/prisma.service';
import { KafkaEventService } from '../kafka/kafka-event.service';
import { assertSafeWebhookUrl } from '../utils/webhook-url.util';
import { computePayloadSha256 } from './outbox.service';

const BATCH_SIZE = 20;
const MAX_ATTEMPTS = 5;
const LEASE_SECONDS = 30;

export interface OutboxHealthMetrics {
  pendingCount: number;
  processingCount: number;
  expiredLeaseCount: number;
  deadLetterCount: number;
  oldestPendingAgeSeconds: number;
}

/**
 * Worker đọc outbox theo ngữ nghĩa at-least-once bền vững:
 *
 * - Claim `PENDING` hoặc `PROCESSING` đã hết hạn lease (`lease_until < now()`)
 *   bằng `FOR UPDATE SKIP LOCKED` kèm `locked_by` và `lease_until`.
 * - Chỉ chuyển `SENT` sau khi Kafka ACK thật (`emitAsync`) hoặc webhook-service
 *   đã nhận và lưu queue bền vững (`QUEUED`), kiểm tra khớp `locked_by`.
 * - Quá `MAX_ATTEMPTS` chuyển sang `DEAD_LETTER` kèm `dead_letter_reason` và hỗ trợ redrive.
 */
@Injectable()
export class OutboxDispatcher {
  private readonly logger = new Logger(OutboxDispatcher.name);
  public readonly workerId = `${os.hostname()}:${process.pid}:${crypto.randomUUID().slice(0, 8)}`;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly kafka: KafkaEventService,
  ) {}

  @Cron('*/5 * * * * *')
  async dispatch(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      const events = await this.claim(BATCH_SIZE);
      for (const event of events) {
        await this.process(event);
      }
    } catch (error: any) {
      this.logger.error(`Outbox dispatch cycle failed: ${error?.message || error}`);
    } finally {
      this.running = false;
    }
  }

  async claim(limit = BATCH_SIZE): Promise<any[]> {
    const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
    return this.prisma.$queryRawUnsafe(
      `UPDATE "outbox_events"
          SET "status" = 'PROCESSING',
              "locked_by" = $1,
              "lease_until" = now() + ($2 || ' seconds')::interval,
              "attempts" = "attempts" + 1,
              "updated_at" = now()
        WHERE "id" IN (
          SELECT "id" FROM "outbox_events"
           WHERE (
             ("status" = 'PENDING' AND "available_at" <= now())
             OR ("status" = 'PROCESSING' AND ("lease_until" IS NULL OR "lease_until" < now()))
           )
           ORDER BY "created_at"
           LIMIT ${safeLimit}
           FOR UPDATE SKIP LOCKED
        )
        RETURNING *`,
      this.workerId,
      String(LEASE_SECONDS),
    );
  }

  async renewLease(eventId: string): Promise<boolean> {
    const res = await this.prisma.outboxEvent.updateMany({
      where: {
        id: eventId,
        lockedBy: this.workerId,
        status: 'PROCESSING',
      },
      data: {
        leaseUntil: new Date(Date.now() + LEASE_SECONDS * 1000),
      },
    });
    return res.count > 0;
  }

  async process(event: any): Promise<'SENT' | 'RETRY' | 'DEAD_LETTER' | 'STALE_LEASE'> {
    try {
      const expectedHash = event.payloadHash ?? event.payload_hash;
      if (expectedHash) {
        const currentHash = computePayloadSha256(event.payload ?? {});
        if (currentHash !== expectedHash) {
          throw new Error(`Outbox payload digest mismatch (${currentHash.slice(0, 12)} != ${String(expectedHash).slice(0, 12)})`);
        }
      }

      const envelope = {
        eventId: event.eventId ?? event.event_id ?? event.id,
        schemaVersion: event.schemaVersion ?? event.schema_version ?? '1.0',
        aggregateId: event.aggregateId ?? event.aggregate_id ?? null,
        correlationId: event.correlationId ?? event.correlation_id ?? null,
        tenantId: event.tenantId ?? event.tenant_id ?? null,
        topic: event.topic,
        payload: event.payload,
      };

      if (event.channel === 'KAFKA') {
        await this.kafka.emitAsync(event.topic, envelope);
      } else if (event.channel === 'WEBHOOK') {
        await this.deliverWebhook(event);
      } else {
        throw new Error(`Unknown outbox channel: ${event.channel}`);
      }

      const marked = await this.markSent(event.id);
      return marked ? 'SENT' : 'STALE_LEASE';
    } catch (error: any) {
      const message = error?.message || 'Unknown error';
      this.logger.warn(`Outbox event ${event.id} (${event.topic}) failed: ${message}`);
      return this.markFailed(event, message);
    }
  }

  private async deliverWebhook(event: any): Promise<void> {
    const baseUrl = process.env.WEBHOOK_SERVICE_URL || 'http://webhook-service:8092';
    const token = process.env.WEBHOOK_AUTH_TOKEN || '';
    const body = event.payload ?? {};

    await assertSafeWebhookUrl(String(body.url || ''));

    const response = await fetch(`${baseUrl}/deliver`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        id: event.id,
        webhookId: body.webhookId ?? event.id,
        tenantId: event.tenantId ?? event.tenant_id ?? body.tenantId ?? '',
        url: body.url,
        event: body.event ?? event.topic,
        secretToken: body.secretToken,
        idempotencyKey: event.eventId ?? event.event_id ?? event.id,
        body: body.body ?? body.payload ?? {},
      }),
    });

    if (!response.ok) {
      throw new Error(`Webhook service responded with ${response.status}`);
    }
  }

  private async markSent(id: string): Promise<boolean> {
    const res = await this.prisma.outboxEvent.updateMany({
      where: {
        id,
        lockedBy: this.workerId,
        status: 'PROCESSING',
      },
      data: {
        status: 'SENT',
        processedAt: new Date(),
        lastError: null,
        lockedBy: null,
        leaseUntil: null,
      },
    });
    if (res.count === 0) {
      this.logger.warn(`Skipped markSent for ${id}: lease reclaimed by another worker`);
      return false;
    }
    return true;
  }

  private async markFailed(event: any, message: string): Promise<'RETRY' | 'DEAD_LETTER'> {
    const attempts = Number(event.attempts ?? 1);
    const trimmedMsg = message.slice(0, 1000);
    if (attempts >= MAX_ATTEMPTS) {
      await this.prisma.outboxEvent.updateMany({
        where: { id: event.id, lockedBy: this.workerId },
        data: {
          status: 'DEAD_LETTER',
          lastError: trimmedMsg,
          deadLetterReason: trimmedMsg,
          lockedBy: null,
          leaseUntil: null,
        },
      });
      this.logger.error(`Outbox event ${event.id} moved to DEAD_LETTER after ${attempts} attempts`);
      return 'DEAD_LETTER';
    }
    // Backoff luỹ thừa: 10s, 20s, 40s, 80s
    const delaySeconds = Math.min(300, 10 * 2 ** Math.max(0, attempts - 1));
    await this.prisma.outboxEvent.updateMany({
      where: { id: event.id, lockedBy: this.workerId },
      data: {
        status: 'PENDING',
        lastError: trimmedMsg,
        lockedBy: null,
        leaseUntil: null,
        availableAt: new Date(Date.now() + delaySeconds * 1000),
      },
    });
    return 'RETRY';
  }

  async redriveDeadLetters(tenantId?: string, ids?: string[]): Promise<number> {
    const where: any = {
      status: { in: ['DEAD_LETTER', 'FAILED'] },
    };
    if (tenantId) where.tenantId = tenantId;
    if (ids && ids.length > 0) where.id = { in: ids };

    const res = await this.prisma.outboxEvent.updateMany({
      where,
      data: {
        status: 'PENDING',
        attempts: 0,
        lockedBy: null,
        leaseUntil: null,
        deadLetterReason: null,
        availableAt: new Date(),
      },
    });
    return res.count;
  }

  async getHealthMetrics(tenantId?: string): Promise<OutboxHealthMetrics> {
    const scope = tenantId ? { tenantId } : {};
    const now = new Date();
    const [pendingCount, processingCount, expiredLeaseCount, deadLetterCount, oldestPending] =
      await Promise.all([
        this.prisma.outboxEvent.count({ where: { ...scope, status: 'PENDING' } }),
        this.prisma.outboxEvent.count({ where: { ...scope, status: 'PROCESSING' } }),
        this.prisma.outboxEvent.count({
          where: { ...scope, status: 'PROCESSING', leaseUntil: { lt: now } },
        }),
        this.prisma.outboxEvent.count({
          where: { ...scope, status: { in: ['DEAD_LETTER', 'FAILED'] } },
        }),
        this.prisma.outboxEvent.findFirst({
          where: { ...scope, status: 'PENDING' },
          orderBy: { createdAt: 'asc' },
          select: { createdAt: true },
        }),
      ]);

    const oldestPendingAgeSeconds = oldestPending?.createdAt
      ? Math.max(0, Math.round((now.getTime() - new Date(oldestPending.createdAt).getTime()) / 1000))
      : 0;

    return {
      pendingCount,
      processingCount,
      expiredLeaseCount,
      deadLetterCount,
      oldestPendingAgeSeconds,
    };
  }
}
