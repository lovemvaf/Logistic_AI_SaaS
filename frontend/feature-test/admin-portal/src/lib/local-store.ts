'use client';

import api from './api';

/**
 * Single source of truth for data mode across admin-portal.
 * - `mock`: client-side localStorage seed store (default when NEXT_PUBLIC_DATA_SOURCE !== 'api').
 * - `api`: live backend calls via api-gateway; never falls back to local seed data.
 */
export const dataSource: 'mock' | 'api' =
  process.env.NEXT_PUBLIC_DATA_SOURCE === 'api' ? 'api' : 'mock';

export const isMockDataSource = dataSource === 'mock';

export type Order = {
  id: string;
  trackingCode: string;
  clientOrderRef: string;
  recipientName: string;
  recipientPhone?: string;
  recipientAddress: string;
  origin: string;
  destination: string;
  status:
    | 'NEW'
    | 'PENDING'
    | 'UNASSIGNED'
    | 'PENDING_PICKUP'
    | 'PICKING'
    | 'PACKED'
    | 'DISPATCHED'
    | 'IN_TRANSIT'
    | 'OUT_FOR_DELIVERY'
    | 'DELIVERED'
    | 'PARTIAL_DELIVERED'
    | 'RETURNED'
    | 'RETURN_REQUESTED'
    | 'CANCELLED';
  codAmount: number;
  shippingFee?: number;
  createdAt: string;
  client?: { name?: string };
};

export type Shipment = {
  id: string;
  trackingNumber: string;
  driver: string;
  vehicle: string;
  origin: string;
  destination: string;
  status: 'IN_TRANSIT' | 'DELAYED' | 'DELIVERED' | 'PENDING' | 'OUT_FOR_DELIVERY';
  progress: number;
  eta: string;
  orderId?: string;
};

export type DashboardStats = {
  totalTenants: number;
  totalUsers: number;
  totalMrr: number;
  revenueData: { month: string; amount: number }[];
  growthData: { month: string; tenants: number }[];
};

export type LogisticsData = {
  totalOrders: number;
  activeShipments: number;
  inTransit: number;
  deliveredToday: number;
  delayedShipments: number;
  activeVehicles: number;
  activeDrivers: number;
  inventoryAlerts: number;
  avgOptimization: string;
  onTimeDelivery: string;
  predictedShipments: { day: string; predicted: number; actual: number }[];
};

export type AuditLog = {
  id: string;
  actorEmail?: string;
  actor?: string;
  ip?: string;
  ipAddress?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  resource?: string;
  target?: string;
  createdAt?: string;
  timestamp?: string;
  result?: 'SUCCESS' | 'FAILED';
  [key: string]: any;
};

export type AIModel = {
  id: string;
  name: string;
  version: string;
  type: string;
  accuracy: number | null;
  is_current: boolean;
  trained_at: string;
  model_path: string;
};

export type AIAnalysis = {
  ok: boolean;
  summary: string;
  risks: string[];
  recommendations: string[];
  method?: string;
  fallback_used?: boolean;
  evaluation_status?: string;
};

export type UserProfile = {
  id?: string;
  email?: string;
  role?: string;
  fullName?: string;
  [key: string]: any;
};

export type Tenant = {
  id: string;
  name: string;
  slug: string;
  plan?: string | { id?: string; name?: string };
  maxUsers?: number;
  maxWarehouses?: number;
  status?: string;
  createdAt?: string;
  tenant_monthly_orders?: number;
  ordersMonthly?: number;
  usersCount?: number;
  domain?: string;
  [key: string]: any;
};

export type Invoice = {
  id: string;
  tenant: string;
  plan: string;
  amount: number | string;
  issuedAt: string;
  status: 'PAID' | 'DUE' | 'OVERDUE' | string;
  [key: string]: any;
};

export type StoreTable =
  | 'orders'
  | 'shipments'
  | 'dashboardStats'
  | 'logisticsData'
  | 'auditLogs'
  | 'aiModels'
  | 'aiAnalysis'
  | 'adminProfile'
  | 'tenants'
  | 'invoices'
  | 'controlTower'
  | 'pricing'
  | 'aiInsights'
  | 'costCalc'
  | 'logisticsSimulation';

export type ControlTowerStats = {
  activeShipments: number;
  onTimePercent: number;
  incidents: number;
  fleetSize: number;
};

export type NetworkNode = {
  id: string;
  name: string;
  type: 'hub' | 'depot';
  status: 'UP' | 'DEGRADED' | 'DOWN';
  load: number;
};

export type ControlTowerData = {
  stats: ControlTowerStats;
  nodes: NetworkNode[];
  scenario: {
    id: string;
    name: string;
    demandDelta: number;
    costDelta: number;
    etaDelta: number;
  } | null;
};

export type PricingRule = {
  id: string;
  route: string;
  model: 'fixed' | 'dynamic' | 'surge';
  baseRate: number;
  demandFactor: number;
  effective: number;
  active: boolean;
};

export type PriceForecast = { month: string; demand: number; price: number };

export type PricingData = {
  rules: PricingRule[];
  forecast: PriceForecast[];
  currentPrice: number;
  suggestedPrice: number;
  confidence: number;
};

export type AIInsight = {
  id: string;
  type: string;
  title: string;
  description: string;
  confidence: number;
  recommendation: string;
  status: 'NEW' | 'DECIDED' | 'ESCALATED' | 'RESOLVED';
  createdAt: string;
};

export type CostInputs = {
  demand: number;
  capacity: number;
  pricePerUnit: number;
  variableCost: number;
  fixedCost: number;
  serviceLevel: number;
  laborCost: number;
};

export type CostProjection = {
  id: string;
  month: string;
  demand: number;
  sold: number;
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
  breakEven: number;
};

export type SimulationParams = {
  demand: number;
  drivers: number;
  vehicles: number;
  avgSpeed: number;
  fuelCost: number;
  distance: number;
};

export type SimulationResult = {
  id: string;
  params: SimulationParams;
  delivered: number;
  delayed: number;
  cost: number;
  fuel: number;
  etaDeviation: number;
  chart: { hour: string; demand: number; supply: number }[];
  createdAt: string;
};

type StoredRecord = { id: string; [key: string]: any };

/** Individual entry in the seed store: a single value or a seeded table. */
type SeedEntry =
  | Order[]
  | Shipment[]
  | DashboardStats
  | LogisticsData
  | AuditLog[]
  | UserProfile
  | Tenant[]
  | Invoice[]
  | AIModel[]
  | AIAnalysis
  | ControlTowerData
  | PricingData
  | AIInsight[]
  | CostProjection[]
  | SimulationResult[];

const PREFIX = 'smartlogi_local_';
const SEED_VERSION_KEY = `${PREFIX}seed_version`;
const SEED_VERSION = '1.5';

const isBrowser = () => typeof window !== 'undefined';

function safeJSONParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function safeJSONStringify(value: unknown): string | null {
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Mock seed data — realistic, concise samples that mirror the DB schema.      */
/* These values are written to localStorage on first init and then become the  */
/* client-side "database" that pages read from / write to directly.           */
/* -------------------------------------------------------------------------- */

const SEED_ORDERS: Order[] = [
  {
    id: 'ord_01',
    trackingCode: 'TRK-2024-0847',
    clientOrderRef: 'PO-2024-10847',
    recipientName: 'Acme Logistics Co.',
    recipientAddress: '123 Main St, Hanoi',
    origin: 'Bien Hoa Warehouse',
    destination: 'District 1, Ho Chi Minh City',
    status: 'IN_TRANSIT',
    codAmount: 2450000,
    shippingFee: 85000,
    createdAt: '2024-09-15T10:30:00Z',
    client: { name: 'Acme Logistics' },
  },
  {
    id: 'ord_02',
    trackingCode: 'TRK-2024-0848',
    clientOrderRef: 'PO-2024-10848',
    recipientName: 'Global Shipping Inc.',
    recipientAddress: '456 Harbor Rd, Da Nang',
    origin: 'Ho Chi Minh Hub',
    destination: 'Hai Phong Port',
    status: 'DELIVERED',
    codAmount: 1890000,
    shippingFee: 65000,
    createdAt: '2024-09-14T14:15:00Z',
    client: { name: 'Global Shipping' },
  },
  {
    id: 'ord_03',
    trackingCode: 'TRK-2024-0849',
    clientOrderRef: 'PO-2024-10849',
    recipientName: 'FastFreight Partners',
    recipientAddress: '789 Market St, Can Tho',
    origin: 'Da Nang Distribution Center',
    destination: 'Can Tho Central Warehouse',
    status: 'NEW',
    codAmount: 3200000,
    shippingFee: 120000,
    createdAt: '2024-09-15T08:45:00Z',
    client: { name: 'FastFreight' },
  },
  {
    id: 'ord_04',
    trackingCode: 'TRK-2024-0850',
    clientOrderRef: 'PO-2024-10850',
    recipientName: 'TechCorp Vietnam',
    recipientAddress: '321 Le Duan Blvd, Hanoi',
    origin: 'Bien Hoa Warehouse',
    destination: 'Hanoi Logistics Park',
    status: 'RETURN_REQUESTED',
    codAmount: 5600000,
    shippingFee: 95000,
    createdAt: '2024-09-13T16:00:00Z',
    client: { name: 'TechCorp' },
  },
  {
    id: 'ord_05',
    trackingCode: 'TRK-2024-0851',
    clientOrderRef: 'PO-2024-10851',
    recipientName: 'Mekong Trade Co.',
    recipientAddress: '100 Nguyen Thi Thap, Da Nang',
    origin: 'Ho Chi Minh Hub',
    destination: 'Da Nang Seaport',
    status: 'OUT_FOR_DELIVERY',
    codAmount: 1750000,
    shippingFee: 70000,
    createdAt: '2024-09-15T09:20:00Z',
    client: { name: 'Mekong Trade' },
  },
  {
    id: 'ord_06',
    trackingCode: 'TRK-2024-0852',
    clientOrderRef: 'PO-2024-10852',
    recipientName: 'Northern Distributors',
    recipientAddress: '55 Le Thanh Nghia, Hai Phong',
    origin: 'Hanoi Central Warehouse',
    destination: 'Hai Phong Industrial Zone',
    status: 'DELIVERED',
    codAmount: 980000,
    shippingFee: 45000,
    createdAt: '2024-09-12T11:00:00Z',
    client: { name: 'Northern Distrib.' },
  },
];

const SEED_SHIPMENTS: Shipment[] = [
  {
    id: 'shp_01',
    trackingNumber: 'SHP-2024-0847',
    driver: 'Nguyen Van A',
    vehicle: 'Truck #T001',
    origin: 'Hanoi',
    destination: 'Ho Chi Minh',
    status: 'IN_TRANSIT',
    progress: 65,
    eta: '2024-09-16T18:00:00Z',
    orderId: 'ord_01',
  },
  {
    id: 'shp_02',
    trackingNumber: 'SHP-2024-0848',
    driver: 'Tran Thi B',
    vehicle: 'Truck #T002',
    origin: 'Da Nang',
    destination: 'Hai Phong',
    status: 'IN_TRANSIT',
    progress: 30,
    eta: '2024-09-16T12:00:00Z',
    orderId: 'ord_03',
  },
  {
    id: 'shp_03',
    trackingNumber: 'SHP-2024-0849',
    driver: 'Le Van C',
    vehicle: 'Truck #T003',
    origin: 'Can Tho',
    destination: 'Nha Trang',
    status: 'DELAYED',
    progress: 45,
    eta: '2024-09-18T10:00:00Z',
    orderId: 'ord_04',
  },
  {
    id: 'shp_04',
    trackingNumber: 'SHP-2024-0850',
    driver: 'Pham Thi D',
    vehicle: 'Truck #T004',
    origin: 'Hai Phong',
    destination: 'Da Nang',
    status: 'DELIVERED',
    progress: 100,
    eta: '2024-09-15T09:00:00Z',
    orderId: 'ord_02',
  },
  {
    id: 'shp_05',
    trackingNumber: 'SHP-2024-0851',
    driver: 'Hoang Van E',
    vehicle: 'Truck #T005',
    origin: 'Ho Chi Minh',
    destination: 'Da Nang',
    status: 'OUT_FOR_DELIVERY',
    progress: 85,
    eta: '2024-09-16T08:00:00Z',
    orderId: 'ord_05',
  },
];

const SEED_DASHBOARD_STATS: DashboardStats = {
  totalTenants: 5,
  totalUsers: 48,
  totalMrr: 4470,
  revenueData: [
    { month: 'Jan', amount: 1490 },
    { month: 'Feb', amount: 2480 },
    { month: 'Mar', amount: 2480 },
    { month: 'Apr', amount: 3470 },
    { month: 'May', amount: 3470 },
    { month: 'Jun', amount: 4470 },
  ],
  growthData: [
    { month: 'Jan', tenants: 2 },
    { month: 'Feb', tenants: 3 },
    { month: 'Mar', tenants: 3 },
    { month: 'Apr', tenants: 4 },
    { month: 'May', tenants: 4 },
    { month: 'Jun', tenants: 5 },
  ],
};

const SEED_LOGISTICS_DATA: LogisticsData = {
  totalOrders: 6,
  activeShipments: 5,
  inTransit: 3,
  deliveredToday: 1,
  delayedShipments: 1,
  activeVehicles: 5,
  activeDrivers: 5,
  inventoryAlerts: 2,
  avgOptimization: 'Heuristic baseline',
  onTimeDelivery: '80.0%',
  predictedShipments: [
    { day: 'Mon', predicted: 5, actual: 5 },
    { day: 'Tue', predicted: 6, actual: 5 },
    { day: 'Wed', predicted: 7, actual: 6 },
    { day: 'Thu', predicted: 6, actual: 6 },
    { day: 'Fri', predicted: 6, actual: 5 },
    { day: 'Sat', predicted: 4, actual: 4 },
    { day: 'Sun', predicted: 4, actual: 3 },
  ],
};

const SEED_AUDIT_LOGS: AuditLog[] = [
  {
    id: 'aud_01',
    actorEmail: 'admin@smartlogi.vn',
    action: 'TENANT_CREATE',
    resourceType: 'tenant',
    resourceId: 'tn_acme',
    createdAt: '2024-09-15T08:30:00Z',
    result: 'SUCCESS',
  },
  {
    id: 'aud_02',
    actorEmail: 'ops@smartlogi.vn',
    action: 'SHIPMENT_ASSIGN',
    resourceType: 'shipment',
    resourceId: 'shp_01',
    createdAt: '2024-09-15T09:15:00Z',
    result: 'SUCCESS',
  },
  {
    id: 'aud_03',
    actorEmail: 'ops@smartlogi.vn',
    action: 'ROUTE_OPTIMIZE',
    resourceType: 'trip',
    resourceId: 'trip_42',
    createdAt: '2024-09-15T10:00:00Z',
    result: 'SUCCESS',
  },
  {
    id: 'aud_04',
    actorEmail: 'billing@smartlogi.vn',
    action: 'BILLING_INVOICE_GENERATE',
    resourceType: 'invoice',
    resourceId: 'inv_88',
    createdAt: '2024-09-15T11:20:00Z',
    result: 'SUCCESS',
  },
  {
    id: 'aud_05',
    actorEmail: 'ops@smartlogi.vn',
    action: 'SHIPMENT_UPDATE_STATUS',
    resourceType: 'shipment',
    resourceId: 'shp_03',
    createdAt: '2024-09-15T14:45:00Z',
    result: 'FAILED',
  },
];

const SEED_TENANTS: Tenant[] = [
  {
    id: 'tnnt_01',
    name: 'Acme Logistics Co.',
    slug: 'acme-logistics',
    plan: 'Enterprise',
    maxUsers: 50,
    maxWarehouses: 12,
    status: 'ACTIVE',
    createdAt: '2024-06-15T08:30:00Z',
    ordersMonthly: 1248,
  },
  {
    id: 'tnnt_02',
    name: 'Global Shipping Inc.',
    slug: 'global-shipping',
    plan: 'Pro',
    maxUsers: 25,
    maxWarehouses: 5,
    status: 'ACTIVE',
    createdAt: '2024-07-22T10:15:00Z',
    ordersMonthly: 856,
  },
  {
    id: 'tnnt_03',
    name: 'FastFreight Partners',
    slug: 'fastfreight-partners',
    plan: 'Pro',
    maxUsers: 25,
    maxWarehouses: 5,
    status: 'PENDING',
    createdAt: '2024-08-05T14:20:00Z',
    ordersMonthly: 324,
  },
  {
    id: 'tnnt_04',
    name: 'TechCorp Vietnam',
    slug: 'techcorp-vn',
    plan: 'Enterprise',
    maxUsers: 50,
    maxWarehouses: 8,
    status: 'ACTIVE',
    createdAt: '2024-05-30T09:45:00Z',
    ordersMonthly: 2103,
  },
  {
    id: 'tnnt_05',
    name: 'Mekong Trade Co.',
    slug: 'mekong-trade',
    plan: 'Starter',
    maxUsers: 10,
    maxWarehouses: 2,
    status: 'SUSPENDED',
    createdAt: '2024-03-12T16:00:00Z',
    ordersMonthly: 142,
  },
];

const SEED_INVOICES: Invoice[] = [
  {
    id: 'inv_0001',
    tenant: 'Acme Logistics Co.',
    plan: 'Enterprise',
    amount: '$2,490.00',
    issuedAt: '2024-09-01',
    status: 'PAID',
  },
  {
    id: 'inv_0002',
    tenant: 'Global Shipping Inc.',
    plan: 'Pro',
    amount: '$990.00',
    issuedAt: '2024-09-05',
    status: 'PAID',
  },
  {
    id: 'inv_0003',
    tenant: 'TechCorp Vietnam',
    plan: 'Enterprise',
    amount: '$2,490.00',
    issuedAt: '2024-09-10',
    status: 'DUE',
  },
  {
    id: 'inv_0004',
    tenant: 'FastFreight Partners',
    plan: 'Pro',
    amount: '$990.00',
    issuedAt: '2024-09-12',
    status: 'PAID',
  },
  {
    id: 'inv_0005',
    tenant: 'Mekong Trade Co.',
    plan: 'Starter',
    amount: '$290.00',
    issuedAt: '2024-08-28',
    status: 'OVERDUE',
  },
];

const SEED_AI_MODELS: AIModel[] = [
  {
    id: 'model_01',
    name: 'Demand Forecast',
    version: 'v2.3.1',
    type: 'demand',
    accuracy: null,
    is_current: true,
    trained_at: '2024-09-10T03:00:00Z',
    model_path: 'models/demand/v2.3.1',
  },
  {
    id: 'model_02',
    name: 'Delivery Time Predictor',
    version: 'v1.8.4',
    type: 'delivery-time',
    accuracy: null,
    is_current: true,
    trained_at: '2024-09-08T03:00:00Z',
    model_path: 'models/delivery/v1.8.4',
  },
  {
    id: 'model_03',
    name: 'Churn Detector',
    version: 'v3.0.2',
    type: 'churn',
    accuracy: null,
    is_current: false,
    trained_at: '2024-09-05T03:00:00Z',
    model_path: 'models/churn/v3.0.2',
  },
  {
    id: 'model_04',
    name: 'Anomaly Detector',
    version: 'v1.2.0',
    type: 'anomaly',
    accuracy: null,
    is_current: true,
    trained_at: '2024-09-12T03:00:00Z',
    model_path: 'models/anomaly/v1.2.0',
  },
];

const SEED_AI_ANALYSIS: AIAnalysis = {
  ok: true,
  method: 'demo_seed',
  fallback_used: true,
  evaluation_status: 'unmeasured',
  summary:
    'Demo dataset overview: 1 delayed shipment (SHP-2024-0849) out of 5 seeded shipments and 1 overdue invoice (inv_0005). Metrics in mock mode reflect local sample fixtures.',
  risks: [
    '1 delayed shipment (SHP-2024-0849, Can Tho -> Nha Trang) needs reassignment review.',
    '1 overdue Starter invoice (inv_0005) from Mekong Trade Co. (account currently SUSPENDED).',
  ],
  recommendations: [
    'Dispatch an available regional driver to clear SHP-2024-0849.',
    'Follow up with Mekong Trade Co. before reactivating tenant workspace access.',
  ],
};

const SEED_ADMIN_PROFILE: UserProfile = {
  id: 'current',
  email: 'admin@smartlogi.com',
  role: 'SUPER_ADMIN',
  fullName: 'Admin User',
};

const SEED_CONTROL_TOWER: ControlTowerData = {
  stats: { activeShipments: 34, onTimePercent: 94.2, incidents: 3, fleetSize: 42 },
  nodes: [
    { id: 'hub_north', name: 'Hanoi Hub', type: 'hub', status: 'UP', load: 87 },
    { id: 'hub_south', name: 'Ho Chi Minh Hub', type: 'hub', status: 'UP', load: 92 },
    { id: 'depot_central', name: 'Da Nang Depot', type: 'depot', status: 'DEGRADED', load: 64 },
    { id: 'depot_bienhoa', name: 'Bien Hoa Depot', type: 'depot', status: 'UP', load: 71 },
    { id: 'hub_haiphong', name: 'Hai Phong Port', type: 'hub', status: 'UP', load: 58 },
  ],
  scenario: null,
};

const SEED_PRICING: PricingData = {
  rules: [
    { id: 'rule_01', route: 'Hanoi -> Ho Chi Minh', model: 'dynamic', baseRate: 120000, demandFactor: 1.15, effective: 138000, active: true },
    { id: 'rule_02', route: 'Northern cluster', model: 'fixed', baseRate: 85000, demandFactor: 1, effective: 85000, active: true },
    { id: 'rule_03', route: 'Southern cluster', model: 'surge', baseRate: 95000, demandFactor: 1.3, effective: 123500, active: true },
    { id: 'rule_04', route: 'Da Nang corridor', model: 'dynamic', baseRate: 70000, demandFactor: 0.9, effective: 63000, active: false },
  ],
  forecast: [
    { month: 'Jul', demand: 320, price: 110000 },
    { month: 'Aug', demand: 410, price: 118000 },
    { month: 'Sep', demand: 380, price: 112000 },
    { month: 'Oct', demand: 450, price: 125000 },
    { month: 'Nov', demand: 490, price: 130000 },
    { month: 'Dec', demand: 520, price: 142000 },
  ],
  currentPrice: 130000,
  suggestedPrice: 138000,
  confidence: 0.86,
};

const SEED_AI_INSIGHTS: AIInsight[] = [
  {
    id: 'insight_01',
    type: 'delay',
    title: 'Northern cluster delay risk',
    description: '3 shipments are delayed beyond SLA in the Northern cluster. Reassigning to nearby drivers recovers 85% of ETAs.',
    confidence: 0.92,
    recommendation: 'Reassign SHP-003 and SHP-007 to Route 21 drivers',
    status: 'NEW',
    createdAt: '2024-09-15T06:00:00Z',
  },
  {
    id: 'insight_02',
    type: 'maintenance',
    title: 'Preventive maintenance due',
    description: 'Vehicles T003 and T005 are overdue for scheduled maintenance. Risk of unplanned downtime rises after 48h.',
    confidence: 0.84,
    recommendation: 'Schedule maintenance windows for both vehicles',
    status: 'NEW',
    createdAt: '2024-09-15T05:30:00Z',
  },
  {
    id: 'insight_03',
    type: 'cost',
    title: 'Fuel price surge',
    description: 'Fuel prices rose 7% week-over-week, cutting margin on dynamic routes. Repricing routes 5-10% would restore margin.',
    confidence: 0.78,
    recommendation: 'Propose price revision for Southern cluster surge routes',
    status: 'NEW',
    createdAt: '2024-09-15T04:00:00Z',
  },
  {
    id: 'insight_04',
    type: 'churn',
    title: 'Tenant churn warning - Mekong Trade',
    description: 'Mekong Trade volume dropped 30% over 30 days. Trigger chat and offer volume discount.',
    confidence: 0.71,
    recommendation: 'Contact account owner before renewal',
    status: 'NEW',
    createdAt: '2024-09-14T11:00:00Z',
  },
];

const SEED_COST_PROJECTIONS: CostProjection[] = [
  { id: 'proj_01', month: 'Jul', demand: 320, sold: 300, revenue: 33000000, cost: 24000000, profit: 9000000, margin: 27.3, breakEven: 187 },
  { id: 'proj_02', month: 'Aug', demand: 410, sold: 390, revenue: 46170000, cost: 29250000, profit: 16920000, margin: 36.6, breakEven: 231 },
  { id: 'proj_03', month: 'Sep', demand: 380, sold: 370, revenue: 41400000, cost: 27900000, profit: 13500000, margin: 32.6, breakEven: 190 },
];

const SEED_LOGISTICS_SIMULATIONS: SimulationResult[] = [
  {
    id: 'sim_01',
    params: { demand: 400, drivers: 38, vehicles: 42, avgSpeed: 40, fuelCost: 18000, distance: 250 },
    delivered: 358,
    delayed: 12,
    cost: 14500000,
    fuel: 6200000,
    etaDeviation: 12.5,
    chart: [
      { hour: '06:00', demand: 30, supply: 28 },
      { hour: '08:00', demand: 68, supply: 72 },
      { hour: '10:00', demand: 92, supply: 88 },
      { hour: '12:00', demand: 100, supply: 100 },
      { hour: '14:00', demand: 85, supply: 95 },
      { hour: '16:00', demand: 60, supply: 64 },
      { hour: '18:00', demand: 40, supply: 42 },
      { hour: '20:00', demand: 15, supply: 20 },
    ],
    createdAt: '2024-09-15T08:00:00Z',
  },
];

export const SEED_DATA: Record<StoreTable, SeedEntry> = {
  orders: SEED_ORDERS,
  shipments: SEED_SHIPMENTS,
  dashboardStats: SEED_DASHBOARD_STATS,
  logisticsData: SEED_LOGISTICS_DATA,
  auditLogs: SEED_AUDIT_LOGS,
  aiModels: SEED_AI_MODELS,
  aiAnalysis: SEED_AI_ANALYSIS,
  adminProfile: SEED_ADMIN_PROFILE,
  tenants: SEED_TENANTS,
  invoices: SEED_INVOICES,
  controlTower: SEED_CONTROL_TOWER,
  pricing: SEED_PRICING,
  aiInsights: SEED_AI_INSIGHTS,
  costCalc: SEED_COST_PROJECTIONS,
  logisticsSimulation: SEED_LOGISTICS_SIMULATIONS,
};

/* -------------------------------------------------------------------------- */
/* Public store API                                                           */
/* -------------------------------------------------------------------------- */

function tableKey(table: StoreTable): string {
  return `${PREFIX}${table}`;
}

export function initStore(): void {
  if (!isBrowser() || !isMockDataSource) return;
  const currentVersion = window.localStorage.getItem(SEED_VERSION_KEY);
  if (currentVersion === SEED_VERSION) return;

  const now = Date.now();
  Object.entries(SEED_DATA).forEach(([table, data]) => {
    const records = Array.isArray(data)
      ? data.map((item) => ({ ...item, updatedAt: now }))
      : { ...data, updatedAt: now };
    window.localStorage.setItem(tableKey(table as StoreTable), safeJSONStringify(records) ?? '{}');
  });

  window.localStorage.setItem(SEED_VERSION_KEY, SEED_VERSION);
}

function ensureInitialized(): void {
  if (!isBrowser() || !isMockDataSource) return;
  initStore();
}

export function getAll<T = any[]>(table: StoreTable): T {
  if (!isMockDataSource) return ([] as unknown) as T;
  ensureInitialized();
  if (!isBrowser()) return ([] as unknown) as T;
  const raw = window.localStorage.getItem(tableKey(table));
  const parsed = safeJSONParse<any[]>(raw);
  if (Array.isArray(parsed)) return parsed as T;
  if (parsed && !Array.isArray(parsed)) return parsed as T;
  return ([] as unknown) as T;
}

export function getOne(table: StoreTable, id: string): StoredRecord | null {
  if (!isMockDataSource) return null;
  ensureInitialized();
  const list = getAll<any>(table);
  if (Array.isArray(list)) {
    return list.find((item) => item.id === id) || null;
  }
  if (list && typeof list === 'object' && (list as StoredRecord).id === id) {
    return list as StoredRecord;
  }
  return null;
}

export function create(table: StoreTable, item: StoredRecord): StoredRecord {
  if (!isMockDataSource) {
    throw new Error(`local-store create(${table}) is disabled in api mode`);
  }
  ensureInitialized();
  if (!isBrowser()) return item;
  const list = getAll<StoredRecord[]>(table);
  const now = Date.now();
  const record: StoredRecord = {
    ...item,
    id: item.id || `tmp_${now}`,
    createdAt: item.createdAt || new Date(now).toISOString(),
    updatedAt: now,
  };
  list.push(record);
  window.localStorage.setItem(tableKey(table), safeJSONStringify(list) ?? '[]');
  return record;
}

export function update(table: StoreTable, id: string, data: Partial<StoredRecord>): StoredRecord | null {
  if (!isMockDataSource) {
    throw new Error(`local-store update(${table}) is disabled in api mode`);
  }
  ensureInitialized();
  if (!isBrowser()) return null;
  const rawList = getAll<any>(table);
  if (rawList && !Array.isArray(rawList) && typeof rawList === 'object') {
    const record = { ...rawList, ...data, id: rawList.id || id, updatedAt: Date.now() };
    window.localStorage.setItem(tableKey(table), safeJSONStringify(record) ?? '{}');
    return record;
  }
  const list = Array.isArray(rawList) ? rawList : [];
  const index = list.findIndex((item) => item.id === id);
  if (index === -1) return null;
  const record = { ...list[index], ...data, id, updatedAt: Date.now() };
  list[index] = record;
  window.localStorage.setItem(tableKey(table), safeJSONStringify(list) ?? '[]');
  return record;
}

export function remove(table: StoreTable, id: string): boolean {
  if (!isMockDataSource) {
    throw new Error(`local-store remove(${table}) is disabled in api mode`);
  }
  ensureInitialized();
  if (!isBrowser()) return false;
  const list = getAll<StoredRecord[]>(table);
  const index = list.findIndex((item) => item.id === id);
  if (index === -1) return false;
  list.splice(index, 1);
  window.localStorage.setItem(tableKey(table), safeJSONStringify(list) ?? '[]');
  return true;
}

export function replaceAll(table: StoreTable, data: StoredRecord[]): void {
  if (!isMockDataSource) return;
  ensureInitialized();
  if (!isBrowser()) return;
  const now = Date.now();
  const records = data.map((item) => ({ ...item, updatedAt: now }));
  window.localStorage.setItem(tableKey(table), safeJSONStringify(records) ?? '[]');
}

export type PaginatedResponse<T> = {
  data: T[];
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
    totalPages?: number;
    mrr?: number;
  };
};

/* -------------------------------------------------------------------------- */
/* fetchFromStoreOrAPI — strict mock | api separation                          */
/* -------------------------------------------------------------------------- */

export async function fetchFromStoreOrAPI<T = any>(
  table: StoreTable,
  endpoint: string,
): Promise<T> {
  if (isMockDataSource) {
    ensureInitialized();
    return getAll<T>(table);
  }

  const response = await api.get(endpoint);
  const payload = response.data;
  if (payload && typeof payload === 'object' && !Array.isArray(payload) && 'data' in payload) {
    return (payload as any).data as T;
  }
  return payload as T;
}

export async function fetchPaginatedFromStoreOrAPI<T = any>(
  table: StoreTable,
  endpoint: string,
): Promise<PaginatedResponse<T>> {
  if (isMockDataSource) {
    ensureInitialized();
    const list = getAll<T[]>(table);
    const items = Array.isArray(list) ? list : [];
    return {
      data: items,
      meta: { total: items.length, page: 1, limit: items.length || 15, totalPages: 1 },
    };
  }

  const response = await api.get(endpoint);
  const payload = response.data;
  if (Array.isArray(payload)) {
    return {
      data: payload,
      meta: { total: payload.length, page: 1, limit: payload.length || 15, totalPages: 1 },
    };
  }
  if (payload && typeof payload === 'object' && Array.isArray((payload as any).data)) {
    return {
      data: (payload as any).data,
      meta: (payload as any).meta,
    };
  }
  return {
    data: [],
    meta: { total: 0, page: 1, limit: 15, totalPages: 1 },
  };
}

/* -------------------------------------------------------------------------- */
/* AI layer — control tower, pricing, insights, cost calculator and logistics */
/* simulation.                                                                */
/* -------------------------------------------------------------------------- */

/** Read the digital twin configuration (control tower). */
export function getControlTower(): ControlTowerData {
  return getAll<ControlTowerData>('controlTower');
}

/** Persist a what-if scenario against the twin. */
export function setControlTower(data: ControlTowerData): void {
  if (!isMockDataSource) throw new Error('setControlTower is disabled in api mode');
  window.localStorage.setItem(tableKey('controlTower'), safeJSONStringify(data) ?? '{}');
}

/** Pricing data — rules, forecasts and the live demand signal. */
export function getPricing(): PricingData {
  return getAll<PricingData>('pricing');
}

export function setPricing(data: PricingData): PricingData {
  if (!isMockDataSource) throw new Error('setPricing is disabled in api mode');
  window.localStorage.setItem(tableKey('pricing'), safeJSONStringify(data) ?? '{}');
  return data;
}

export function savePricingRule(rule: PricingRule): PricingData {
  const sheet = getPricing();
  const rules = [...sheet.rules, { ...rule, id: rule.id || `rule_${Date.now()}` }];
  setPricing({ ...sheet, rules });
  return { ...sheet, rules };
}

export function updatePricingRule(id: string, data: Partial<PricingRule>): PricingData {
  const sheet = getPricing();
  const rules = sheet.rules.map((rule) => (rule.id === id ? { ...rule, ...data, id } : rule));
  setPricing({ ...sheet, rules });
  return { ...sheet, rules };
}

export function removePricingRule(id: string): PricingData {
  const sheet = getPricing();
  const rules = sheet.rules.filter((rule) => rule.id !== id);
  setPricing({ ...sheet, rules });
  return { ...sheet, rules };
}

/** AI insights — the admin decision surface mirrors `aiInsights.decide`. */
export function getInsights(): AIInsight[] {
  return getAll<AIInsight[]>('aiInsights');
}

export function decideInsight(id: string, status: AIInsight['status']): AIInsight {
  if (!isMockDataSource) throw new Error('decideInsight is disabled in api mode');
  const list = getInsights();
  const index = list.findIndex((item) => item.id === id);
  if (index === -1) {
    throw new Error('Insight not found');
  }
  const insight = { ...list[index], status, decidedAt: Date.now() };
  list[index] = insight;
  window.localStorage.setItem(tableKey('aiInsights'), safeJSONStringify(list) ?? '[]');
  return insight;
}

/** BounceX cost calculator inputs and derived projections. */
export function saveCostInputs(inputs: CostInputs): CostProjection {
  if (!isMockDataSource) throw new Error('saveCostInputs is disabled in api mode');
  const projection = calculateCostInputs(inputs);
  const history = getCostHistory();
  history.push(projection);
  window.localStorage.setItem(tableKey('costCalc'), safeJSONStringify(history) ?? '[]');
  return projection;
}

export function getCostHistory(): CostProjection[] {
  return getAll<CostProjection[]>('costCalc');
}

export function calculateCostInputs(inputs: CostInputs): CostProjection {
  const { demand, capacity, pricePerUnit, variableCost, fixedCost, serviceLevel, laborCost } = inputs;
  const served = capacity * (serviceLevel / 100);
  const demandServed = served >= demand ? demand : served;
  const revenue = demandServed * pricePerUnit;
  const cost = demand * variableCost + fixedCost + laborCost;
  const profit = revenue - cost;
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
  const breakEven =
    (pricePerUnit - variableCost) > 0
      ? Math.ceil((fixedCost + laborCost) / (pricePerUnit - variableCost))
      : Infinity;
  return {
    id: `proj_${Date.now()}`,
    month: new Date().toISOString().slice(0, 7),
    demand,
    sold: demandServed,
    revenue: Math.round(revenue),
    cost: Math.round(cost),
    profit: Math.round(profit),
    margin: Math.round(margin * 10) / 10,
    breakEven,
  };
}

/** Logistics simulation — deterministic demand / capacity replay. */
export function getSimulations(): SimulationResult[] {
  return getAll<SimulationResult[]>('logisticsSimulation');
}

export function runSimulation(params: SimulationParams): SimulationResult {
  if (!isMockDataSource) throw new Error('runSimulation is disabled in api mode');
  const now = Date.now();
  const id = `sim_${now}`;

  // Assumptions: every vehicle runs 10h/day over the average delivery link.
  const capacityPerVehicle = params.avgSpeed * 10;
  const fleetCapacity = params.vehicles * capacityPerVehicle;
  const demand = params.demand;

  const delivered = Math.min(demand, fleetCapacity);
  const delayed = Math.max(0, demand - delivered);
  const fuel = delivered * params.distance * params.fuelCost;
  const cost = fuel + delayed * 50000;
  const etaDeviation = demand > 0 ? (delayed / demand) * 100 : 0;

  const chart: { hour: string; demand: number; supply: number }[] = [];
  for (let hour = 0; hour < 24; hour += 2) {
    const time = `${String(hour).padStart(2, '0')}:00`;
    const demandFactor = hour >= 6 && hour <= 20
      ? 0.1 + 0.9 * Math.sin(((hour - 6) / 14) * Math.PI)
      : 0.1;
    chart.push({
      hour: time,
      demand: Math.round(demand * demandFactor),
      supply: Math.round((fleetCapacity / 24) * (hour >= 8 && hour <= 20 ? 1 : 0.35)),
    });
  }

  const result: SimulationResult = {
    id,
    params,
    delivered,
    delayed,
    cost: Math.round(cost),
    fuel: Math.round(fuel),
    etaDeviation: Math.round(etaDeviation * 10) / 10,
    chart,
    createdAt: new Date(now).toISOString(),
  };

  const list = getSimulations();
  list.push(result);
  window.localStorage.setItem(tableKey('logisticsSimulation'), safeJSONStringify(list) ?? '[]');
  return result;
}
