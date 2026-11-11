import {
  aiInsights,
  apiKeys,
  auditLogs,
  bankTransactions,
  bins,
  clients,
  cycleCounts,
  customers,
  customerReviews,
  driverActivities,
  drivers,
  equipment,
  expenses,
  fuelLogs,
  geofences,
  inventory,
  invoices,
  maintenanceRecords,
  movements,
  notificationEvents,
  notifications,
  orders,
  packSessions,
  pickTasks,
  pods,
  products,
  remittances,
  returns,
  roles,
  sosAlerts,
  trips,
  users,
  vehicles,
  warehouses,
  waves,
  webhooks,
  tenantSettings,
} from './seed';
import type {
  AiInsight,
  ApiKey,
  AuditLog,
  BankTransaction,
  Bin,
  Client,
  CodRemittance,
  Customer,
  CustomerReview,
  CycleCount,
  DashboardSummary,
  Driver,
  DriverActivity,
  DriverActivityKind,
  DriverReport,
  Equipment,
  Expense,
  FuelLog,
  Geofence,
  InventoryItem,
  Invoice,
  IsoDate,
  MaintenanceRecord,
  NotificationEvent,
  NotificationEventKind,
  Order,
  OrderPartial,
  OrderRoute,
  OrderStatus,
  PackSession,
  PickTask,
  PODRecord,
  Product,
  ReturnRequest,
  ReportCostCategory,
  ReportCosts,
  ReportFleet,
  ReportFleetVehicle,
  ReportOnTime,
  ReportParams,
  ReportSummary,
  RoleDefinition,
  SosAlert,
  StockMovement,
  Trip,
  UserAccount,
  Vehicle,
  Warehouse,
  Wave,
  WebhookEndpoint,
  Notification,
  TenantSettings,
} from './types';

/**
 * Mock repository for the tenant portal.
 *
 * The shape of this object is the contract the UI codes against. When
 * `NEXT_PUBLIC_DATA_SOURCE=api` the REST adapter in `repository.ts` exposes the
 * exact same methods, so pages never branch on mock vs. real.
 */

export const DB_VERSION = 4;
const STORAGE_KEY = 'smartlogi.tenant.mock.db';

export type MockDatabase = {
  version: number;
  orders: Order[];
  products: Product[];
  warehouses: Warehouse[];
  bins: Bin[];
  inventory: InventoryItem[];
  movements: StockMovement[];
  waves: Wave[];
  pickTasks: PickTask[];
  cycleCounts: CycleCount[];
  equipment: Equipment[];
  packSessions: PackSession[];
  trips: Trip[];
  drivers: Driver[];
  vehicles: Vehicle[];
  geofences: Geofence[];
  sosAlerts: SosAlert[];
  returns: ReturnRequest[];
  remittances: CodRemittance[];
  bankTransactions: BankTransaction[];
  expenses: Expense[];
  clients: Client[];
  customers: Customer[];
  reviews: CustomerReview[];
  orderPartials: OrderPartial[];
  invoices: Invoice[];
  aiInsights: AiInsight[];
  apiKeys: ApiKey[];
  auditLogs: AuditLog[];
  users: UserAccount[];
  roles: RoleDefinition[];
  webhooks: WebhookEndpoint[];
  notifications: Notification[];
  notificationsEvents: NotificationEvent[];
  fuelLogs: FuelLog[];
  maintenanceRecords: MaintenanceRecord[];
  driverActivities: DriverActivity[];
  pods: PODRecord[];
  settings: TenantSettings;
};

type ArrayKey = {
  [K in keyof MockDatabase]: MockDatabase[K] extends Array<unknown> ? K : never;
}[keyof MockDatabase];

export class MockApiError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'MockApiError';
    this.status = status;
  }
}

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function createSeedDatabase(): MockDatabase {
  return {
    version: DB_VERSION,
    orders: clone(orders),
    products: clone(products),
    warehouses: clone(warehouses),
    bins: clone(bins),
    inventory: clone(inventory),
    movements: clone(movements),
    waves: clone(waves),
    pickTasks: clone(pickTasks),
    cycleCounts: clone(cycleCounts),
    equipment: clone(equipment),
    packSessions: clone(packSessions),
    trips: clone(trips),
    drivers: clone(drivers),
    vehicles: clone(vehicles),
    geofences: clone(geofences),
    sosAlerts: clone(sosAlerts),
    returns: clone(returns),
    remittances: clone(remittances),
    bankTransactions: clone(bankTransactions),
    expenses: clone(expenses),
    clients: clone(clients),
    customers: clone(customers),
    reviews: clone(customerReviews),
    orderPartials: [],
    invoices: clone(invoices),
    aiInsights: clone(aiInsights),
    apiKeys: clone(apiKeys),
    auditLogs: clone(auditLogs),
    users: clone(users),
    roles: clone(roles),
    webhooks: clone(webhooks),
    notifications: clone(notifications),
    notificationsEvents: clone(notificationEvents),
    fuelLogs: clone(fuelLogs),
    maintenanceRecords: clone(maintenanceRecords),
    driverActivities: clone(driverActivities),
    pods: clone(pods),
    settings: clone(tenantSettings),
  };
}

let memory: MockDatabase | null = null;
let latencyMs: [number, number] = [80, 220];
let failureRate = 0;

function getDb(): MockDatabase {
  if (memory) return memory;

  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as MockDatabase;
        if (parsed.version === DB_VERSION) {
          memory = parsed;
          return memory;
        }
      }
    } catch {
      // Corrupted storage: fall through to a fresh seed.
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
    // Quota exceeded: keep the in-memory copy, the demo still works this session.
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
    throw new MockApiError('Máy chủ demo tạm thời không phản hồi. Thử lại sau ít phút.', 503);
  }
}

const makeId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}${Math.floor(Math.random() * 1e5).toString(36)}`;

const trackingCode = () => {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const body = Math.random().toString(32).slice(2, 8).toUpperCase().padEnd(6, '0');
  return `SLG-${date}-${body}`;
};

const shortCode = (prefix: string, digits = 4) =>
  `${prefix}-${String(Math.floor(1000 + Math.random() * 9000)).slice(0, digits)}`;

type Collection<T extends { id: string }> = {
  list: (filter?: (row: T) => boolean) => Promise<T[]>;
  get: (id: string) => Promise<T | null>;
  create: (input: Omit<T, 'id'> & { id?: string }) => Promise<T>;
  update: (id: string, patch: Partial<T>) => Promise<T>;
  remove: (id: string) => Promise<void>;
};

function collection<T extends { id: string }>(key: ArrayKey): Collection<T> {
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

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

const startOfToday = () => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.getTime();
};

const statusToneOrder: OrderStatus[] = [
  'NEW',
  'UNASSIGNED',
  'PENDING_PICKUP',
  'PICKING',
  'PACKED',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'FAILED',
  'RETURN_REQUESTED',
  'RETURNED',
  'CANCELLED',
];

export type NewOrderInput = {
  clientId: string;
  clientOrderRef?: string;
  service?: Order['service'];
  customer: Order['customer'];
  warehouseId: string;
  codAmount: number;
  shippingFee?: number;
  weightKg?: number;
  volumeCbm?: number;
  itemCount?: number;
  notes?: string;
};

export function createMockRepository() {
  const ordersRepo = collection<Order>('orders');
  const productsRepo = collection<Product>('products');
  const warehousesRepo = collection<Warehouse>('warehouses');
  const binsRepo = collection<Bin>('bins');
  const inventoryRepo = collection<InventoryItem>('inventory');
  const movementsRepo = collection<StockMovement>('movements');
  const wavesRepo = collection<Wave>('waves');
  const tasksRepo = collection<PickTask>('pickTasks');
  const cycleRepo = collection<CycleCount>('cycleCounts');
  const equipmentRepo = collection<Equipment>('equipment');
  const packRepo = collection<PackSession>('packSessions');
  const tripsRepo = collection<Trip>('trips');
  const driversRepo = collection<Driver>('drivers');
  const vehiclesRepo = collection<Vehicle>('vehicles');
  const geofencesRepo = collection<Geofence>('geofences');
  const sosRepo = collection<SosAlert>('sosAlerts');
  const returnsRepo = collection<ReturnRequest>('returns');
  const remittancesRepo = collection<CodRemittance>('remittances');
  const bankRepo = collection<BankTransaction>('bankTransactions');
  const expensesRepo = collection<Expense>('expenses');
  const clientsRepo = collection<Client>('clients');
  const invoicesRepo = collection<Invoice>('invoices');
  const insightsRepo = collection<AiInsight>('aiInsights');
  const apiKeysRepo = collection<ApiKey>('apiKeys');
  const auditRepo = collection<AuditLog>('auditLogs');
  const usersRepo = collection<UserAccount>('users');
  const rolesRepo = collection<RoleDefinition>('roles');
  const webhooksRepo = collection<WebhookEndpoint>('webhooks');
  const notificationsRepo = collection<Notification>('notifications');

  function appendAudit(action: string, entity: string, entityRef: string) {
    const db = getDb();
    db.auditLogs.unshift({
      id: makeId('aud'),
      at: new Date().toISOString(),
      actor: 'Bạn (demo)',
      action,
      entity,
      entityRef,
      ip: '127.0.0.1',
      result: 'SUCCESS',
    });
    save();
  }

  return {
    orders: {
      ...ordersRepo,
      async createOrder(input: NewOrderInput) {
        await settle();
        const client = getDb().clients.find((row) => row.id === input.clientId);
        if (!client) throw new MockApiError('Không tìm thấy khách hàng.', 404);
        const warehouse = getDb().warehouses.find((row) => row.id === input.warehouseId);
        if (!warehouse) throw new MockApiError('Không tìm thấy kho nhận hàng.', 404);
        if (warehouse.status !== 'ACTIVE') {
          throw new MockApiError('Kho đang bảo trì, không nhận đơn mới.', 409);
        }
        const phone = input.customer.phone.replace(/\s+/g, '');
        if (!/^0\d{8,10}$/.test(phone)) {
          throw new MockApiError('Số điện thoại người nhận không hợp lệ.', 422);
        }
        if (!input.customer.name.trim() || !input.customer.address.trim()) {
          throw new MockApiError('Nhập tên và địa chỉ người nhận.', 422);
        }
        if ((input.weightKg ?? 1) <= 0) {
          throw new MockApiError('Khối lượng phải lớn hơn 0.', 422);
        }
        if ((input.codAmount ?? 0) < 0) {
          throw new MockApiError('COD không thể âm.', 422);
        }
        const now = new Date().toISOString();
        const order: Order = {
          id: makeId('ord'),
          trackingCode: trackingCode(),
          clientOrderRef: input.clientOrderRef || `${client.code}-${String(Date.now()).slice(-5)}`,
          clientId: client.id,
          clientName: client.name,
          status: 'NEW',
          service: input.service ?? 'STANDARD',
          customer: { ...input.customer, phone },
          warehouseId: input.warehouseId,
          codAmount: input.codAmount,
          shippingFee: input.shippingFee ?? 24_000,
          weightKg: input.weightKg ?? 1,
          volumeCbm: input.volumeCbm ?? 0.004,
          itemCount: input.itemCount ?? 1,
          notes: input.notes,
          createdAt: now,
          promisedAt: new Date(Date.now() + 2 * 24 * 3600_000).toISOString(),
          updatedAt: now,
          timeline: [{ at: now, label: 'Tạo đơn tại tenant portal', actor: 'Bạn (demo)' }],
        };
        getDb().orders.unshift(order);
        save();
        appendAudit('Tạo đơn hàng', 'order', order.trackingCode);
        return clone(order);
      },
      async advanceStatus(id: string, status: OrderStatus, label: string) {
        await settle();
        const order = getDb().orders.find((row) => row.id === id);
        if (!order) throw new MockApiError('Không tìm thấy đơn hàng.', 404);
        if (order.status === status) {
          throw new MockApiError('Đơn hàng đã ở trạng thái này.', 409);
        }
        const terminal: OrderStatus[] = ['DELIVERED', 'RETURNED', 'CANCELLED'];
        if (terminal.includes(order.status)) {
          throw new MockApiError('Đơn hàng đã kết thúc, không thể đổi trạng thái.', 409);
        }
        const allowed = statusToneOrder.indexOf(status) - statusToneOrder.indexOf(order.status);
        if (status !== 'CANCELLED' && allowed < 0) {
          throw new MockApiError('Không thể lùi trạng thái đơn hàng.', 409);
        }
        order.status = status;
        order.updatedAt = new Date().toISOString();
        order.timeline.push({ at: order.updatedAt, label, actor: 'Bạn (demo)' });
        save();
        appendAudit('Cập nhật trạng thái đơn', 'order', order.trackingCode);
        return clone(order);
      },
      async assignTrip(orderIds: string[], tripId: string) {
        await settle();
        const trip = getDb().trips.find((row) => row.id === tripId);
        if (!trip) throw new MockApiError('Không tìm thấy chuyến.', 404);
        if (trip.status === 'CANCELLED' || trip.status === 'COMPLETED') {
          throw new MockApiError('Chuyến đã kết thúc, không thể gán thêm đơn.', 409);
        }
        const blocked: OrderStatus[] = ['DELIVERED', 'RETURNED', 'CANCELLED'];
        const targets = getDb().orders.filter((order) => orderIds.includes(order.id));
        if (targets.length === 0) {
          throw new MockApiError('Chọn ít nhất một đơn để gán chuyến.', 422);
        }
        const invalid = targets.find((order) => blocked.includes(order.status));
        if (invalid) {
          throw new MockApiError(
            `Đơn ${invalid.trackingCode} đã kết thúc, không thể gán chuyến.`,
            409,
          );
        }
        targets.forEach((order) => {
          order.tripId = tripId;
          if (order.status === 'PACKED' || order.status === 'UNASSIGNED') {
            order.status = 'IN_TRANSIT';
            order.updatedAt = new Date().toISOString();
            order.timeline.push({
              at: order.updatedAt,
              label: `Gán vào chuyến ${trip.code}`,
              actor: 'Bạn (demo)',
            });
          }
        });
        save();
        return clone(targets);
      },
      async byTrackingCode(code: string) {
        await settle();
        const found = getDb().orders.find(
          (order) => order.trackingCode.toLowerCase() === code.trim().toLowerCase(),
        );
        return found ? clone(found) : null;
      },
      async partialShipment(orderId: string, note: string): Promise<OrderPartial> {
        await settle();
        const db = getDb();
        const order = db.orders.find((row) => row.id === orderId);
        if (!order) throw new MockApiError('Không tìm thấy đơn hàng.', 404);
        if (order.status !== 'PICKING' && order.status !== 'PACKED') {
          throw new MockApiError(
            'Chỉ đơn đang soạn hoặc đã đóng kiện mới phân chia được.',
            409,
          );
        }
        const partial: OrderPartial = {
          id: makeId('prt'),
          trackingCode: order.trackingCode,
          partialCode: shortCode('PXS'),
          reason: note.trim() || 'Phân đơn theo yêu cầu',
          status: 'PARTIAL',
          quantities: order.status === 'PICKING' ? [{ sku: 'SKU-0001', expected: 1, packed: 0 }] : [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          note,
        };
        db.orderPartials.unshift(partial);
        save();
        order.timeline.push({
          at: order.updatedAt,
          label: `Phân đơn ${partial.partialCode}`,
          actor: 'Bạn (demo)',
        });
        save();
        return clone(partial);
      },
      async reschedule(orderId: string, promisedAt: string, reason: string): Promise<Order> {
        await settle();
        const order = getDb().orders.find((row) => row.id === orderId);
        if (!order) throw new MockApiError('Không tìm thấy đơn hàng.', 404);
        if (order.status === 'DELIVERED' || order.status === 'CANCELLED') {
          throw new MockApiError('Đơn hàng đã kết thúc, không thể đổi thời gian.', 409);
        }
        order.promisedAt = promisedAt;
        order.updatedAt = new Date().toISOString();
        order.timeline.push({
          at: order.updatedAt,
          label: `Đổi giờ dự kiến: ${promisedAt.slice(0, 10)} — ${reason}`,
          actor: 'Bạn (demo)',
        });
        save();
        appendAudit('Đổi lịch giao hàng', 'order', order.trackingCode);
        return clone(order);
      },
      async live(trackingCode: string): Promise<OrderRoute> {
        await settle();
        const db = getDb();
        const order = db.orders.find((row) => row.trackingCode === trackingCode);
        if (!order) throw new MockApiError('Không tìm thấy đơn hàng.', 404);
        const trip = db.trips.find((row) => row.id === order.tripId);
        const vehicle = trip
          ? db.vehicles.find((row) => row.id === trip.vehicleId)
          : undefined;
        const useAddress = (vehicle?.status ?? 'AVAILABLE') !== 'MAINTENANCE';
        const stops = trip ? trip.stops : [];
        return {
          trackingCode: order.trackingCode,
          status: order.status,
          from: { name: order.clientName, address: '', lat: 10.7769, lng: 106.7009 },
          to: { name: order.customer.name, address: order.customer.address, lat: order.customer.lat, lng: order.customer.lng },
          current: {
            name: order.clientName,
            address: '',
            lat: useAddress ? 10.812 : 10.7769,
            lng: useAddress ? 10.634 : 106.7009,
          },
          nextStop:
            stops.length === 0
              ? undefined
              : {
                  name: stops[0].customerName,
                  address: stops[0].address,
                  lat: stops[0].lat,
                  lng: stops[0].lng,
                  eta: stops[0].eta,
                },
          eta: order.status === 'DELIVERED' ? null : order.promisedAt,
          driver: order.tripId
            ? { id: order.tripId, name: trip?.driverName ?? '', phone: '', plate: vehicle?.plate ?? '' }
            : { id: '', name: '', phone: '', plate: '' },
          service: order.service,
          promotionalAt: order.promisedAt,
        };
      },
      async sla(trackingCode: string) {
        await settle();
        const order = getDb().orders.find((row) => row.trackingCode === trackingCode);
        if (!order) throw new MockApiError('Không tìm thấy đơn hàng.', 404);
        const now = Date.now();
        const promised = new Date(order.promisedAt).getTime();
        const delivered = order.status === 'DELIVERED';
        const exceeded = !delivered && now > promised;
        return {
          trackingCode: order.trackingCode,
          status: order.status,
          sla: order.service === 'EXPRESS' || order.service === 'SAME_DAY' ? 'SLA' : 'STANDARD',
          promisedAt: order.promisedAt,
          actualAt: delivered ? order.updatedAt : null,
          satisfied: delivered ? new Date(order.updatedAt).getTime() <= promised : !exceeded,
          reason: exceeded ? 'Giao trễ do chờ phân bổ' : delivered ? 'Giao trước giờ hẹn' : undefined,
        };
      },
    },

    orderPartials: {
      async list() {
        await settle();
        return getDb().orderPartials.map(clone);
      },
      async get(id: string) {
        await settle();
        const found = getDb().orderPartials.find((row) => row.id === id);
        return found ? clone(found) : null;
      },
      async update({ id, status, note }: { id: string; status: OrderPartial['status']; note: string }): Promise<OrderPartial> {
        await settle();
        const record = getDb().orderPartials.find((row) => row.id === id);
        if (!record) throw new MockApiError('Không tìm thấy đơn phân chia.', 404);
        if (record.status === 'COMPLETE' || record.status === 'CANCELLED') {
          throw new MockApiError('Đơn phân chia đã kết thúc, không thể đổi trạng thái.', 409);
        }
        record.status = status;
        record.updatedAt = new Date().toISOString();
        record.note = note.trim();
        save();
        appendAudit('Cập nhật đơn phân chia', 'order_partial', record.partialCode);
        return clone(record);
      },
    },

    products: productsRepo,
    warehouses: warehousesRepo,
    bins: binsRepo,
    inventory: {
      ...inventoryRepo,
      async adjust(input: { inventoryId: string; quantity: number; reason: string }) {
        await settle();
        const item = getDb().inventory.find((row) => row.id === input.inventoryId);
        if (!item) throw new MockApiError('Không tìm thấy tồn kho.', 404);
        if (item.quantity + input.quantity < 0) {
          throw new MockApiError('Số lượng sau điều chỉnh không thể âm.', 409);
        }
        item.quantity += input.quantity;
        item.available = item.quantity - item.reserved;
        item.version += 1;
        item.updatedAt = new Date().toISOString();
        const movement: StockMovement = {
          id: makeId('mov'),
          at: item.updatedAt,
          type: 'ADJUST',
          sku: item.sku,
          productName: item.productName,
          quantity: input.quantity,
          warehouseCode: item.warehouseCode,
          binCode: item.binCode,
          reference: `ADJ-${Date.now().toString().slice(-6)}`,
          actor: 'Bạn (demo)',
          balanceAfter: item.quantity,
          note: input.reason,
        };
        getDb().movements.unshift(movement);
        save();
        appendAudit('Điều chỉnh tồn kho', 'inventory', item.sku);
        return clone(movement);
      },
      async receive(input: {
        sku: string;
        warehouseCode: string;
        binCode: string;
        quantity: number;
        lotNo?: string;
        expiryDate?: string | null;
      }) {
        await settle();
        if (input.quantity <= 0) throw new MockApiError('Số lượng nhập phải lớn hơn 0.', 422);
        const product = getDb().products.find((row) => row.sku === input.sku);
        if (!product) throw new MockApiError('SKU không tồn tại.', 404);
        const db = getDb();
        let item = db.inventory.find(
          (row) =>
            row.sku === input.sku &&
            row.warehouseCode === input.warehouseCode &&
            row.binCode === input.binCode,
        );
        if (!item) {
          const warehouse = db.warehouses.find((row) => row.code === input.warehouseCode);
          if (!warehouse) throw new MockApiError('Kho không tồn tại.', 404);
          item = {
            id: makeId('inv'),
            sku: product.sku,
            productName: product.name,
            warehouseId: warehouse.id,
            warehouseCode: warehouse.code,
            binCode: input.binCode,
            lotNo: input.lotNo || `L${new Date().getFullYear()}${String(Date.now()).slice(-3)}`,
            quantity: 0,
            reserved: 0,
            available: 0,
            expiryDate: input.expiryDate ?? null,
            version: 1,
            updatedAt: new Date().toISOString(),
          };
          db.inventory.unshift(item);
        }
        item.quantity += input.quantity;
        item.available = item.quantity - item.reserved;
        item.version += 1;
        item.updatedAt = new Date().toISOString();
        db.movements.unshift({
          id: makeId('mov'),
          at: item.updatedAt,
          type: 'RECEIVE',
          sku: item.sku,
          productName: item.productName,
          quantity: input.quantity,
          warehouseCode: item.warehouseCode,
          binCode: item.binCode,
          reference: `PO-${Date.now().toString().slice(-6)}`,
          actor: 'Bạn (demo)',
          balanceAfter: item.quantity,
        });
        save();
        appendAudit('Nhập kho', 'inventory', item.sku);
        return clone(item);
      },
      async putawaySuggestion(sku: string, quantity: number) {
        await settle();
        const product = getDb().products.find((row) => row.sku === sku);
        if (!product) throw new MockApiError('SKU không tồn tại.', 404);
        const candidate = getDb()
          .bins.map((bin) => {
            const warehouse = getDb().warehouses.find((row) => row.id === bin.warehouseId);
            return { bin, warehouse };
          })
          .filter((row) => row.warehouse?.status === 'ACTIVE')
          .map(({ bin, warehouse }) => ({
            bin,
            warehouse,
            remainingWeight: bin.maxWeightKg - bin.usedWeightKg,
            remainingVolume: bin.maxVolumeCbm - bin.usedVolumeCbm,
          }))
          .filter(
            (row) =>
              row.remainingWeight >= product.weightKg * quantity &&
              row.remainingVolume >= product.volumeCbm * quantity,
          )
          .sort((a, b) => b.remainingVolume - a.remainingVolume)[0];
        if (!candidate) {
          throw new MockApiError('Không còn bin đủ sức chứa cho lô hàng này.', 409);
        }
        return {
          binCode: candidate.bin.code,
          warehouseCode: candidate.warehouse!.code,
          zone: candidate.bin.zone,
          remainingVolume: Number(candidate.remainingVolume.toFixed(2)),
        };
      },
    },
    movements: movementsRepo,
    waves: {
      ...wavesRepo,
      async allocate(input: {
        warehouseId: string;
        orderIds: string[];
        strategy: Wave['strategy'];
        picker?: string;
      }) {
        await settle();
        if (input.orderIds.length === 0) {
          throw new MockApiError('Chọn ít nhất một đơn để gom wave.', 422);
        }
        const db = getDb();
        const warehouse = db.warehouses.find((row) => row.id === input.warehouseId);
        if (!warehouse) throw new MockApiError('Kho không tồn tại.', 404);

        const waveOrders = input.orderIds
          .map((orderId) => db.orders.find((row) => row.id === orderId))
          .filter((order): order is Order => Boolean(order));
        if (waveOrders.length !== input.orderIds.length) {
          throw new MockApiError('Có đơn không tồn tại trong tenant.', 404);
        }
        const allocatable: OrderStatus[] = ['NEW', 'UNASSIGNED', 'PENDING_PICKUP'];
        const wrongState = waveOrders.find((order) => !allocatable.includes(order.status));
        if (wrongState) {
          throw new MockApiError(
            `Đơn ${wrongState.trackingCode} không ở trạng thái có thể gom wave.`,
            409,
          );
        }
        const wrongWarehouse = waveOrders.find((order) => order.warehouseId !== warehouse.id);
        if (wrongWarehouse) {
          throw new MockApiError(
            `Đơn ${wrongWarehouse.trackingCode} không thuộc kho ${warehouse.code}.`,
            409,
          );
        }

        const pickable = db.inventory.filter(
          (item) => item.warehouseId === warehouse.id && item.available > 0,
        );
        if (pickable.length === 0) {
          throw new MockApiError('Kho không có tồn khả dụng để phân bổ.', 409);
        }

        const wave: Wave = {
          id: makeId('wav'),
          code: shortCode('WAV'),
          warehouseId: warehouse.id,
          warehouseCode: warehouse.code,
          strategy: input.strategy,
          status: 'ALLOCATED',
          orderCount: input.orderIds.length,
          taskCount: input.orderIds.length,
          picker: input.picker || 'Chưa gán',
          zone: 'A',
          createdAt: new Date().toISOString(),
          releasedAt: new Date().toISOString(),
        };
        db.waves.unshift(wave);

        if (input.strategy === 'FEFO') {
          pickable.sort((a, b) => (a.expiryDate || '9999').localeCompare(b.expiryDate || '9999'));
        } else if (input.strategy === 'LIFO') {
          pickable.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        } else {
          pickable.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
        }

        input.orderIds.forEach((orderId, index) => {
          const order = db.orders.find((row) => row.id === orderId);
          if (!order) return;
          const item = pickable[index % pickable.length];
          db.pickTasks.unshift({
            id: makeId('tsk'),
            waveId: wave.id,
            waveCode: wave.code,
            orderTrackingCode: order.trackingCode,
            sku: item.sku,
            productName: item.productName,
            binCode: item.binCode,
            quantity: Math.min(item.available, order.itemCount),
            pickedQuantity: 0,
            status: 'PENDING',
            assignee: wave.picker,
            sequence: index + 1,
          });
          order.status = 'PICKING';
          order.updatedAt = new Date().toISOString();
          order.timeline.push({
            at: order.updatedAt,
            label: `Phân bổ vào wave ${wave.code} (${input.strategy})`,
            actor: 'Hệ thống WMS',
          });
        });
        save();
        appendAudit('Tạo wave picking', 'wave', wave.code);
        return clone(wave);
      },
    },
    pickTasks: {
      ...tasksRepo,
      async confirm(taskId: string, pickedQuantity: number) {
        await settle();
        const db = getDb();
        const task = db.pickTasks.find((row) => row.id === taskId);
        if (!task) throw new MockApiError('Không tìm thấy tác vụ soạn hàng.', 404);
        if (task.status === 'PICKED') {
          throw new MockApiError('Tác vụ này đã được xác nhận.', 409);
        }
        if (pickedQuantity <= 0) throw new MockApiError('Số lượng soạn phải lớn hơn 0.', 422);
        task.pickedQuantity = Math.min(pickedQuantity, task.quantity);
        task.status = task.pickedQuantity >= task.quantity ? 'PICKED' : 'SHORT';
        const waveTasks = db.pickTasks.filter((row) => row.waveId === task.waveId);
        const wave = db.waves.find((row) => row.id === task.waveId);
        if (wave) {
          wave.status = waveTasks.every((row) => row.status === 'PICKED')
            ? 'PICKED'
            : waveTasks.some((row) => row.status !== 'PENDING')
              ? 'PICKING'
              : wave.status;
        }
        save();
        return clone(task);
      },
    },
    cycleCounts: {
      ...cycleRepo,
      async submit(id: string, countedLines: number, varianceUnits: number) {
        await settle();
        const record = getDb().cycleCounts.find((row) => row.id === id);
        if (!record) throw new MockApiError('Không tìm thấy phiếu kiểm kê.', 404);
        if (record.status === 'APPROVED') {
          throw new MockApiError('Phiếu kiểm kê đã duyệt.', 409);
        }
        if (countedLines > record.lines) {
          throw new MockApiError('Số dòng đã đếm vượt quá số dòng của phiếu.', 422);
        }
        record.countedLines = countedLines;
        record.varianceUnits = varianceUnits;
        record.status = countedLines === record.lines ? 'REVIEW' : 'COUNTING';
        save();
        return clone(record);
      },
      async approve(id: string) {
        await settle();
        const record = getDb().cycleCounts.find((row) => row.id === id);
        if (!record) throw new MockApiError('Không tìm thấy phiếu kiểm kê.', 404);
        if (record.countedLines < record.lines) {
          throw new MockApiError('Chưa đếm đủ số dòng, không thể duyệt.', 409);
        }
        record.status = 'APPROVED';
        record.closedAt = new Date().toISOString();
        save();
        appendAudit('Duyệt kiểm kê', 'cycle_count', record.code);
        return clone(record);
      },
    },
    equipment: equipmentRepo,
    packSessions: {
      ...packRepo,
      async seal(id: string, scannedSku: string) {
        await settle();
        const session = getDb().packSessions.find((row) => row.id === id);
        if (!session) throw new MockApiError('Không tìm thấy phiên đóng gói.', 404);
        if (session.status === 'SEALED') {
          throw new MockApiError('Phiên đã đóng kiện.', 409);
        }
        if (session.status === 'VOID') {
          throw new MockApiError('Phiên đã huỷ.', 409);
        }
        if (!scannedSku.trim()) {
          throw new MockApiError('Nhập hoặc quét SKU trước khi đóng kiện.', 422);
        }
        session.scannedSku = scannedSku.trim();
        session.match = scannedSku === session.expectedSku ? 'MATCH' : 'MISMATCH';
        session.status = session.match === 'MATCH' ? 'SEALED' : 'OPEN';
        session.confidence = session.match === 'MATCH' ? Math.max(session.confidence, 0.9) : 0.42;
        save();
        return clone(session);
      },
    },
    trips: {
      ...tripsRepo,
      async assign(input: { tripId: string; driverId: string; vehicleId: string }) {
        await settle();
        const db = getDb();
        const trip = db.trips.find((row) => row.id === input.tripId);
        const driver = db.drivers.find((row) => row.id === input.driverId);
        const vehicle = db.vehicles.find((row) => row.id === input.vehicleId);
        if (!trip || !driver || !vehicle) {
          throw new MockApiError('Không tìm thấy chuyến, tài xế hoặc xe.', 404);
        }
        if (vehicle.status === 'MAINTENANCE') {
          throw new MockApiError('Xe đang bảo trì, không thể phân công.', 409);
        }
        trip.driverId = driver.id;
        trip.driverName = driver.name;
        trip.vehicleId = vehicle.id;
        trip.vehiclePlate = vehicle.plate;
        trip.status = 'DISPATCHED';
        driver.status = 'ON_TRIP';
        vehicle.status = 'IN_USE';
        save();
        appendAudit('Phân công chuyến', 'trip', trip.code);
        return clone(trip);
      },
      async optimize(tripId: string) {
        await settle();
        const trip = getDb().trips.find((row) => row.id === tripId);
        if (!trip) throw new MockApiError('Không tìm thấy chuyến.', 404);
        if (trip.optimized) throw new MockApiError('Chuyến này đã được tối ưu.', 409);
        trip.plannedDistanceKm = Number((trip.plannedDistanceKm * 0.82).toFixed(1));
        trip.plannedDurationMin = Math.round(trip.plannedDurationMin * 0.88);
        trip.optimized = true;
        save();
        appendAudit('Tối ưu lộ trình', 'trip', trip.code);
        return clone(trip);
      },
      async start(tripId: string) {
        await settle();
        const trip = getDb().trips.find((row) => row.id === tripId);
        if (!trip) throw new MockApiError('Không tìm thấy chuyến.', 404);
        if (trip.status !== 'PLANNED' && trip.status !== 'DISPATCHED') {
          throw new MockApiError('Chỉ chuyến đã lập hoặc đã điều phối mới có thể bắt đầu.', 409);
        }
        trip.status = 'IN_PROGRESS';
        trip.startedAt = new Date().toISOString();
        save();
        return clone(trip);
      },
      async complete(tripId: string): Promise<Trip> {
        await settle();
        const trip = getDb().trips.find((row) => row.id === tripId);
        if (!trip) throw new MockApiError('Không tìm thấy chuyến.', 404);
        if (trip.status !== 'IN_PROGRESS') {
          throw new MockApiError('Chỉ chuyến đang chạy mới có thể đóng.', 409);
        }
        trip.status = 'COMPLETED';
        trip.completedAt = new Date().toISOString();
        trip.stops = trip.stops.map((stop) =>
          stop.status === 'FAILED' ? stop : { ...stop, status: 'DELIVERED' },
        );
        trip.codCollected = trip.stops
          .filter((stop) => stop.status === 'DELIVERED')
          .reduce((total, stop) => total + stop.codAmount, 0);
        const driver = getDb().drivers.find((row) => row.id === trip.driverId);
        if (driver) {
          driver.status = 'AVAILABLE';
          driver.codOnHand += trip.codCollected;
        }
        const vehicle = getDb().vehicles.find((row) => row.id === trip.vehicleId);
        if (vehicle) vehicle.status = 'AVAILABLE';
        save();
        appendAudit('Đóng chuyến', 'trip', trip.code);
        return clone(trip);
      },
      async submitPOD({
        tripId,
        photo,
        signature,
        deliveredAt,
        recipient,
        note,
      }: {
        tripId: string;
        photo: string;
        signature: string;
        deliveredAt: string;
        recipient: string;
        note?: string;
      }): Promise<PODRecord> {
        await settle();
        const db = getDb();
        const trip = db.trips.find((row) => row.id === tripId);
        if (!trip) throw new MockApiError('Không tìm thấy chuyến.', 404);
        if (trip.status !== 'COMPLETED') {
          throw new MockApiError('Chỉ chuyến đã hoàn thành mới ghi nhận POD.', 409);
        }
        const stop = trip.stops[trip.stops.length - 1];
        const order = db.orders.find((row) => row.trackingCode === stop.orderTrackingCode);
        const record: PODRecord = {
          id: makeId('pod'),
          tripId: trip.id,
          tripCode: trip.code,
          driverId: trip.driverId,
          driverName: trip.driverName,
          customerName: stop.customerName,
          contactPhone: order?.customer.phone ?? stop.customerName,
          photo: photo.trim(),
          signature: signature.trim(),
          deliveredAt: deliveredAt,
          recipient: recipient.trim(),
          note: note?.trim(),
          createdAt: new Date().toISOString(),
        };
        db.pods.unshift(record);
        save();
        appendAudit('Ghi nhận POD', 'trip', trip.code);
        return clone(record);
      },
      async pod(tripId: string): Promise<PODRecord[]> {
        await settle();
        const trips = getDb().trips.filter((row) => row.id === tripId);
        if (trips.length === 0) throw new MockApiError('Không tìm thấy chuyến.', 404);
        return getDb().pods.filter((row) => row.tripId === tripId).map(clone);
      },
    },
    drivers: {
      ...driversRepo,
      async ranking(input?: { period?: string }): Promise<DriverReport[]> {
        await settle();
        const db = getDb();
        const month = input?.period ?? `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
        const trips = db.trips.filter((t) => t.startedAt !== null && t.startedAt.startsWith(month));
        const activities = db.driverActivities.filter((a) => a.at.startsWith(month));
        return db.drivers.map((driver) => {
          const driverTrips = trips.filter((t) => t.driverId === driver.id);
          return {
            driverId: driver.id,
            driverName: driver.name,
            status: driver.status,
            phone: driver.phone,
            month,
            trips: driverTrips.length,
            orders: driverTrips.reduce((total, t) => total + t.stops.length, 0),
            distanceKm: driverTrips.reduce((total, t) => total + Math.round(t.actualDistanceKm), 0),
            fuelCost: driverTrips.reduce((total, t) => total + t.fuelCost, 0),
            onTimeRate: 98,
            rating: driver.rating,
            incidents: activities.filter((a) => a.driverId === driver.id && a.kind === 'FINE').length,
            complained: 0,
          };
        });
      },
      async tripLog(input: { driverId: string }): Promise<DriverActivity[]> {
        await settle();
        return getDb().driverActivities.filter((a) => a.driverId === input.driverId).map(clone);
      },
    },
    vehicles: {
      ...vehiclesRepo,
      async fuelLog(input: Omit<FuelLog, 'id' | 'vehiclePlate'>): Promise<FuelLog> {
        await settle();
        const vehicle = getDb().vehicles.find((row) => row.id === input.vehicleId);
        if (!vehicle) throw new MockApiError('Không tìm thấy xe.', 404);
        const record: FuelLog = { ...input, id: makeId('fuel'), vehiclePlate: vehicle.plate };
        getDb().fuelLogs.unshift(record);
        save();
        appendAudit('Nhập nhiên liệu', 'vehicle', vehicle.plate);
        return clone(record);
      },
      async maintenanceLog(input: Omit<MaintenanceRecord, 'id' | 'vehiclePlate'> & { doneAt?: IsoDate | null }): Promise<MaintenanceRecord> {
        await settle();
        const vehicle = getDb().vehicles.find((row) => row.id === input.vehicleId);
        if (!vehicle) throw new MockApiError('Không tìm thấy xe.', 404);
        const record: MaintenanceRecord = {
          ...input,
          id: makeId('mt'),
          vehiclePlate: vehicle.plate,
          doneAt: input.doneAt ?? null,
        };
        getDb().maintenanceRecords.unshift(record);
        save();
        appendAudit('Nhập bảo trì', 'vehicle', vehicle.plate);
        return clone(record);
      },
    },
    geofences: geofencesRepo,
    sosAlerts: {
      ...sosRepo,
      async acknowledge(id: string) {
        await settle();
        const alert = getDb().sosAlerts.find((row) => row.id === id);
        if (!alert) throw new MockApiError('Không tìm thấy cảnh báo.', 404);
        if (alert.status === 'RESOLVED') {
          throw new MockApiError('Cảnh báo đã đóng, không thể tiếp nhận lại.', 409);
        }
        alert.status = 'ACKNOWLEDGED';
        alert.acknowledgedBy = 'Bạn (demo)';
        save();
        appendAudit('Tiếp nhận cảnh báo SOS', 'sos_alert', alert.code);
        return clone(alert);
      },
      async resolve(id: string, note: string) {
        await settle();
        const alert = getDb().sosAlerts.find((row) => row.id === id);
        if (!alert) throw new MockApiError('Không tìm thấy cảnh báo.', 404);
        if (alert.status === 'OPEN') {
          throw new MockApiError('Phải tiếp nhận cảnh báo trước khi đóng.', 409);
        }
        if (alert.status === 'RESOLVED') {
          throw new MockApiError('Cảnh báo đã đóng.', 409);
        }
        if (!note.trim()) {
          throw new MockApiError('Nhập ghi chú xử lý trước khi đóng cảnh báo.', 422);
        }
        alert.status = 'RESOLVED';
        alert.note = note.trim();
        alert.acknowledgedBy = alert.acknowledgedBy || 'Bạn (demo)';
        save();
        appendAudit('Đóng cảnh báo SOS', 'sos_alert', alert.code);
        return clone(alert);
      },
    },
    returns: {
      ...returnsRepo,
      async inspect(
        id: string,
        input: { inspection: ReturnRequest['inspection']; status: ReturnRequest['status']; note?: string },
      ) {
        await settle();
        const record = getDb().returns.find((row) => row.id === id);
        if (!record) throw new MockApiError('Không tìm thấy phiếu trả hàng.', 404);
        if (input.status === 'REFUNDED' && input.inspection === 'PENDING') {
          throw new MockApiError('Phải kiểm định hàng trước khi hoàn tiền.', 422);
        }
        if (record.status === 'REFUNDED' || record.status === 'REJECTED') {
          throw new MockApiError('Phiếu trả hàng đã kết thúc.', 409);
        }
        record.inspection = input.inspection;
        record.status = input.status;
        record.note = input.note ?? record.note;
        if (input.status === 'REFUNDED' || input.status === 'REJECTED') {
          record.resolvedAt = new Date().toISOString();
          if (input.status === 'REJECTED') record.refundAmount = 0;
        }
        save();
        appendAudit('Xử lý trả hàng', 'return', record.code);
        return clone(record);
      },
      async refund(id: string, reason: string): Promise<ReturnRequest> {
        await settle();
        const record = getDb().returns.find((row) => row.id === id);
        if (!record) throw new MockApiError('Không tìm thấy phiếu trả hàng.', 404);
        if (record.status !== 'APPROVED' && record.status !== 'IN_TRANSIT') {
          throw new MockApiError('Chỉ phiếu đã duyệt mới hoàn tiền được.', 409);
        }
        record.status = 'REFUNDED';
        record.refundAmount = record.refundAmount || 0;
        record.resolvedAt = new Date().toISOString();
        record.note = record.note ? `${record.note} — ${reason.trim()}` : reason.trim();
        save();
        appendAudit('Hoàn tiền trả hàng', 'return', record.code);
        return clone(record);
      },
    },
    remittances: {
      ...remittancesRepo,
      async submit(id: string, submittedAmount: number) {
        await settle();
        const record = getDb().remittances.find((row) => row.id === id);
        if (!record) throw new MockApiError('Không tìm thấy phiếu quyết toán.', 404);
        if (record.status === 'RECONCILED') {
          throw new MockApiError('Phiếu đã đối soát, không thể nộp lại.', 409);
        }
        if (submittedAmount <= 0) throw new MockApiError('Số tiền nộp phải lớn hơn 0.', 422);
        record.submittedAmount = submittedAmount;
        record.variance = submittedAmount - record.expectedAmount;
        record.status = record.variance === 0 ? 'SUBMITTED' : 'DISPUTED';
        record.submittedAt = new Date().toISOString();
        save();
        appendAudit('Nộp quyết toán COD', 'cod_remittance', record.code);
        return clone(record);
      },
      async reconcile(id: string, bankTransactionId: string) {
        await settle();
        const db = getDb();
        const record = db.remittances.find((row) => row.id === id);
        const txn = db.bankTransactions.find((row) => row.id === bankTransactionId);
        if (!record || !txn) throw new MockApiError('Không tìm thấy phiếu hoặc giao dịch.', 404);
        if (record.status === 'PENDING') {
          throw new MockApiError('Tài xế chưa nộp tiền, không thể đối soát.', 409);
        }
        if (record.status === 'RECONCILED') {
          throw new MockApiError('Phiếu này đã được đối soát.', 409);
        }
        if (txn.matchedRemittanceId) {
          throw new MockApiError('Giao dịch này đã được đối soát.', 409);
        }
        if (Math.round(txn.amount) !== Math.round(record.submittedAmount)) {
          record.status = 'DISPUTED';
          record.note = `Số tiền ngân hàng ${txn.amount.toLocaleString('vi-VN')} ₫ không khớp phiếu nộp.`;
          save();
          return clone(record);
        }
        record.status = 'RECONCILED';
        record.bankRef = txn.bankRef;
        record.reconciledAt = new Date().toISOString();
        record.variance = record.submittedAmount - record.expectedAmount;
        txn.matchedRemittanceId = record.id;
        txn.matchedAt = new Date().toISOString();
        save();
        appendAudit('Đối soát COD', 'cod_remittance', record.code);
        return clone(record);
      },
    },
    bankTransactions: bankRepo,
    expenses: {
      ...expensesRepo,
      async decide(id: string, decision: 'APPROVED' | 'REJECTED', note?: string) {
        await settle();
        const record = getDb().expenses.find((row) => row.id === id);
        if (!record) throw new MockApiError('Không tìm thấy phiếu chi.', 404);
        if (record.status === 'APPROVED' || record.status === 'REJECTED') {
          throw new MockApiError('Phiếu chi đã được xử lý.', 409);
        }
        if (decision === 'REJECTED' && !note?.trim()) {
          throw new MockApiError('Nhập lý do từ chối phiếu chi.', 422);
        }
        record.status = decision;
        record.note = note?.trim() || record.note;
        save();
        appendAudit(decision === 'APPROVED' ? 'Duyệt chi phí' : 'Từ chối chi phí', 'expense', record.code);
        return clone(record);
      },
    },
    clients: {
      ...clientsRepo,
      async credit(id: string, amount: number) {
        await settle();
        const client = getDb().clients.find((row) => row.id === id);
        if (!client) throw new MockApiError('Không tìm thấy khách hàng.', 404);
        if (amount <= 0) throw new MockApiError('Số tiền hạn mức tăng phải lớn hơn 0.', 422);
        client.creditLimit += amount;
        save();
        appendAudit('Tăng hạn mức khách hàng', 'client', client.code);
        return clone(client);
      },
    },
    customers: {
      async list(filter?: (row: Customer) => boolean) {
        await settle();
        const all = getDb().customers;
        return (filter ? all.filter(filter) : all).map(clone);
      },
      async get(id: string) {
        await settle();
        const found = getDb().customers.find((row) => row.id === id);
        return found ? clone(found) : null;
      },
      async stat(customerId: string): Promise<Customer & { totalOrders: number; totalSpent: number; avgRating: number; lastOrderAt: IsoDate | null }> {
        await settle();
        const customer = getDb().customers.find((row) => row.id === customerId);
        if (!customer) throw new MockApiError('Không tìm thấy khách hàng.', 404);
        const orders = getDb().orders.filter((row) => row.clientId === customerId);
        const reviews = getDb().reviews.filter((row) => row.customerId === customerId);
        return {
          ...customer,
          totalOrders: orders.length,
          totalSpent: sum(orders.map((row) => row.codAmount + row.shippingFee)),
          avgRating: reviews.length === 0 ? 0 : sum(reviews.map((row) => row.rating)) / reviews.length,
          lastOrderAt:
            orders.length === 0 ? null : orders[0].createdAt,
        };
      },
      async reviews(customerId: string) {
        await settle();
        return getDb().reviews.filter((row) => row.customerId === customerId).map(clone);
      },
    },
    reports: {
      async summary(params: ReportParams): Promise<ReportSummary> {
        await settle();
        const db = getDb();
        const now = new Date();
        const period = params.period ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const orders = db.orders.filter((o) => o.createdAt.startsWith(period));
        const delivered = orders.filter((o) => o.status === 'DELIVERED');
        const late = delivered.filter((o) => new Date(o.updatedAt).getTime() > new Date(o.promisedAt).getTime());
        const onTime = delivered.filter((o) => new Date(o.updatedAt).getTime() <= new Date(o.promisedAt).getTime());
        const revenue = sum(delivered.map((o) => o.codAmount + o.shippingFee));
        return {
          period,
          orders: { total: orders.length, delivered: delivered.length, late: late.length, onTime: onTime.length },
          revenue,
          cost: sum(db.expenses.map((e) => e.amount)) + 186_400_000,
          profit: revenue - (sum(db.expenses.map((e) => e.amount)) + 186_400_000),
          codPending: sum(db.remittances.filter((r) => ['PENDING', 'SUBMITTED', 'DISPUTED'].includes(r.status)).map((r) => r.submittedAmount)),
          fleetUtilization: Math.round((db.vehicles.filter((v) => v.status === 'IN_USE').length / Math.max(1, db.vehicles.length)) * 100),
          onTimeRate: delivered.length === 0 ? 100 : Number((onTime.length / delivered.length * 100).toFixed(1)),
        };
      },
      async onTime(params: ReportParams): Promise<ReportOnTime> {
        await settle();
        const db = getDb();
        const period = params.period ?? `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
        const orders = db.orders.filter((o) => o.status === 'DELIVERED' && o.createdAt.startsWith(period));
        const isLate = (o: Order) => new Date(o.updatedAt).getTime() > new Date(o.promisedAt).getTime();
        const grouped = [...new Set(orders.map((o) => o.warehouseId))]
          .map((warehouseId) => {
            const groupOrders = orders.filter((o) => o.warehouseId === warehouseId);
            return {
              id: warehouseId,
              name: db.warehouses.find((w) => w.id === warehouseId)?.code ?? warehouseId,
              onTime: groupOrders.filter((o) => !isLate(o)).length,
              late: groupOrders.filter((o) => isLate(o)).length,
              total: groupOrders.length,
              rate: groupOrders.length === 0 ? 100 : Number((groupOrders.filter((o) => !isLate(o)).length / groupOrders.length * 100).toFixed(1)),
            };
          });
        return { period, groupBy: params.groupBy, groups: grouped };
      },
      async costs(params: ReportParams): Promise<ReportCosts> {
        await settle();
        const db = getDb();
        const period = params.period ?? `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
        const items = db.expenses.filter((e) => e.createdAt.startsWith(period));
        const categories: ReportCostCategory['category'][] = [
          'FUEL', 'TOLL', 'PARKING', 'MAINTENANCE', 'ALLOWANCE', 'OTHER',
          'WAREHOUSE', 'SALARY', 'INSURANCE', 'DEPRECIATION',
        ];
        const categoryValues: Record<ReportCostCategory['category'], number> = {
          FUEL: sum(items.filter((e) => e.type === 'FUEL').map((e) => e.amount)),
          TOLL: sum(items.filter((e) => e.type === 'TOLL').map((e) => e.amount)),
          PARKING: sum(items.filter((e) => e.type === 'PARKING').map((e) => e.amount)),
          MAINTENANCE: sum(items.filter((e) => e.type === 'MAINTENANCE').map((e) => e.amount)),
          ALLOWANCE: sum(items.filter((e) => e.type === 'ALLOWANCE').map((e) => e.amount)),
          OTHER: sum(items.filter((e) => e.type === 'OTHER').map((e) => e.amount)),
          WAREHOUSE: 12_400_000,
          SALARY: 8_500_000,
          INSURANCE: 2_200_000,
          DEPRECIATION: 1_100_000,
        };
        return {
          period,
          total: sum(items.map((e) => e.amount)) + 186_400_000,
          byCategory: categories.map((category) => ({ category, amount: categoryValues[category] })),
        };
      },
      async fleet(params: ReportParams): Promise<ReportFleet> {
        await settle();
        const db = getDb();
        const period = params.period ?? `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
        const byVehicle: ReportFleetVehicle[] = db.vehicles.map((vehicle) => {
          const trips = db.trips.filter((t) => t.vehicleId === vehicle.id);
          const fuelCost = sum(db.fuelLogs.filter((l) => l.vehicleId === vehicle.id).map((l) => l.cost));
          return {
            id: vehicle.id,
            plate: vehicle.plate,
            type: vehicle.type,
            trips: trips.length,
            distanceKm: sum(trips.map((t) => Math.round(t.actualDistanceKm))),
            fuelCost,
            maintenanceCost: sum(db.maintenanceRecords.filter((m) => m.vehicleId === vehicle.id).map((m) => m.cost)),
            revenue: sum(db.invoices.map((i) => i.amount)) / Math.max(1, db.vehicles.length),
            utilizableDays: vehicle.status === 'AVAILABLE' ? 30 : 0,
            downtimeDays: vehicle.status === 'MAINTENANCE' ? 5 : 0,
            rate: vehicle.status === 'IN_USE' ? 86 : vehicle.status === 'AVAILABLE' ? 100 : 0,
          };
        });
        return { period, byVehicle };
      },
    },
    invoices: {
      ...invoicesRepo,
      async recordPayment(id: string, amount: number) {
        await settle();
        const invoice = getDb().invoices.find((row) => row.id === id);
        if (!invoice) throw new MockApiError('Không tìm thấy hoá đơn.', 404);
        if (invoice.status === 'VOID') {
          throw new MockApiError('Hoá đơn đã huỷ, không thể ghi nhận thanh toán.', 409);
        }
        if (invoice.status === 'PAID') {
          throw new MockApiError('Hoá đơn đã thanh toán đủ.', 409);
        }
        if (amount <= 0) {
          throw new MockApiError('Số tiền thanh toán phải lớn hơn 0.', 422);
        }
        const remaining = invoice.amount - invoice.paidAmount;
        if (amount > remaining) {
          throw new MockApiError(
            `Số tiền vượt quá công nợ còn lại (${remaining.toLocaleString('vi-VN')} ₫).`,
            422,
          );
        }
        invoice.paidAmount += amount;
        invoice.status = invoice.paidAmount >= invoice.amount ? 'PAID' : 'SENT';
        save();
        appendAudit('Ghi nhận thanh toán', 'invoice', invoice.code);
        return clone(invoice);
      },
    },
    aiInsights: {
      ...insightsRepo,
      async decide(id: string, status: AiInsight['status']) {
        await settle();
        const record = getDb().aiInsights.find((row) => row.id === id);
        if (!record) throw new MockApiError('Không tìm thấy khuyến nghị.', 404);
        if (record.status === 'ACTIONED' || record.status === 'DISMISSED') {
          throw new MockApiError('Khuyến nghị đã kết thúc, không thể đổi trạng thái.', 409);
        }
        record.status = status;
        save();
        appendAudit('Xử lý khuyến nghị AI', 'ai_insight', record.id);
        return clone(record);
      },
    },
    apiKeys: {
      ...apiKeysRepo,
      async issue(input: { name: string; scopes: string[] }) {
        await settle();
        if (!input.name.trim()) throw new MockApiError('Tên khoá không được để trống.', 422);
        const raw = `slg_live_${Math.random().toString(36).slice(2, 10)}`;
        const record: ApiKey = {
          id: makeId('key'),
          name: input.name.trim(),
          prefix: raw.slice(0, 13),
          scopes: input.scopes,
          status: 'ACTIVE',
          createdAt: new Date().toISOString(),
          lastUsedAt: null,
          createdBy: 'Bạn (demo)',
        };
        getDb().apiKeys.unshift(record);
        save();
        appendAudit('Tạo API key', 'api_key', record.prefix);
        return { record: clone(record), secret: raw };
      },
      async revoke(id: string) {
        await settle();
        const key = getDb().apiKeys.find((row) => row.id === id);
        if (!key) throw new MockApiError('Không tìm thấy API key.', 404);
        key.status = 'REVOKED';
        save();
        appendAudit('Thu hồi API key', 'api_key', key.prefix);
        return clone(key);
      },
    },
    auditLogs: auditRepo,
    users: {
      ...usersRepo,
      async invite(input: { name: string; email: string; role: string }) {
        await settle();
        if (!input.email.includes('@')) throw new MockApiError('Email không hợp lệ.', 422);
        const email = input.email.trim().toLowerCase();
        if (getDb().users.some((row) => row.email.toLowerCase() === email)) {
          throw new MockApiError('Email đã tồn tại trong tenant.', 409);
        }
        const user: UserAccount = {
          id: makeId('usr'),
          name: input.name.trim(),
          email,
          phone: '',
          role: input.role,
          status: 'INVITED',
          lastActiveAt: null,
          createdAt: new Date().toISOString(),
        };
        getDb().users.unshift(user);
        save();
        appendAudit('Mời người dùng', 'user', user.email);
        return clone(user);
      },
      async setStatus(id: string, status: UserAccount['status']) {
        await settle();
        const user = getDb().users.find((row) => row.id === id);
        if (!user) throw new MockApiError('Không tìm thấy người dùng.', 404);
        user.status = status;
        save();
        appendAudit('Đổi trạng thái người dùng', 'user', user.email);
        return clone(user);
      },
    },
    roles: rolesRepo,
    webhooks: {
      ...webhooksRepo,
      async setStatus(id: string, status: WebhookEndpoint['status']) {
        await settle();
        const hook = getDb().webhooks.find((row) => row.id === id);
        if (!hook) throw new MockApiError('Không tìm thấy webhook.', 404);
        hook.status = status;
        save();
        return clone(hook);
      },
    },
    notifications: {
      ...notificationsRepo,
      async markAllRead() {
        await settle();
        getDb().notifications.forEach((item) => {
          item.read = true;
        });
        save();
        return clone(getDb().notifications);
      },
      async send(input: { to: string; kind: NotificationEventKind; subject: string; body: string; refId?: string }): Promise<NotificationEvent> {
        await settle();
        const record: NotificationEvent = {
          id: makeId('nevt'),
          kind: input.kind,
          to: input.to,
          recipientName: '',
          subject: input.subject,
          body: input.body,
          status: 'SENT',
          sentAt: new Date().toISOString(),
          deliveredAt: null,
          createdAt: new Date().toISOString(),
          extra: { refId: input.refId },
        };
        getDb().notificationsEvents.unshift(record);
        save();
        appendAudit('Gửi thông báo', 'notification', record.id);
        return clone(record);
      },
      async events(filter?: (row: NotificationEvent) => boolean): Promise<NotificationEvent[]> {
        await settle();
        const all = getDb().notificationsEvents;
        return (filter ? all.filter(filter) : all).map(clone);
      },
    },
    settings: {
      get: async () => {
        await settle();
        return clone(getDb().settings);
      },
      update: async (patch: Partial<TenantSettings>) => {
        await settle();
        const current = getDb().settings;
        const next: TenantSettings = {
          ...current,
          ...patch,
          id: 'tenant-settings',
          updatedAt: new Date().toISOString(),
        };
        if (next.codCutoffHour < 0 || next.codCutoffHour > 23) {
          throw new MockApiError('Giờ chốt COD phải trong khoảng 0–23.', 422);
        }
        if (next.lowStockThreshold <= 0) {
          throw new MockApiError('Ngưỡng tồn thấp phải lớn hơn 0.', 422);
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.contactEmail)) {
          throw new MockApiError('Email liên hệ không hợp lệ.', 422);
        }
        if (next.notifyChannels.length === 0) {
          throw new MockApiError('Chọn ít nhất một kênh thông báo.', 422);
        }
        getDb().settings = next;
        save();
        appendAudit('Cập nhật cấu hình tenant', 'settings', next.slug);
        return clone(next);
      },
    },

    async dashboard(): Promise<DashboardSummary> {
      await settle();
      const db = getDb();
      const now = Date.now();
      const today = startOfToday();
      const openStatuses: OrderStatus[] = [
        'NEW',
        'UNASSIGNED',
        'PENDING_PICKUP',
        'PICKING',
        'PACKED',
        'IN_TRANSIT',
        'OUT_FOR_DELIVERY',
      ];
      const delivered = db.orders.filter((order) => order.status === 'DELIVERED');
      const onTime = delivered.filter(
        (order) => new Date(order.updatedAt).getTime() <= new Date(order.promisedAt).getTime(),
      );
      const availableSkus = new Set(
        db.inventory.filter((item) => item.available > 0).map((item) => item.sku),
      );
      const cycleAccuracy =
        db.cycleCounts.length === 0
          ? 99
          : 100 -
            Math.min(
              10,
              (sum(db.cycleCounts.map((row) => Math.abs(row.varianceUnits))) /
                Math.max(1, sum(db.cycleCounts.map((row) => row.lines)))) *
                100,
            );

      return {
        openOrders: db.orders.filter((order) => openStatuses.includes(order.status)).length,
        ordersToday: db.orders.filter((order) => new Date(order.createdAt).getTime() >= today).length,
        deliveredToday: delivered.filter((order) => new Date(order.updatedAt).getTime() >= today).length,
        lateOrders: db.orders.filter(
          (order) =>
            openStatuses.includes(order.status) && new Date(order.promisedAt).getTime() < now,
        ).length,
        inventoryAccuracy: Number(cycleAccuracy.toFixed(1)),
        outOfStockSkus: db.products.filter((product) => !availableSkus.has(product.sku)).length,
        activeWaves: db.waves.filter((wave) => ['ALLOCATED', 'PICKING'].includes(wave.status)).length,
        activeTrips: db.trips.filter((trip) => ['DISPATCHED', 'IN_PROGRESS'].includes(trip.status)).length,
        unassignedOrders: db.orders.filter((order) => ['NEW', 'UNASSIGNED'].includes(order.status)).length,
        codPending: sum(
          db.remittances
            .filter((row) => ['PENDING', 'SUBMITTED', 'DISPUTED'].includes(row.status))
            .map((row) => row.submittedAmount),
        ),
        fleetUtilization: Math.round(
          (db.vehicles.filter((vehicle) => vehicle.status === 'IN_USE').length /
            Math.max(1, db.vehicles.length)) *
            100,
        ),
        onTimeRate:
          delivered.length === 0 ? 100 : Number(((onTime.length / delivered.length) * 100).toFixed(1)),
        sosOpen: db.sosAlerts.filter((alert) => alert.status !== 'RESOLVED').length,
        returnsOpen: db.returns.filter(
          (record) => !['REFUNDED', 'REJECTED'].includes(record.status),
        ).length,
        revenueMonth: sum(db.invoices.map((invoice) => invoice.amount)),
        costMonth: sum(db.expenses.map((expense) => expense.amount)) + 186_400_000,
      };
    },

    async controls(input: {
      latency?: [number, number];
      failureRate?: number;
      reset?: boolean;
    }) {
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

export type MockRepository = ReturnType<typeof createMockRepository>;
