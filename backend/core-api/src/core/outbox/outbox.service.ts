import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type OutboxChannel = 'KAFKA' | 'WEBHOOK';

export interface OutboxMessage {
  channel: OutboxChannel;
  topic: string;
  payload: any;
}

/**
 * Ghi sự kiện nghiệp vụ vào outbox.
 *
 * Event được ghi CÙNG transaction với thay đổi dữ liệu, nên không bao giờ
 * xảy ra tình trạng "đơn hàng đã tạo nhưng event chưa phát" hoặc ngược lại.
 */
@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * @param tx transaction đang chạy; nếu không truyền thì dùng transaction
   *             của request hiện tại (nếu có) để event nằm chung transaction.
   */
  async enqueue(message: OutboxMessage, tx?: any): Promise<void> {
    const client = tx ?? this.prisma.getTenantDb();
    try {
      await client.outboxEvent.create({
        data: {
          channel: message.channel,
          topic: message.topic,
          payload: message.payload ?? {},
          tenantId: this.prisma.currentTenant.tenantId ?? null,
        },
      });
    } catch (error: any) {
      // Không được phép làm hỏng nghiệp vụ chỉ vì ghi outbox lỗi, nhưng phải
      // để lại dấu vết để cảnh báo.
      this.logger.error(
        `Failed to enqueue outbox event ${message.topic}: ${error?.message || error}`,
      );
      throw error;
    }
  }
}
