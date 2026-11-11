import { Injectable, Inject, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';

/**
 * Producer Kafka dùng chung (module Orders + outbox dispatcher).
 *
 * Nếu Kafka chưa kết nối được, event được đẩy vào buffer bộ nhớ để không
 * làm hỏng luồng nghiệp vụ.
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
      this.logger.warn('Kafka client not registered. Events will be buffered in memory.');
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
      this.logger.warn(`Failed to connect to Kafka: ${msg}. Events will be buffered in memory.`);
    }
  }

  emit(topic: string, message: any): void {
    const payload = JSON.stringify(message);
    if (!this.kafkaClient || !this.connected) {
      this.eventBuffer.push({ topic, message: payload });
      this.logger.warn(`Kafka not connected — buffered event: ${topic}`);
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
