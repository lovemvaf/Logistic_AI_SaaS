import 'reflect-metadata';
import { OutboxDispatcher } from '../../../core/outbox/outbox-dispatcher.service';
import { computePayloadSha256 } from '../../../core/outbox/outbox.service';

describe('OutboxDispatcher & Kafka ACK durability', () => {
  it('reclaims expired PROCESSING leases when a crashed worker stalls (100 crash cycles)', async () => {
    const events = Array.from({ length: 100 }, (_, idx) => ({
      id: `evt-${idx}`,
      eventId: `uuid-${idx}`,
      schemaVersion: '1.0',
      tenantId: 'tenant-alpha',
      channel: 'KAFKA',
      topic: 'order.created',
      payload: { orderId: `ord-${idx}`, seq: idx },
      payloadHash: computePayloadSha256({ orderId: `ord-${idx}`, seq: idx }),
      status: 'PROCESSING',
      lockedBy: 'crashed-worker:999:dead',
      leaseUntil: new Date(Date.now() - 60_000),
      attempts: 1,
      availableAt: new Date(Date.now() - 60_000),
    }));

    const sentIds = new Set<string>();
    const kafkaAcked: string[] = [];

    const mockPrisma: any = {
      $queryRawUnsafe: jest.fn(async (sql: string, workerId: string) => {
        expect(sql).toContain('lease_until');
        expect(sql).toContain('FOR UPDATE SKIP LOCKED');
        const claimable = events.filter(
          (e) =>
            (e.status === 'PENDING' ||
              (e.status === 'PROCESSING' && e.leaseUntil.getTime() < Date.now())),
        );
        return claimable.map((e) => {
          e.lockedBy = workerId;
          e.status = 'PROCESSING';
          e.attempts += 1;
          e.leaseUntil = new Date(Date.now() + 30_000);
          return { ...e };
        });
      }),
      outboxEvent: {
        updateMany: jest.fn(async ({ where, data }: any) => {
          const row = events.find((e) => e.id === where.id);
          if (!row) return { count: 0 };
          if (where.lockedBy && row.lockedBy !== where.lockedBy) return { count: 0 };
          if (where.status && row.status !== where.status) return { count: 0 };
          Object.assign(row, data);
          if (data.status === 'SENT') sentIds.add(row.id);
          return { count: 1 };
        }),
      },
    };

    const mockKafka: any = {
      emitAsync: jest.fn(async (_topic: string, env: any) => {
        kafkaAcked.push(env.eventId);
      }),
    };

    const dispatcher = new OutboxDispatcher(mockPrisma, mockKafka);
    const claimed = await dispatcher.claim(100);
    expect(claimed).toHaveLength(100);

    for (const evt of claimed) {
      const outcome = await dispatcher.process(evt);
      expect(outcome).toBe('SENT');
    }

    expect(sentIds.size).toBe(100);
    expect(kafkaAcked).toHaveLength(100);
  });

  it('never marks event SENT when Kafka is disconnected and dead-letters after max attempts', async () => {
    const event: any = {
      id: 'evt-offline-1',
      eventId: 'uuid-offline-1',
      schemaVersion: '1.0',
      tenantId: 'tenant-alpha',
      channel: 'KAFKA',
      topic: 'order.created',
      payload: { orderId: 'ord-offline' },
      payloadHash: computePayloadSha256({ orderId: 'ord-offline' }),
      status: 'PROCESSING',
      attempts: 1,
      lockedBy: '',
      deadLetterReason: null,
      lastError: null,
    };

    const mockPrisma: any = {
      outboxEvent: {
        updateMany: jest.fn(async ({ where, data }: any) => {
          if (where.lockedBy && event.lockedBy !== where.lockedBy) return { count: 0 };
          Object.assign(event, data);
          return { count: 1 };
        }),
      },
    };

    const offlineKafka: any = {
      emitAsync: jest.fn(async () => {
        throw new Error('Kafka broker disconnected');
      }),
    };

    const dispatcher = new OutboxDispatcher(mockPrisma, offlineKafka);
    event.lockedBy = dispatcher.workerId;

    const firstOutcome = await dispatcher.process(event);
    expect(firstOutcome).toBe('RETRY');
    expect(event.status).toBe('PENDING');
    expect(event.lastError).toContain('Kafka broker disconnected');

    event.status = 'PROCESSING';
    event.attempts = 5;
    event.lockedBy = dispatcher.workerId;
    const finalOutcome = await dispatcher.process(event);
    expect(finalOutcome).toBe('DEAD_LETTER');
    expect(event.status).toBe('DEAD_LETTER');
    expect(event.deadLetterReason).toContain('Kafka broker disconnected');
  });

  it('prevents stale worker from marking SENT after another worker reclaims expired lease', async () => {
    let currentLock = 'other-worker:22:abcd';
    const mockPrisma: any = {
      outboxEvent: {
        updateMany: jest.fn(async ({ where }: any) => ({
          count: where.lockedBy === currentLock ? 1 : 0,
        })),
      },
    };
    const mockKafka: any = {
      emitAsync: jest.fn(async () => undefined),
    };

    const dispatcher = new OutboxDispatcher(mockPrisma, mockKafka);
    const result = await dispatcher.process({
      id: 'evt-stale-1',
      eventId: 'uuid-stale-1',
      channel: 'KAFKA',
      topic: 'order.updated',
      payload: { x: 1 },
      status: 'PROCESSING',
      attempts: 2,
    });

    expect(result).toBe('STALE_LEASE');
  });
});
