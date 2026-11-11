/**
 * Domain types for the tenant portal.
 *
 * These types mirror the `/api/v1` contract implemented by `backend/core-api`
 * and by the future `backend/rust-api`. UI code imports them from here only;
 * do not redeclare shapes inside pages.
 */

export type Id = string;
export type IsoDate = string;

export type OrderStatus =
  | 'NEW'
  | 'UNASSIGNED'
  | 'PENDING_PICKUP'
  | 'PICKING'
  | 'PACKED'
  | 'IN_TRANSIT'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'FAILED'
  | 'RETURN_REQUESTED'
  | 'RETURNED'
  | 'CANCELLED';

export type TripStatus = 'PLANNED' | 'DISPATCHED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export type ServiceLevel = 'STANDARD' | 'EXPRESS' | 'SAME_DAY';

export type OrderCustomer = {
  name: string;
  phone: string;
  address: string;
  ward: string;
  district: string;
  province: string;
  lat: number;
  lng: number;
};

export type OrderEvent = {
  at: IsoDate;
  label: string;
  actor: string;
};

export type Order = {
  id: Id;
  trackingCode: string;
  clientOrderRef: string;
  clientId: Id;
  clientName: string;
  status: OrderStatus;
  service: ServiceLevel;
  customer: OrderCustomer;
  warehouseId: Id;
  tripId?: Id;
  codAmount: number;
  shippingFee: number;
  weightKg: number;
  volumeCbm: number;
  itemCount: number;
  notes?: string;
  createdAt: IsoDate;
  promisedAt: IsoDate;
  updatedAt: IsoDate;
  timeline: OrderEvent[];
};

export type Product = {
  id: Id;
  sku: string;
  name: string;
  barcode: string;
  category: string;
  unit: string;
  weightKg: number;
  volumeCbm: number;
  shelfLifeDays: number | null;
  reorderPoint: number;
  unitPrice: number;
  active: boolean;
};

export type Warehouse = {
  id: Id;
  code: string;
  name: string;
  address: string;
  province: string;
  capacityCbm: number;
  usedCbm: number;
  binCount: number;
  manager: string;
  status: 'ACTIVE' | 'MAINTENANCE';
};

export type Bin = {
  id: Id;
  code: string;
  warehouseId: Id;
  zone: string;
  maxWeightKg: number;
  maxVolumeCbm: number;
  usedWeightKg: number;
  usedVolumeCbm: number;
};

export type InventoryItem = {
  id: Id;
  sku: string;
  productName: string;
  warehouseId: Id;
  warehouseCode: string;
  binCode: string;
  lotNo: string;
  quantity: number;
  reserved: number;
  available: number;
  expiryDate: IsoDate | null;
  version: number;
  updatedAt: IsoDate;
};

export type MovementType =
  | 'RECEIVE'
  | 'PUTAWAY'
  | 'PICK'
  | 'TRANSFER'
  | 'ADJUST'
  | 'CYCLE_COUNT'
  | 'RETURN'
  | 'SHIP';

export type StockMovement = {
  id: Id;
  at: IsoDate;
  type: MovementType;
  sku: string;
  productName: string;
  quantity: number;
  warehouseCode: string;
  binCode: string;
  reference: string;
  actor: string;
  balanceAfter: number;
  note?: string;
};

export type AllocationStrategy = 'FIFO' | 'LIFO' | 'FEFO';

export type Wave = {
  id: Id;
  code: string;
  warehouseId: Id;
  warehouseCode: string;
  strategy: AllocationStrategy;
  status: 'DRAFT' | 'ALLOCATED' | 'PICKING' | 'PICKED' | 'CANCELLED';
  orderCount: number;
  taskCount: number;
  picker: string;
  zone: string;
  createdAt: IsoDate;
  releasedAt: IsoDate | null;
};

export type PickTask = {
  id: Id;
  waveId: Id;
  waveCode: string;
  orderTrackingCode: string;
  sku: string;
  productName: string;
  binCode: string;
  quantity: number;
  pickedQuantity: number;
  status: 'PENDING' | 'PICKED' | 'SHORT' | 'SKIPPED';
  assignee: string;
  sequence: number;
};

export type CycleCount = {
  id: Id;
  code: string;
  warehouseId: Id;
  warehouseCode: string;
  zone: string;
  scope: string;
  status: 'DRAFT' | 'COUNTING' | 'REVIEW' | 'APPROVED' | 'CANCELLED';
  lines: number;
  countedLines: number;
  varianceUnits: number;
  varianceValue: number;
  assignee: string;
  startedAt: IsoDate;
  closedAt: IsoDate | null;
};

export type Equipment = {
  id: Id;
  code: string;
  name: string;
  type: 'SCANNER' | 'LABEL_PRINTER' | 'SCALE' | 'FORKLIFT' | 'PDA' | 'CAMERA';
  warehouseCode: string;
  status: 'ONLINE' | 'OFFLINE' | 'MAINTENANCE';
  batteryPct: number | null;
  lastSeenAt: IsoDate;
  note?: string;
};

export type PackSession = {
  id: Id;
  code: string;
  orderTrackingCode: string;
  station: string;
  operator: string;
  expectedSku: string;
  scannedSku: string | null;
  match: 'MATCH' | 'MISMATCH' | 'OVERRIDE';
  confidence: number;
  weightKg: number;
  boxSize: 'S' | 'M' | 'L' | 'XL';
  status: 'OPEN' | 'SEALED' | 'VOID';
  createdAt: IsoDate;
};

export type TripStop = {
  id: Id;
  sequence: number;
  orderTrackingCode: string;
  customerName: string;
  address: string;
  district: string;
  lat: number;
  lng: number;
  status: 'PENDING' | 'ARRIVED' | 'DELIVERED' | 'FAILED';
  eta: IsoDate;
  codAmount: number;
};

export type Trip = {
  id: Id;
  code: string;
  driverId: Id;
  driverName: string;
  vehicleId: Id;
  vehiclePlate: string;
  status: TripStatus;
  warehouseCode: string;
  stops: TripStop[];
  plannedDistanceKm: number;
  actualDistanceKm: number;
  plannedDurationMin: number;
  startedAt: IsoDate | null;
  completedAt: IsoDate | null;
  codCollected: number;
  codExpected: number;
  fuelCost: number;
  optimized: boolean;
  createdAt: IsoDate;
};

export type Driver = {
  id: Id;
  code: string;
  name: string;
  phone: string;
  licenseClass: string;
  status: 'AVAILABLE' | 'ON_TRIP' | 'OFF_DUTY' | 'SUSPENDED';
  rating: number;
  tripsThisMonth: number;
  codOnHand: number;
  joinedAt: IsoDate;
};

export type Vehicle = {
  id: Id;
  plate: string;
  type: 'VAN' | 'TRUCK_1T' | 'TRUCK_3T' | 'MOTORBIKE';
  capacityKg: number;
  capacityCbm: number;
  status: 'AVAILABLE' | 'IN_USE' | 'MAINTENANCE';
  odometerKm: number;
  insuranceExpiry: IsoDate;
  lastServiceAt: IsoDate;
};

export type Geofence = {
  id: Id;
  name: string;
  kind: 'SAFE' | 'RESTRICTED';
  centerLat: number;
  centerLng: number;
  radiusM: number;
  province: string;
  active: boolean;
  alerts24h: number;
  note?: string;
};

export type SosAlert = {
  id: Id;
  code: string;
  driverName: string;
  tripCode: string;
  kind: 'PANIC' | 'GEOFENCE_BREACH' | 'OFF_ROUTE' | 'IDLE_TOO_LONG';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
  lat: number;
  lng: number;
  createdAt: IsoDate;
  acknowledgedBy?: string;
  note: string;
};

export type ReturnRequest = {
  id: Id;
  code: string;
  orderTrackingCode: string;
  clientName: string;
  reason: 'DAMAGED' | 'WRONG_ITEM' | 'REFUSED' | 'NOT_DELIVERED' | 'OTHER';
  status: 'REQUESTED' | 'APPROVED' | 'IN_TRANSIT' | 'INSPECTING' | 'REFUNDED' | 'REJECTED';
  inspection: 'PENDING' | 'SELLABLE' | 'DAMAGED' | 'SCRAP';
  refundAmount: number;
  createdAt: IsoDate;
  resolvedAt: IsoDate | null;
  note?: string;
};

export type CodRemittance = {
  id: Id;
  code: string;
  driverId: Id;
  driverName: string;
  tripCode: string;
  expectedAmount: number;
  submittedAmount: number;
  variance: number;
  status: 'PENDING' | 'SUBMITTED' | 'RECONCILED' | 'DISPUTED';
  bankRef: string | null;
  submittedAt: IsoDate | null;
  reconciledAt: IsoDate | null;
  note?: string;
};

export type BankTransaction = {
  id: Id;
  txnDate: IsoDate;
  description: string;
  amount: number;
  bankRef: string;
  matchedRemittanceId: Id | null;
  matchedAt: IsoDate | null;
};

export type Expense = {
  id: Id;
  code: string;
  tripCode: string;
  driverName: string;
  type: 'FUEL' | 'TOLL' | 'PARKING' | 'MAINTENANCE' | 'ALLOWANCE' | 'OTHER';
  amount: number;
  receiptCount: number;
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
  createdAt: IsoDate;
  note?: string;
};

export type Client = {
  id: Id;
  code: string;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  status: 'ACTIVE' | 'PAUSED' | 'CHURNED';
  creditLimit: number;
  ordersThisMonth: number;
  codOutstanding: number;
  monthlyVolume: number;
  apiKeyCount: number;
  joinedAt: IsoDate;
};

export type Invoice = {
  id: Id;
  code: string;
  clientName: string;
  period: string;
  amount: number;
  paidAmount: number;
  status: 'DRAFT' | 'SENT' | 'PAID' | 'OVERDUE' | 'VOID';
  issuedAt: IsoDate;
  dueAt: IsoDate;
  note?: string;
};

export type AiInsight = {
  id: Id;
  model: 'DEMAND_FORECAST' | 'DELIVERY_ETA' | 'COST_ANOMALY' | 'CHURN_RISK' | 'ROUTE_OPTIMIZER';
  title: string;
  detail: string;
  metricLabel: string;
  metricValue: string;
  confidence: number;
  status: 'NEW' | 'ACKNOWLEDGED' | 'ACTIONED' | 'DISMISSED';
  entityRef: string;
  createdAt: IsoDate;
};

export type ApiKey = {
  id: Id;
  name: string;
  prefix: string;
  scopes: string[];
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
  createdAt: IsoDate;
  lastUsedAt: IsoDate | null;
  createdBy: string;
};

export type AuditLog = {
  id: Id;
  at: IsoDate;
  actor: string;
  action: string;
  entity: string;
  entityRef: string;
  ip: string;
  result: 'SUCCESS' | 'DENIED' | 'ERROR';
};

export type UserAccount = {
  id: Id;
  name: string;
  email: string;
  phone: string;
  role: string;
  status: 'ACTIVE' | 'INVITED' | 'SUSPENDED';
  lastActiveAt: IsoDate | null;
  createdAt: IsoDate;
};

export type RoleDefinition = {
  id: Id;
  key: string;
  name: string;
  description: string;
  permissions: string[];
  builtin: boolean;
  memberCount: number;
};

export type WebhookEndpoint = {
  id: Id;
  url: string;
  events: string[];
  status: 'ACTIVE' | 'PAUSED' | 'FAILING';
  secretPrefix: string;
  successRate: number;
  lastDeliveryAt: IsoDate | null;
};

export type Notification = {
  id: Id;
  at: IsoDate;
  title: string;
  detail: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  read: boolean;
  href?: string;
};

export type DashboardSummary = {
  openOrders: number;
  ordersToday: number;
  deliveredToday: number;
  lateOrders: number;
  inventoryAccuracy: number;
  outOfStockSkus: number;
  activeWaves: number;
  activeTrips: number;
  unassignedOrders: number;
  codPending: number;
  fleetUtilization: number;
  onTimeRate: number;
  sosOpen: number;
  returnsOpen: number;
  revenueMonth: number;
  costMonth: number;
};

export type TenantSettings = {
  id: 'tenant-settings';
  name: string;
  slug: string;
  timezone: string;
  currency: 'VND';
  locale: 'vi-VN';
  address: string;
  contactName: string;
  contactEmail: string;
  autoAllocateStrategy: AllocationStrategy;
  codCutoffHour: number;
  lowStockThreshold: number;
  notifyChannels: Array<'email' | 'sms' | 'webhook'>;
  updatedAt: IsoDate;
};

// ---------------------------------------------------------------------------
// Báo cáo (reports) — dữ liệu tính sẵn, không CRUD.
// ---------------------------------------------------------------------------

export type ReportPeriod = {
  period: string;
  label: string;
};

export type ReportSummary = {
  period: string;
  orders: { total: number; delivered: number; late: number; onTime: number };
  revenue: number;
  cost: number;
  profit: number;
  codPending: number;
  fleetUtilization: number;
  onTimeRate: number;
};

export type ReportOnTimeGroup = {
  id: string;
  name: string;
  onTime: number;
  late: number;
  total: number;
  rate: number;
};

export type ReportOnTime = {
  period: string;
  groupBy?: 'warehouse' | 'driver' | 'vehicle' | 'collector';
  groups: ReportOnTimeGroup[];
};

export type ReportCostCategory = {
  category:
    | 'FUEL'
    | 'TOLL'
    | 'PARKING'
    | 'MAINTENANCE'
    | 'ALLOWANCE'
    | 'OTHER'
    | 'WAREHOUSE'
    | 'SALARY'
    | 'INSURANCE'
    | 'DEPRECIATION';
  amount: number;
};

export type ReportCosts = {
  period: string;
  total: number;
  byCategory: ReportCostCategory[];
};

export type ReportFleetVehicle = {
  id: string;
  plate: string;
  type: 'VAN' | 'TRUCK_1T' | 'TRUCK_3T' | 'MOTORBIKE';
  trips: number;
  distanceKm: number;
  fuelCost: number;
  maintenanceCost: number;
  revenue: number;
  utilizableDays: number;
  downtimeDays: number;
  rate: number;
};

export type ReportFleet = {
  period: string;
  byVehicle: ReportFleetVehicle[];
};

export type ReportParams = {
  period?: string;
  from?: string;
  to?: string;
};

// ---------------------------------------------------------------------------
// Proof of delivery (POD) — ảnh/ban ký khi xong chuyến.
// ---------------------------------------------------------------------------

export type PODRecord = {
  id: Id;
  tripId: Id;
  tripCode: string;
  driverId: Id;
  driverName: string;
  customerName: string;
  contactPhone: string;
  photo: string;
  signature: string;
  deliveredAt: IsoDate;
  recipient: string;
  note?: string;
  createdAt: IsoDate;
};

// ---------------------------------------------------------------------------
// Nhiên liệu & bảo trì xe.
// ---------------------------------------------------------------------------

export type FuelLog = {
  id: Id;
  vehicleId: Id;
  vehiclePlate: string;
  at: IsoDate;
  liters: number;
  cost: number;
  km: number;
  station: string;
  note?: string;
};

export type MaintenanceType = 'OIL' | 'TIRE' | 'ENGINE' | 'BRAKE' | 'REGULAR' | 'RANDOM';

export type MaintenanceRecord = {
  id: Id;
  vehicleId: Id;
  vehiclePlate: string;
  type: MaintenanceType;
  scheduledAt: IsoDate;
  cost: number;
  doneAt: IsoDate | null;
  provider: string;
  note?: string;
};

// ---------------------------------------------------------------------------
// Hoạt động tài xế.
// ---------------------------------------------------------------------------

export type DriverActivityKind =
  | 'CHECK_IN'
  | 'CHECK_OUT'
  | 'STOP_ARRIVE'
  | 'STOP_DELIVER'
  | 'STOP_FAIL'
  | 'IDLE_START'
  | 'IDLE_END'
  | 'REFUEL'
  | 'MAINTENANCE'
  | 'BONUS'
  | 'FINE';

export type DriverActivity = {
  id: Id;
  driverId: Id;
  driverName: string;
  tripId?: Id;
  tripCode?: string;
  kind: DriverActivityKind;
  at: IsoDate;
  location?: { lat: number; lng: number };
  note?: string;
};

export type DriverReport = {
  driverId: Id;
  driverName: string;
  status: Driver['status'];
  phone: string;
  month: string;
  trips: number;
  orders: number;
  distanceKm: number;
  fuelCost: number;
  onTimeRate: number;
  rating: number;
  incidents: number;
  complained: number;
};

// ---------------------------------------------------------------------------
// Khách hàng B2B tập trung, giao dịch lớn (portal khách).
// ---------------------------------------------------------------------------

export type Customer = {
  id: Id;
  code: string;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  province: string;
  district: string;
  ward: string;
  status: 'ACTIVE' | 'PAUSED' | 'CHURNED';
  creditLimit: number;
  ordersThisMonth: number;
  codOutstanding: number;
  monthlyVolume: number;
  apiKeyCount: number;
  joinedAt: IsoDate;
};

export type CustomerReview = {
  id: Id;
  customerId: Id;
  customerName: string;
  rating: number;
  comment: string;
  createdAt: IsoDate;
};

// ---------------------------------------------------------------------------
// Kênh thông báo đa kênh (SMS/email/PUSH/...), chỉ ghi nhật ký gửi.
// ---------------------------------------------------------------------------

export type NotificationEventKind = 'SMS' | 'EMAIL' | 'PUSH' | 'IN_APP' | 'WHATSAPP';

export type NotificationEvent = {
  id: Id;
  kind: NotificationEventKind;
  to: string;
  recipientName?: string;
  subject: string;
  body: string;
  status: 'PENDING' | 'SENT' | 'DELIVERED' | 'FAILED';
  sentAt: IsoDate | null;
  deliveredAt: IsoDate | null;
  createdAt: IsoDate;
  extra: { refId?: string; channelRef?: string; payload?: Record<string, unknown> };
};

// ---------------------------------------------------------------------------
// Đơn giao/chia kèm (partial), theo dõi hành trình thực tế.
// ---------------------------------------------------------------------------

export type OrderPartial = {
  id: Id;
  trackingCode: string;
  partialCode: string;
  reason: string;
  status: 'PARTIAL' | 'COMPLETE' | 'CANCELLED';
  quantities: Array<{ sku: string; expected: number; packed: number }>;
  createdAt: IsoDate;
  updatedAt: IsoDate;
  note?: string;
};

export type OrderRoute = {
  trackingCode: string;
  status: OrderStatus;
  from: { name: string; address: string; lat: number; lng: number };
  to: { name: string; address: string; lat: number; lng: number };
  current: { name: string; address: string; lat: number; lng: number };
  nextStop?: {
    name: string;
    address: string;
    lat: number;
    lng: number;
    eta: IsoDate;
  };
  eta: IsoDate | null;
  driver: { id: Id; name: string; phone: string; plate: string };
  service: ServiceLevel;
  promotionalAt?: IsoDate;
};
