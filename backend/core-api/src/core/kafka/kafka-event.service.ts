import { Injectable, Inject, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { isObservable, lastValueFrom, timeout } from 'rxjs';

/**
 * Producer Kafka dùng chung (module Orders + outbox dispatcher).
 *
 * OutboxDispatcher phải dùng `emitAsync()` để chờ broker ACK thật sự trước
 * khi đánh dấu event `SENT`. Hàm `emit()` đồng bộ được giữ cho caller không
 * chặn UI nhưng không được giả danh ACK bền vững.
 */
@Injectable()
export class KafkaEventService implements OnModuleInit {
  private readonly logger = new Logger('KafkaEventService');
  private connected = false;
  private eventBuffer: { topic: string; message: string }[] = [];

  constructor(
    @Optional() @Inject('KAFKA_SERVICE') private readonly kafkaClient: ClientKafka | null,
  ) {}

  async onModuleInit() {
    if (!this.kafkaClient) {
      this.logger.warn('Kafka client not registered. Outbox events will stay PENDING until Kafka is available.');
      return;
    }
    try {
      await this.kafkaClient.connect();
      this.connected = true;
      this.logger.log('Kafka producer connected');
      if (this.eventBuffer.length > 0) {
        const buffered = this.eventBuffer;
        this.eventBuffer = [];
        for (const evt of buffered) {
          this.kafkaClient.emit(evt.topic, evt.message);
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      this.logger.warn(`Failed to connect to Kafka: ${msg}.`);
    }
  }

  /**
   * Awaited publish waiting for Kafka producer acknowledgement.
   * Throws loudly when broker is disconnected or times out so Outbox retries safely.
   */
  async emitAsync(topic: string, message: any, ackTimeoutMs = 10000): Promise<void> {
    if (!this.kafkaClient || !this.connected) {
      throw new Error(`Kafka broker disconnected — refusing unacknowledged publish for topic ${topic}`);
    }
    const payload = typeof message === 'string' ? message : JSON.stringify(message);
    const result: unknown = this.kafkaClient.emit(topic, payload);
    if (isObservable(result)) {
      await lastValueFrom(result.pipe(timeout(ackTimeoutMs)));
    } else if (result && typeof (result as PromiseLike<unknown>).then === 'function') {
      await Promise.race([
        result as Promise<unknown>,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Kafka ACK timeout after ${ackTimeoutMs}ms`)), ackTimeoutMs),
        ),
      ]);
    }
  }

  emit(topic: string, message: any): void {
    const payload = typeof message === 'string' ? message : JSON.stringify(message);
    if (!this.kafkaClient || !this.connected) {
      this.eventBuffer.push({ topic, message: payload });
      this.logger.warn(`Kafka not connected — buffered non-outbox event: ${topic}`);
      return;
    }
    try {
      this.kafkaClient.emit(topic, payload);
    } catch (e) {
      this.logger.error(
        `Kafka emit failed for topic ${topic}: ${e instanceof Error ? e.message : 'Unknown'}`,
      );
      this.eventBuffer.push({ topic, message: payload });
    }
  }

  isConnected(): boolean {
    return this.connected && !!this.kafkaClient;
  }
}
