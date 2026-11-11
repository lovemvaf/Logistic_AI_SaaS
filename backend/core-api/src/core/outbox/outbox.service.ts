import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

export type OutboxChannel = 'KAFKA' | 'WEBHOOK';

export interface OutboxMessage {
  channel: OutboxChannel;
  topic: string;
  payload: any;
  eventId?: string;
  schemaVersion?: string;
  aggregateId?: string;
  correlationId?: string;
  tenantId?: string | null;
}

export function canonicalJsonString(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJsonString(item)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJsonString(obj[k])}`).join(',')}}`;
}

export function computePayloadSha256(payload: unknown): string {
  const canonical = canonicalJsonString(payload ?? {});
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

/**
 * Ghi sự kiện nghiệp vụ vào outbox cùng transaction với thay đổi dữ liệu,
 * kèm `eventId`, `schemaVersion`, `aggregateId`, `payloadHash` và `correlationId`.
 */
@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  constructor(private readonly prisma: PrismaService) {}

  async enqueue(message: OutboxMessage, tx?: any): Promise<string> {
    const client = tx ?? this.prisma.getTenantDb();
    const payload = message.payload ?? {};
    const eventId = message.eventId ?? crypto.randomUUID();
    const payloadHash = computePayloadSha256(payload);

    try {
      await client.outboxEvent.create({
        data: {
          eventId,
          schemaVersion: message.schemaVersion ?? '1.0',
          aggregateId: message.aggregateId ?? null,
          payloadHash,
          correlationId: message.correlationId ?? null,
          channel: message.channel,
          topic: message.topic,
          payload,
          tenantId:
            message.tenantId !== undefined
              ? message.tenantId
              : this.prisma.currentTenant.tenantId ?? null,
        },
      });
      return eventId;
    } catch (error: any) {
      this.logger.error(
        `Failed to enqueue outbox event ${message.topic}: ${error?.message || error}`,
      );
      throw error;
    }
  }

  /**
   * Consumer-side idempotency helper backed by `event_consumption_ledger`
   * (unique constraint on `(event_id, consumer_group)`).
   */
  async consumeIdempotently<T>(
    eventId: string,
    consumerGroup: string,
    topic: string,
    tenantId: string | null,
    handler: () => Promise<T>,
  ): Promise<{ skipped: boolean; result?: T }> {
    const db = this.prisma as any;
    if (!db.eventConsumptionLedger) {
      const result = await handler();
      return { skipped: false, result };
    }
    try {
      await db.eventConsumptionLedger.create({
        data: { eventId, consumerGroup, topic, tenantId },
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        return { skipped: true };
      }
      throw error;
    }
    const result = await handler();
    return { skipped: false, result };
  }
}
