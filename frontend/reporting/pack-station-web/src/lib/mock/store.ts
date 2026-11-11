/**
 * Mock repository của pack station web.
 *
 * Hình dạng của object này là hợp đồng mà các trang pack station viết với.
 * Khi `NEXT_PUBLIC_DATA_SOURCE=api`, adapter REST trong `repository.ts`
 * đảm bảo cùng surface, nên trang không bao giờ phân nhánh.
 */

import {
  corrections,
  orders,
  products,
  sessions,
  staff,
  stations,
} from './seed';
import type {
  AiAnomaly,
  AiPredictionResult,
  BoxType,
  CorrectionLog,
  CorrectionStatus,
  IsoDate,
  MatchResult,
  PackOrder,
  PackProduct,
  PackScanLog,
  PackSession,
  PackSessionStatus,
  PackStation,
  PackStaff,
  ScanInput,
  ScanLog,
  SealInput,
  ServicePriority,
  SessionStartInput,
  StationSummary,
  PackCode,
} from './types';

export const DB_VERSION = 4;
const STORAGE_KEY = 'smartlogi.pack.mock.db';

export class MockApiError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'MockApiError';
    this.status = status;
  }
}

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export type PackDatabase = {
  version: number;
  orders: PackOrder[];
  products: PackProduct[];
  sessions: PackSession[];
  corrections: CorrectionLog[];
  stations: PackStation[];
  staff: PackStaff[];
};

export function createSeedDatabase(): PackDatabase {
  return {
    version: DB_VERSION,
    orders: clone(orders),
    products: clone(products),
    sessions: clone(sessions),
    corrections: clone(corrections),
    stations: clone(stations),
    staff: clone(staff),
  };
}

let memory: PackDatabase | null = null;
let latencyMs: [number, number] = [80, 220];
let failureRate = 0;

function getDb(): PackDatabase {
  if (memory) return memory;

  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PackDatabase;
        if (parsed.version === DB_VERSION) {
          memory = parsed;
          return memory;
        }
      }
    } catch {
      // Lưu trữ hỏng: xuống lại seed.
    }
  }

  memory = createSeedDatabase();
  return memory;
}

function save() {
  if (typeof window === 'undefined' || !memory) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
  } catch {
    // Hết bộ nhớ: giữ bản in-memory, quá trình demo vẫn hoạt động.
  }
}

function delay() {
  const [min, max] = latencyMs;
  const wait = min + Math.random() * Math.max(0, max - min);
  return new Promise<void>((resolve) => {
    setTimeout(resolve, wait);
  });
}

async function settle() {
  await delay();
  if (failureRate > 0 && Math.random() < failureRate) {
    throw new MockApiError('Trạm hoạt động không ổn định. Vui lòng thử lại.', 503);
  }
}

const makeId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}${Math.floor(Math.random() * 1e5).toString(36)}`;

const shortCode = (prefix: string, digits = 4) =>
  `${prefix}-${String(Math.floor(1000 + Math.random() * 9000)).slice(0, digits)}`;

const findOrder = (id: string) => {
  const order = getDb().orders.find((row) => row.id === id);
  return order ? clone(order) : null;
};

const findOrderByPackCode = (packCode: string) => {
  const order = getDb().orders.find((row) => row.packCode === packCode);
  return order ? clone(order) : null;
};

const findProductBySku = (sku: string) => {
  const product = getDb().products.find((row) => row.sku === sku);
  return product ? clone(product) : null;
};

const findProductByBarcode = (barcode: string) => {
  const product = getDb().products.find((row) => row.barcode === barcode);
  return product ? clone(product) : null;
};

const findSession = (id: string) => {
  const session = getDb().sessions.find((row) => row.id === id);
  return session ? clone(session) : null;
};

const activeSession = (): PackSession | null => {
  const list = getDb().sessions;
  const session = list.find((row) => row.status === 'ACTIVE');
  return session ? clone(session) : null;
};

const todayStart = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
};

const priorityRank: Record<ServicePriority, number> = {
  URGENT: 0,
  HIGH: 1,
  NORMAL: 2,
};

const boxLabel: Record<BoxType, string> = {
  LARGE: 'Hộp lớn',
  MEDIUM: 'Hộp vừa',
  SMALL: 'Hộp nhỏ',
  FILM: 'Phim cuộn',
};

type Collection<T extends { id: string }> = {
  list: (filter?: (row: T) => boolean) => Promise<T[]>;
  get: (id: string) => Promise<T | null>;
  create: (input: Omit<T, 'id'> & { id?: string }) => Promise<T>;
  update: (id: string, patch: Partial<T>) => Promise<T>;
  remove: (id: string) => Promise<void>;
};

function collection<T extends { id: string }>(key: keyof PackDatabase): Collection<T> {
  const rows = () => getDb()[key] as unknown as T[];

  return {
    list: async (filter) => {
      await settle();
      const all = [...rows()];
      return (filter ? all.filter(filter) : all).map(clone);
    },
    get: async (id) => {
      await settle();
      const found = rows().find((row) => row.id === id);
      return found ? clone(found) : null;
    },
    create: async (input) => {
      await settle();
      const entity = { ...input, id: input.id ?? makeId(String(key).slice(0, 3)) } as T;
      rows().unshift(entity);
      save();
      return clone(entity);
    },
    update: async (id, patch) => {
      await settle();
      const list = rows();
      const index = list.findIndex((row) => row.id === id);
      if (index < 0) throw new MockApiError('Không tìm thấy dữ liệu.', 404);
      list[index] = { ...list[index], ...patch };
      save();
      return clone(list[index]);
    },
    remove: async (id) => {
      await settle();
      const list = rows();
      const index = list.findIndex((row) => row.id === id);
      if (index < 0) throw new MockApiError('Không tìm thấy dữ liệu.', 404);
      list.splice(index, 1);
      save();
    },
  };
}

/**
 * Chờ đóng: sắp xếp theo mức khẩn trước, thời gian hẹn sau.
 */
const nextPendingOrder = (): PackOrder | null => {
  const queue = getDb().orders.filter((row) => row.status === 'PENDING');
  queue.sort((a, b) => {
    const rank = priorityRank[a.priority] - priorityRank[b.priority];
    if (rank !== 0) return rank;
    return a.scheduledAt.localeCompare(b.scheduledAt);
  });
  return queue.length > 0 ? clone(queue[0]) : null;
};

/** Ghi nhận lượt quét vào phiên đang hoạt động. */
const addScanLog = (scanLog: ScanLog, order: PackOrder, confidence?: number) => {
  const list = getDb().sessions;
  const session = list.find((row) => row.status === 'ACTIVE');
  if (!session) return;
  const log: ScanLog = {
    ...scanLog,
    confidence,
    weight: order.expectedQuantity * order.estimatedWeight,
    boxType: order.boxType,
  };
  session.scanLogs.push(log);
  save();
};

/** Độ dài phút từ khi bàn giao đến khi đóng gói. */
const packSeconds = (order: PackOrder) => {
  const start = new Date(order.updatedAt).getTime();
  const end = new Date().getTime();
  return Math.max(0, Math.round((end - start) / 1000));
};

export type MockRepository = {
  orders: Collection<PackOrder> & {
    nextOrder: (staffId?: string) => Promise<PackOrder | null>;
    scan: (input: ScanInput) => Promise<{ result: MatchResult; order: PackOrder; product?: PackProduct }>;
    seal: (input: SealInput) => Promise<PackOrder>;
    byPackCode: (packCode: string) => Promise<PackOrder | null>;
    summary: () => Promise<StationSummary>;
  };
  products: Collection<PackProduct> & {
    bySku: (sku: string) => Promise<PackProduct | null>;
    byBarcode: (barcode: string) => Promise<PackProduct | null>;
  };
  sessions: Collection<PackSession> & {
    start: (input: SessionStartInput) => Promise<PackSession>;
    sealSession: (id: string) => Promise<PackSession>;
    active: () => Promise<PackSession | null>;
    scans: (filter?: (log: ScanLog) => boolean) => Promise<ScanLog[]>;
    dashboard: () => Promise<StationSummary>;
  };
  corrections: Collection<CorrectionLog> & {
    updateStatus: (id: string, status: CorrectionStatus) => Promise<CorrectionLog>;
  };
  stations: Collection<PackStation>;
  staff: Collection<PackStaff>;
  aiFeature: {
    predictSku: (image?: string) => Promise<AiPredictionResult>;
    detectAnomaly: () => Promise<AiAnomaly[]>;
  };
  controls: (input: { latency?: [number, number]; failureRate?: number; reset?: boolean }) => Promise<{
    latencyMs: [number, number];
    failureRate: number;
  }>;
  reset: () => Promise<PackDatabase>;
};

/** Giải mã chuỗi định danh thành một số nguyên cố định dùng chọn mẫu. */
const hashString = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) & 0xffffffff;
  }
  return Math.abs(hash);
};

/** AI dự đoán SKU từ ảnh chụp sản phẩm tại trạm (chế độ demo). */
const predictSku = async (image?: string): Promise<AiPredictionResult> => {
  await settle();
  const products = getDb().products;
  const index = image
    ? hashString(image) % products.length
    : Math.floor(Math.random() * products.length);
  const candidate = products[index];
  const candidates = products.map((product, idx) => ({
    sku: product.sku,
    confidence: idx === index ? 0.72 + Math.random() * 0.28 : Math.random() * 0.12,
  }));
  return { sku: candidate.sku, confidence: Math.round(candidates[index].confidence * 100), candidates };
};

/**
 * Dự báo bất thường trong quy trình đóng gói:
 *
 * - `SKU_MISMATCH`: quét thấy SKU khác với dự kiến trên đơn.
 * - `VOLUMETRIC`: cân điện tử đọc trọng lượng lệch ngưởng thể tích
 *   (product weight * số lượng: thừa/thiếu lượng).
 * - `CAPACITY_RISK`: hộp không phù với kiện hoặc mã hộp đã đổi.
 * - `SCALE_ALT`: đính chính còn chờ xét xử.
 */
const detectAnomaly = async (): Promise<AiAnomaly[]> => {
  await settle();
  const db = getDb();
  const now = new Date();
  const anomalies: AiAnomaly[] = [];

  // 1. Đơn đang ở trạng thái sửa: quét SKU khác dự kiến (bắt buộc đính chính).
  for (const order of db.orders) {
    if (order.status !== 'CORRECTING' && order.status !== 'IN_PROGRESS') continue;
    if (!order.scannedSku || order.scanResult !== 'MISMATCH') continue;

    anomalies.push({
      id: `anom-${order.id}`,
      packCode: order.packCode,
      trackingCode: order.trackingCode,
      kind: 'SKU_MISMATCH',
      severity: 'high',
      expectedSku: order.expectedSku,
      expectedWeight: order.estimatedWeight,
      detectedWeight: 0,
      scannedSku: order.scannedSku,
      message: `Đơn ${order.packCode} quét SKU ${order.scannedSku} khác dự kiến ${order.expectedSku}.`,
      recommendation: 'Đính chính lại mã đơn hoặc chọn mã mong muốn làm chuẩn.',
      createdAt: order.updatedAt,
    });
  }

  // 2. Trọng lượng thực tế so với thể tích dự kiến của vật phẩm đóng gói.
  for (const order of db.orders) {
    const product = db.products.find((product) => product.sku === order.expectedSku);
    if (!product || !product.weight || !order.expectedQuantity) continue;
    const expectedWeight = Math.round(product.weight * order.expectedQuantity * 100) / 100;
    const detectedWeight = order.estimatedWeightKg ?? order.estimatedWeight;
    if (detectedWeight <= 0 || expectedWeight <= 0) continue;

    const diff = Math.abs(expectedWeight - detectedWeight);
    if (diff / expectedWeight > 0.2) {
      anomalies.push({
        id: `anom-vol-${order.id}`,
        packCode: order.packCode,
        trackingCode: order.trackingCode,
        kind: 'VOLUMETRIC',
        severity: diff / expectedWeight > 0.4 ? 'high' : 'medium',
        expectedSku: order.expectedSku,
        expectedWeight,
        detectedWeight,
        scannedSku: order.scannedSku,
        message: `Đơn ${order.packCode}: trọng lượng dự kiến ${expectedWeight} kg, đo được ${detectedWeight} kg.`,
        recommendation: detectedWeight > expectedWeight
          ? 'Đóng sai số lượng hoặc dụng cụ bao bì quá mức.'
          : 'Kiểm tra sản phẩm thiếu hoặc bao bì không nguyên vẹn.',
        createdAt: order.updatedAt,
      });
    }
  }

  // 3. Chọn hộp không phù loại (đóng kiện) so với đơn.
  for (const order of db.orders) {
    const product = db.products.find((product) => product.sku === order.expectedSku);
    if (!product || product.boxType === order.boxType) continue;
    anomalies.push({
      id: `anom-cap-${order.id}`,
      packCode: order.packCode,
      trackingCode: order.trackingCode,
      kind: 'CAPACITY_RISK',
      severity: 'medium',
      expectedSku: order.expectedSku,
      expectedWeight: 0,
      detectedWeight: 0,
      scannedSku: order.scannedSku,
      message: `Đơn ${order.packCode}: loại ${product.boxType} khác ${order.boxType}.`,
      recommendation: 'Thay đổi mã hộp hoặc chọn bao bì đáp ứng.',
      createdAt: order.updatedAt,
    });
  }

  // 4. Đính chính chưa xét xử từ phiên cũ (verdict).
  for (const correction of db.corrections) {
    if (correction.status !== 'PENDING') continue;
    anomalies.push({
      id: `anom-cor-${correction.id}`,
      packCode: correction.packCode,
      trackingCode: correction.trackingCode,
      kind: 'SCALE_ALT',
      severity: 'medium',
      expectedSku: correction.orderSku,
      expectedWeight: 0,
      detectedWeight: 0,
      scannedSku: correction.scannedSku,
      message: `Phiên đóng gói ${correction.packCode}: đính chính ${correction.orderSku} -> ${correction.scannedSku} chờ quét.`,
      recommendation: 'Mở Chi tiết để duyệt hoặc từ chối.',
      createdAt: correction.createdAt,
    });
  }

  // 5. Đơn chờ đóng quá lâu còn ít hơn 1 ca (nhanh nhất).
  for (const order of db.orders) {
    const daysPending = (now.getTime() - new Date(order.createdAt).getTime()) / 86400000;
    if (daysPending > 1 && order.status === 'PENDING' && order.priority === 'URGENT') {
      anomalies.push({
        id: `anom-pend-${order.id}`,
        packCode: order.packCode,
        trackingCode: order.trackingCode,
        kind: 'CAPACITY_RISK',
        severity: 'high',
        expectedSku: order.expectedSku,
        expectedWeight: order.estimatedWeight,
        detectedWeight: 0,
        scannedSku: order.scannedSku,
        message: `Đơn ${order.packCode} (QUAN TRỌNG) chưa đóng gói trong ${Math.floor(daysPending)} ngày.`,
        recommendation: 'Ưu tiên đóng gói lại đơn này trước khi soát đơn thường.',
        createdAt: order.updatedAt,
      });
    }
  }

  return [...anomalies].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};

export function createMockRepository(): MockRepository {
  const ordersRepo = collection<PackOrder>('orders');
  const productsRepo = collection<PackProduct>('products');
  const sessionsRepo = collection<PackSession>('sessions');
  const correctionsRepo = collection<CorrectionLog>('corrections');
  const stationsRepo = collection<PackStation>('stations');
  const staffRepo = collection<PackStaff>('staff');

  const orders = {
    ...ordersRepo,
    byPackCode: async (packCode: string) => {
      await settle();
      return findOrderByPackCode(packCode) ?? null;
    },
    nextOrder: async (staffId?: string) => {
      await settle();
      const order = nextPendingOrder();
      if (!order) return null;

      if (staffId) {
        const staff = getDb().staff.find((row) => row.id === staffId);
        order.stationId = staff?.stationId;
      }

      await ordersRepo.update(order.id, {
        status: 'IN_QUEUE',
        updatedAt: new Date().toISOString(),
        stationId: order.stationId,
      });
      return ordersRepo.get(order.id) ?? null;
    },
    async scan(input: ScanInput) {
      await settle();
      const order = findOrderByPackCode(input.packCode);
      if (!order) throw new MockApiError('Không tìm thấy đơn hàng.', 404);

      const product = findProductBySku(input.scannedSku);
      const result = product
        ? input.scannedSku === order.expectedSku
          ? 'MATCH'
          : 'MISMATCH'
        : 'MISMATCH';

      const scanLog: ScanLog = {
        packCode: order.packCode,
        trackingCode: order.trackingCode,
        sku: input.scannedSku,
        expectedSku: order.expectedSku,
        result,
        note: product ? undefined : 'Mã không tìm thấy trong tủ SKU',
        scannedAt: new Date().toISOString(),
      };

      await ordersRepo.update(order.id, {
        scannedSku: input.scannedSku,
        scanResult: result,
        scannedAt: scanLog.scannedAt,
        status: result === 'MATCH' ? 'IN_PROGRESS' : 'CORRECTING',
        updatedAt: new Date().toISOString(),
      });

      addScanLog(scanLog, order, input.confidence);

      return { result, order, product };
    },
    async seal(input: SealInput) {
      await settle();
      const order = findOrderByPackCode(input.packCode);
      if (!order) throw new MockApiError('Không tìm thấy đơn hàng.', 404);
      if (!['IN_PROGRESS'].includes(order.status)) {
        throw new MockApiError('Đơn hàng chưa trong trạng thái chờ đóng.', 409);
      }
      if (order.scanResult === 'MISMATCH') {
        throw new MockApiError('Cần đính chính mã sản phẩm trước khi đóng gói.', 409);
      }

      const session = activeSession();
      await ordersRepo.update(order.id, {
        status: 'PACKED',
        sealedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      if (session) {
        const sessionRecord = await sessionsRepo.get(session.id);
        if (sessionRecord) {
          await sessionsRepo.update(session.id, {
            totalPacked: sessionRecord.totalPacked + 1,
            totalMatched: sessionRecord.totalMatched + 1,
            elapsedSeconds: sessionRecord.elapsedSeconds + packSeconds(order),
          });
        }
      }
      return ordersRepo.get(order.id) ?? null;
    },
    async summary() {
      await settle();
      const db = getDb();
      const today = todayStart();

      const sessionsToday = db.sessions.filter(
        (session) => new Date(session.startedAt).getTime() >= today,
      );
      const correctionsToday = db.corrections.filter(
        (correction) => new Date(correction.createdAt).getTime() >= today,
      );
      const packsToday = sessionsToday.reduce((sum, session) => sum + session.totalPacked, 0);
      const totalMatched = sessionsToday.reduce((sum, session) => sum + session.totalMatched, 0);
      const totalMismatched = sessionsToday.reduce((sum, session) => sum + session.totalMismatched, 0);
      const elapsedTotal = sessionsToday.reduce((sum, session) => sum + session.elapsedSeconds, 0);
      const averageSecondsPerPack = packsToday > 0 ? Math.round(elapsedTotal / packsToday) : 0;
      const matchRate =
        totalMatched + totalMismatched > 0
          ? Math.round((totalMatched / (totalMatched + totalMismatched)) * 100)
          : 0;
      const activeStations = db.stations.filter(
        (station) => station.status === 'AVAILABLE' || station.status === 'BUSY',
      );

      return {
        sessionsToday: sessionsToday.length,
        packsToday,
        matchRate,
        correctionCount: correctionsToday.length,
        averageSecondsPerPack,
        activeStations,
      } as StationSummary;
    },
  };

  return {
    orders,
    products: {
      ...productsRepo,
      bySku: async (sku: string) => {
        await settle();
        return findProductBySku(sku) ?? null;
      },
      byBarcode: async (barcode: string) => {
        await settle();
        return findProductByBarcode(barcode) ?? null;
      },
    },
    sessions: {
      ...sessionsRepo,
      start: async (input: SessionStartInput) => {
        await settle();
        const session = {
          id: makeId('pcs'),
          sessionCode: `${shortCode('PCS')}`,
          stationId: input.stationId,
          staffId: input.staffId,
          status: 'ACTIVE' as PackSessionStatus,
          totalPacked: 0,
          totalMatched: 0,
          totalMismatched: 0,
          totalCorrected: 0,
          elapsedSeconds: 0,
          startedAt: new Date().toISOString(),
          closedAt: null,
          scanLogs: [],
        } as PackSession;
        await sessionsRepo.create(session);
        return sessionsRepo.get(session.id) ?? null;
      },
      sealSession: async (id: string) => {
        await settle();
        const session = await sessionsRepo.get(id);
        if (!session) throw new MockApiError('Không tìm thấy phiên.', 404);
        if (session.status !== 'ACTIVE') throw new MockApiError('Phiên chưa mở.', 409);
        return sessionsRepo.update(id, {
          status: 'CLOSED',
          closedAt: new Date().toISOString(),
        });
      },
      active: async () => {
        await settle();
        const list = getDb().sessions;
        const session = list.find((row) => row.status === 'ACTIVE');
        return session ? clone(session) : null;
      },
      async scans(filter?: (log: ScanLog) => boolean) {
        await settle();
        const logs = getDb().sessions.flatMap((row) => row.scanLogs ?? []);
        return filter ? logs.filter(filter) : logs;
      },
      async dashboard() {
        await settle();
        return orders.summary();
      },
    },
    corrections: {
      ...correctionsRepo,
      async updateStatus(id: string, status: CorrectionStatus) {
        await settle();
        const correction = await correctionsRepo.get(id);
        if (!correction) throw new MockApiError('Không tìm thấy đính chính.', 404);
        return correctionsRepo.update(id, { status });
      },
    },
    stations: stationsRepo,
    staff: staffRepo,
    aiFeature: {
      predictSku,
      detectAnomaly,
    },
    controls: async (input) => {
      if (input.latency) latencyMs = input.latency;
      if (typeof input.failureRate === 'number') failureRate = input.failureRate;
      if (input.reset) {
        memory = createSeedDatabase();
        save();
      }
      return { latencyMs, failureRate };
    },
    async reset() {
      memory = createSeedDatabase();
      save();
      return clone(memory);
    },
  };
}
