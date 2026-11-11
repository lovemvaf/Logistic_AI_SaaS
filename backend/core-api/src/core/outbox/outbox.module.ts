import { Global, Module } from '@nestjs/common';
import { OutboxService } from './outbox.service';
import { OutboxDispatcher } from './outbox-dispatcher.service';

/**
 * Outbox pattern: ghi event nghiệp vụ trong transaction, worker gửi đi sau.
 */
@Global()
@Module({
  providers: [OutboxService, OutboxDispatcher],
  exports: [OutboxService, OutboxDispatcher],
})
export class OutboxModule {}
