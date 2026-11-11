import { Global, Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { KafkaEventService } from './kafka-event.service';

const kafkaBrokers = process.env.KAFKA_BROKERS?.trim();

/**
 * Producer Kafka dùng chung cho toàn ứng dụng.
 *
 * Module này là @Global nên module Orders và outbox dispatcher dùng chung một
 * kết nối Kafka (token `KAFKA_SERVICE`).
 */
@Global()
@Module({
  imports: [
    ...(kafkaBrokers
      ? [
          ClientsModule.register([
            {
              name: 'KAFKA_SERVICE',
              transport: Transport.KAFKA,
              options: {
                client: {
                  brokers: [kafkaBrokers],
                  retry: { retries: 0 },
                  connectionTimeout: 500,
                },
                consumer: {
                  groupId: 'order-group',
                },
              },
            },
          ]),
        ]
      : []),
  ],
  providers: [KafkaEventService],
  exports: [KafkaEventService, ClientsModule],
})
export class KafkaModule {}
