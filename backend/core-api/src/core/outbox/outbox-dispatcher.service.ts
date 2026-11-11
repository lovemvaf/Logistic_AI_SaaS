import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { KafkaEventService } from '../kafka/kafka-event.service';
import { assertSafeWebhookUrl } from '../utils/webhook-url.util';

const BATCH_SIZE = 20;
const MAX_ATTEMPTS = 5;

/**
 * Worker đọc outbox và gửi event đi (Kafka hoặc webhook).
 *
 * - Claim bằng `FOR UPDATE SKIP LOCKED` để nhiều instance chạy song song mà
 *   không gửi trùng event.
 * - Lỗi => tăng `attempts` và lùi `available_at` (backoff luỹ thừa).
 */
@Injectable()
export class OutboxDispatcher {
  private readonly logger = new Logger(OutboxDispatcher.name);
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
      const events = await this.claim();
      for (const event of events) {
        await this.process(event);
      }
    } catch (error: any) {
      this.logger.error(`Outbox dispatch cycle failed: ${error?.message || error}`);
    } finally {
      this.running = false;
    }
  }

  private async claim(): Promise<any[]> {
    return this.prisma.$queryRawUnsafe(
      `UPDATE "outbox_events"
          SET "status" = 'PROCESSING',
              "attempts" = "attempts" + 1,
              "updated_at" = now()
        WHERE "id" IN (
          SELECT "id" FROM "outbox_events"
           WHERE "status" = 'PENDING' AND "available_at" <= now()
           ORDER BY "created_at"
           LIMIT ${BATCH_SIZE}
           FOR UPDATE SKIP LOCKED
        )
        RETURNING *`,
    );
  }

  private async process(event: any): Promise<void> {
    try {
      if (event.channel === 'KAFKA') {
        this.kafka.emit(event.topic, event.payload);
      } else if (event.channel === 'WEBHOOK') {
        await this.deliverWebhook(event);
      } else {
        throw new Error(`Unknown outbox channel: ${event.channel}`);
      }
      await this.markSent(event.id);
    } catch (error: any) {
      const message = error?.message || 'Unknown error';
      this.logger.warn(`Outbox event ${event.id} (${event.topic}) failed: ${message}`);
      await this.markFailed(event, message);
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
        url: body.url,
        event: body.event ?? event.topic,
        secretToken: body.secretToken,
        idempotencyKey: event.id,
        body: body.body ?? body.payload ?? {},
      }),
    });

    if (!response.ok) {
      throw new Error(`Webhook service responded with ${response.status}`);
    }
  }

  private async markSent(id: string): Promise<void> {
    await this.prisma.outboxEvent.update({
      where: { id },
      data: { status: 'SENT', processedAt: new Date(), lastError: null },
    });
  }

  private async markFailed(event: any, message: string): Promise<void> {
    const attempts = Number(event.attempts ?? 1);
    if (attempts >= MAX_ATTEMPTS) {
      await this.prisma.outboxEvent.update({
        where: { id: event.id },
        data: { status: 'FAILED', lastError: message.slice(0, 1000) },
      });
      this.logger.error(`Outbox event ${event.id} exhausted ${attempts} attempts`);
      return;
    }
    // Backoff luỹ thừa: 10s, 20s, 40s, 80s
    const delaySeconds = Math.min(300, 10 * 2 ** (attempts - 1));
    await this.prisma.outboxEvent.update({
      where: { id: event.id },
      data: {
        status: 'PENDING',
        lastError: message.slice(0, 1000),
        availableAt: new Date(Date.now() + delaySeconds * 1000),
      },
    });
  }
}
