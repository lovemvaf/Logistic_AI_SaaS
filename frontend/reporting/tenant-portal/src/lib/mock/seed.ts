import type {
  AiInsight,
  ApiKey,
  AuditLog,
  BankTransaction,
  Bin,
  Client,
  CodRemittance,
  CycleCount,
  Driver,
  DriverActivity,
  DriverActivityKind,
  Equipment,
  Expense,
  FuelLog,
  Geofence,
  InventoryItem,
  Invoice,
  MaintenanceRecord,
  MaintenanceType,
  NotificationEvent,
  Order,
  PackSession,
  PickTask,
  PODRecord,
  Product,
  ReturnRequest,
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
  Customer,
  CustomerReview,
  TenantSettings,
} from './types';

/**
 * Deterministic seed data.
 *
 * Dates are anchored to a fixed instant so screenshots and tests stay stable.
 * Everything is written in Vietnamese because the product is operated in VN.
 */

const NOW = new Date('2026-11-10T09:30:00+07:00').getTime();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const at = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();
const dayAt = (dayOffset: number, hour: number, minute = 0) => {
  const base = new Date(NOW + dayOffset * DAY);
  base.setUTCHours(hour - 7, minute, 0, 0);
  return base.toISOString();
};

/** Small deterministic PRNG so the seed never changes between reloads. */
function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T,>(random: () => number, list: readonly T[]): T =>
  list[Math.floor(random() * list.length) % list.length];

const pad = (value: number, size = 2) => String(value).padStart(size, '0');

const customerFirst = [
  'Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Vũ', 'Đặng', 'Bùi', 'Đỗ', 'Ngô',
] as const;
const customerMiddle = ['Văn', 'Thị', 'Minh', 'Quốc', 'Thanh', 'Hồng', 'Đức', 'Thu'] as const;
const customerLast = [
  'An', 'Bình', 'Chi', 'Dũng', 'Giang', 'Hà', 'Hải', 'Hạnh', 'Hiếu', 'Hoa',
  'Hùng', 'Lan', 'Linh', 'Long', 'Mai', 'Nam', 'Nga', 'Phúc', 'Quân', 'Sơn',
  'Tâm', 'Thảo', 'Trang', 'Trung', 'Tú', 'Vy', 'Yến',
] as const;

const streets = [
  'Nguyễn Trãi', 'Lê Lợi', 'Hai Bà Trưng', 'Điện Biên Phủ', 'Võ Văn Ngân',
  'Phan Xích Long', 'Cách Mạng Tháng 8', 'Trường Chinh', 'Nguyễn Văn Linh',
  'Xô Viết Nghệ Tĩnh', 'Lý Thường Kiệt', 'Hoàng Diệu',
] as const;

const areas = [
  { district: 'Quận 1', province: 'TP. Hồ Chí Minh', lat: 10.7769, lng: 106.7009 },
  { district: 'Quận 3', province: 'TP. Hồ Chí Minh', lat: 10.7844, lng: 106.6845 },
  { district: 'Quận 7', province: 'TP. Hồ Chí Minh', lat: 10.734, lng: 106.7216 },
  { district: 'Thủ Đức', province: 'TP. Hồ Chí Minh', lat: 10.8494, lng: 106.7537 },
  { district: 'Tân Bình', province: 'TP. Hồ Chí Minh', lat: 10.8013, lng: 106.6527 },
  { district: 'Thuận An', province: 'Bình Dương', lat: 10.9239, lng: 106.7147 },
  { district: 'Dĩ An', province: 'Bình Dương', lat: 10.9068, lng: 106.7695 },
  { district: 'Biên Hòa', province: 'Đồng Nai', lat: 10.9574, lng: 106.8427 },
  { district: 'Cầu Giấy', province: 'Hà Nội', lat: 21.0313, lng: 105.7987 },
  { district: 'Hoàng Mai', province: 'Hà Nội', lat: 20.9754, lng: 105.8641 },
  { district: 'Hải Châu', province: 'Đà Nẵng', lat: 16.0471, lng: 108.2196 },
  { district: 'Thanh Khê', province: 'Đà Nẵng', lat: 16.0666, lng: 108.1871 },
] as const;

const random = rng(20261110);

const personName = () =>
  `${pick(random, customerFirst)} ${pick(random, customerMiddle)} ${pick(random, customerLast)}`;

const phone = () => `09${pad(Math.floor(random() * 100_000_000), 8)}`;

const addressOf = (area: (typeof areas)[number]) =>
  `${pad(Math.floor(random() * 300) + 1)} ${pick(random, streets)}`;

// ---------------------------------------------------------------------------
// Warehouses & bins
// ---------------------------------------------------------------------------

export const warehouses: Warehouse[] = [
  {
    id: 'wh-hcm',
    code: 'HCM-01',
    name: 'Kho trung tâm Tân Bình',
    address: '124 Trường Chinh, Tân Bình',
    province: 'TP. Hồ Chí Minh',
    capacityCbm: 4800,
    usedCbm: 3612,
    binCount: 486,
    manager: 'Trần Quốc Hùng',
    status: 'ACTIVE',
  },
  {
    id: 'wh-bduong',
    code: 'BD-01',
    name: 'Kho Bình Dương',
    address: 'Lô C3, KCN Sóng Thần, Dĩ An',
    province: 'Bình Dương',
    capacityCbm: 6200,
    usedCbm: 4108,
    binCount: 640,
    manager: 'Nguyễn Thị Hạnh',
    status: 'ACTIVE',
  },
  {
    id: 'wh-hanoi',
    code: 'HN-01',
    name: 'Kho Hà Nội',
    address: '18 Nguyễn Văn Linh, Long Biên',
    province: 'Hà Nội',
    capacityCbm: 3200,
    usedCbm: 2455,
    binCount: 312,
    manager: 'Lê Đức Anh',
    status: 'ACTIVE',
  },
  {
    id: 'wh-danang',
    code: 'DN-01',
    name: 'Kho Đà Nẵng',
    address: '56 Hoàng Diệu, Hải Châu',
    province: 'Đà Nẵng',
    capacityCbm: 1800,
    usedCbm: 604,
    binCount: 168,
    manager: 'Phạm Thu Trang',
    status: 'MAINTENANCE',
  },
];

const zones = ['A', 'B', 'C', 'D'] as const;

export const bins: Bin[] = warehouses.flatMap((warehouse, warehouseIndex) =>
  zones.flatMap((zone, zoneIndex) =>
    Array.from({ length: 4 }).map((_, binIndex) => {
      const maxWeight = 480 + binIndex * 60;
      const maxVolume = 1.2 + binIndex * 0.25;
      const filled = ((warehouseIndex + zoneIndex + binIndex) % 6) / 10;
      return {
        id: `bin-${warehouse.code.toLowerCase()}-${zone}${binIndex + 1}`,
        code: `${warehouse.code}-${zone}-${pad(binIndex + 1, 2)}`,
        warehouseId: warehouse.id,
        zone,
        maxWeightKg: maxWeight,
        maxVolumeCbm: Number(maxVolume.toFixed(2)),
        usedWeightKg: Math.round(maxWeight * filled),
        usedVolumeCbm: Number((maxVolume * filled).toFixed(2)),
      };
    }),
  ),
);

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

const catalog: Array<[string, string, string, number, number, number | null, number]> = [
  ['SLG-MILK-001', 'Sữa tươi Vinamilk 1L', 'Thực phẩm', 1.05, 0.0012, 21, 32_000],
  ['SLG-MILK-014', 'Sữa chua TH True Milk lốc 4', 'Thực phẩm', 0.48, 0.0009, 14, 28_500],
  ['SLG-COFF-021', 'Cà phê Trung Nguyên Sáng Tạo 500g', 'Đồ uống', 0.55, 0.0008, 365, 89_000],
  ['SLG-RICE-008', 'Gạo ST25 túi 5kg', 'Thực phẩm khô', 5.1, 0.0072, 240, 165_000],
  ['SLG-NOOD-031', 'Mì Hảo Hảo thùng 30 gói', 'Thực phẩm khô', 2.4, 0.012, 180, 112_000],
  ['SLG-SAUC-042', 'Nước mắm Chinsu 750ml', 'Gia vị', 0.95, 0.0011, 540, 48_000],
  ['SLG-OIL-017', 'Dầu ăn Neptune 2L', 'Gia vị', 2.05, 0.0024, 365, 96_000],
  ['SLG-DETE-055', 'Nước giặt Omo 3.6kg', 'Hóa mỹ phẩm', 3.8, 0.0048, 730, 178_000],
  ['SLG-SHAM-062', 'Dầu gội Clear 650ml', 'Hóa mỹ phẩm', 0.72, 0.001, 900, 129_000],
  ['SLG-TOOT-073', 'Kem đánh răng PS 180g', 'Hóa mỹ phẩm', 0.21, 0.0003, 900, 32_000],
  ['SLG-DIAP-084', 'Tã Huggies quần size L 44 miếng', 'Mẹ & bé', 1.6, 0.009, 1095, 245_000],
  ['SLG-MILK-092', 'Sữa bột Ensure 850g', 'Mẹ & bé', 0.98, 0.0018, 540, 615_000],
  ['SLG-ELEC-101', 'Tai nghe Bluetooth Soundcore', 'Điện tử', 0.18, 0.0006, null, 890_000],
  ['SLG-ELEC-118', 'Sạc dự phòng Anker 20000mAh', 'Điện tử', 0.42, 0.0004, null, 720_000],
  ['SLG-HOME-123', 'Nồi chiên không dầu 5L', 'Gia dụng', 4.6, 0.018, null, 1_590_000],
  ['SLG-HOME-137', 'Bộ chăn ga gối cotton', 'Gia dụng', 2.2, 0.021, null, 640_000],
  ['SLG-FASH-144', 'Áo thun cotton nam', 'Thời trang', 0.22, 0.0009, null, 189_000],
  ['SLG-FASH-158', 'Giày sneaker nữ', 'Thời trang', 0.75, 0.0045, null, 459_000],
];

export const products: Product[] = catalog.map((row, index) => {
  const [sku, name, category, weightKg, volumeCbm, shelfLifeDays, unitPrice] = row;
  return {
    id: `prd-${index + 1}`,
    sku,
    name,
    barcode: `893${pad(500_000_000 + index * 7_313, 9)}`,
    category,
    unit: category === 'Điện tử' || category === 'Gia dụng' ? 'cái' : 'thùng',
    weightKg,
    volumeCbm,
    shelfLifeDays,
    reorderPoint: 40 + (index % 5) * 15,
    unitPrice,
    active: index !== 16,
  };
});

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

const clientNames = [
  ['Công ty TNHH Bán lẻ An Phát', 'An Phát Retail'],
  ['Công ty CP Thực phẩm Sài Gòn', 'Sài Gòn Foods'],
  ['Công ty TNHH Thương mại Minh Long', 'Minh Long Trading'],
  ['Công ty CP Mẹ & Bé Hạnh Phúc', 'Hạnh Phúc Baby'],
  ['Công ty TNHH Điện tử Nam Việt', 'Nam Việt Electronics'],
  ['Công ty CP Dược phẩm Tâm An', 'Tâm An Pharma'],
] as const;

export const clients: Client[] = clientNames.map(([name, short], index) => {
  const area = areas[index % areas.length];
  return {
    id: `cli-${index + 1}`,
    code: `CL-${pad(index + 1, 3)}`,
    name,
    contactName: personName(),
    email: `ops@${short.toLowerCase().replace(/[^a-z]/g, '')}.vn`,
    phone: phone(),
    address: `${addressOf(area)}, ${area.district}, ${area.province}`,
    status: index === 4 ? 'PAUSED' : 'ACTIVE',
    creditLimit: 20_000_000 + index * 8_000_000,
    ordersThisMonth: 420 + index * 137,
    codOutstanding: index === 3 ? 0 : 12_500_000 + index * 8_400_000,
    monthlyVolume: 850 + index * 240,
    apiKeyCount: index % 3,
    joinedAt: dayAt(-320 + index * 24, 9),
  };
});

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

const orderStatuses: Order['status'][] = [
  'DELIVERED', 'DELIVERED', 'DELIVERED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY',
  'PICKING', 'PACKED', 'UNASSIGNED', 'NEW', 'RETURN_REQUESTED', 'FAILED',
  'CANCELLED', 'DELIVERED', 'IN_TRANSIT', 'PICKING',
];

export const orders: Order[] = Array.from({ length: 42 }).map((_, index) => {
  const client = clients[index % clients.length];
  const area = areas[(index * 3) % areas.length];
  const warehouse = warehouses[index % 3];
  const status = orderStatuses[index % orderStatuses.length];
  const createdAt = dayAt(-(index % 6), 8 + (index % 9), (index * 7) % 60);
  const cod = index % 4 === 0 ? 0 : 120_000 + (index % 9) * 85_000;
  const name = personName();
  const trackingCode = `SLG-${new Date(createdAt).toISOString().slice(0, 10).replace(/-/g, '')}-${pad(
    100 + index * 37,
    6,
  )}`;

  return {
    id: `ord-${index + 1}`,
    trackingCode,
    clientOrderRef: `${client.code}-${pad(8800 + index * 13, 5)}`,
    clientId: client.id,
    clientName: client.name,
    status,
    service: index % 7 === 0 ? 'SAME_DAY' : index % 3 === 0 ? 'EXPRESS' : 'STANDARD',
    customer: {
      name,
      phone: phone(),
      address: addressOf(area),
      ward: `Phường ${1 + (index % 12)}`,
      district: area.district,
      province: area.province,
      lat: Number((area.lat + (random() - 0.5) * 0.02).toFixed(6)),
      lng: Number((area.lng + (random() - 0.5) * 0.02).toFixed(6)),
    },
    warehouseId: warehouse.id,
    codAmount: cod,
    shippingFee: 18_000 + (index % 5) * 6_000,
    weightKg: Number((0.4 + (index % 8) * 0.9).toFixed(2)),
    volumeCbm: Number((0.002 + (index % 6) * 0.004).toFixed(3)),
    itemCount: 1 + (index % 5),
    notes: index % 9 === 0 ? 'Giao giờ hành chính, gọi trước 30 phút.' : undefined,
    createdAt,
    promisedAt: dayAt(-(index % 6) + 1, 17),
    updatedAt: at(-((index % 10) + 1) * 37 * MIN),
    timeline: [
      { at: createdAt, label: 'Tạo đơn từ cổng khách hàng', actor: client.code },
      { at: at(-((index % 10) + 2) * 40 * MIN), label: 'Đã phân bổ tồn kho', actor: 'WMS' },
      ...(status === 'DELIVERED'
        ? [
            {
              at: at(-((index % 10) + 1) * 60 * MIN),
              label: 'Giao thành công, đã thu COD',
              actor: 'Tài xế',
            },
          ]
        : []),
    ],
  };
});

// ---------------------------------------------------------------------------
// Fleet, trips, stops
// ---------------------------------------------------------------------------

const driverNames = [
  'Nguyễn Văn Tài', 'Trần Minh Phúc', 'Lê Hoàng Sơn', 'Phạm Đức Long',
  'Vũ Thanh Tùng', 'Đặng Quốc Khánh', 'Bùi Anh Tuấn', 'Ngô Văn Lâm',
];

export const drivers: Driver[] = driverNames.map((name, index) => ({
  id: `drv-${index + 1}`,
  code: `DRV-${pad(index + 1, 3)}`,
  name,
  phone: phone(),
  licenseClass: index % 4 === 0 ? 'C' : 'B2',
  status: index < 3 ? 'ON_TRIP' : index === 7 ? 'OFF_DUTY' : 'AVAILABLE',
  rating: Number((4.2 + (index % 8) * 0.1).toFixed(1)),
  tripsThisMonth: 38 + index * 6,
  codOnHand: index < 3 ? 4_200_000 + index * 1_350_000 : 0,
  joinedAt: dayAt(-540 + index * 30, 8),
}));

const plates = ['51C-182.34', '51D-907.11', '61A-338.90', '51F-204.77', '60A-551.08', '51C-764.29'];

export const vehicles: Vehicle[] = plates.map((plate, index) => ({
  id: `veh-${index + 1}`,
  plate,
  type: index < 2 ? 'VAN' : index < 4 ? 'TRUCK_1T' : index === 5 ? 'MOTORBIKE' : 'TRUCK_3T',
  capacityKg: [950, 900, 1_450, 1_500, 3_200, 180][index],
  capacityCbm: [4.2, 4.0, 7.5, 7.8, 16.5, 0.9][index],
  status: index < 3 ? 'IN_USE' : index === 5 ? 'MAINTENANCE' : 'AVAILABLE',
  odometerKm: 42_180 + index * 13_400,
  insuranceExpiry: dayAt(120 + index * 40, 0),
  lastServiceAt: dayAt(-30 - index * 12, 9),
}));

const tripOrderGroups = [0, 1, 2].map((tripIndex) =>
  orders.filter((order) => ['IN_TRANSIT', 'OUT_FOR_DELIVERY'].includes(order.status)).slice(tripIndex * 3, tripIndex * 3 + 4),
);

export const trips: Trip[] = [0, 1, 2].map((index) => {
  const driver = drivers[index];
  const vehicle = vehicles[index];
  const tripOrders = tripOrderGroups[index];
  const stops = tripOrders.map((order, stopIndex) => ({
    id: `stp-${index + 1}-${stopIndex + 1}`,
    sequence: stopIndex + 1,
    orderTrackingCode: order.trackingCode,
    customerName: order.customer.name,
    address: `${order.customer.address}, ${order.customer.district}`,
    district: order.customer.district,
    lat: order.customer.lat,
    lng: order.customer.lng,
    status: (stopIndex === 0 ? 'DELIVERED' : 'PENDING') as 'DELIVERED' | 'PENDING',
    eta: at((stopIndex + 1) * 35 * MIN),
    codAmount: order.codAmount,
  }));

  tripOrders.forEach((order) => {
    order.tripId = `trp-${index + 1}`;
  });

  const codExpected = stops.reduce((sum, stop) => sum + stop.codAmount, 0);

  return {
    id: `trp-${index + 1}`,
    code: `TRP-${pad(4100 + index, 4)}`,
    driverId: driver.id,
    driverName: driver.name,
    vehicleId: vehicle.id,
    vehiclePlate: vehicle.plate,
    status: index === 0 ? 'IN_PROGRESS' : 'DISPATCHED',
    warehouseCode: warehouses[index].code,
    stops,
    plannedDistanceKm: 48 + index * 11,
    actualDistanceKm: 21 + index * 8,
    plannedDurationMin: 210 + index * 25,
    startedAt: at(-(95 + index * 20) * MIN),
    completedAt: null,
    codCollected: index === 0 ? stops[0].codAmount : 0,
    codExpected,
    fuelCost: 280_000 + index * 45_000,
    optimized: index !== 2,
    createdAt: at(-(160 + index * 25) * MIN),
  };
});

// ---------------------------------------------------------------------------
// Inventory, movements, waves
// ---------------------------------------------------------------------------

export const inventory: InventoryItem[] = products.flatMap((product, productIndex) => {
  const rows: InventoryItem[] = [];
  warehouses.slice(0, 3).forEach((warehouse, warehouseIndex) => {
    if ((productIndex + warehouseIndex) % 4 === 0) return;
    const warehouseBins = bins.filter((bin) => bin.warehouseId === warehouse.id);
    const bin = warehouseBins[(productIndex + warehouseIndex) % warehouseBins.length];
    const quantity = 12 + ((productIndex * 17 + warehouseIndex * 29) % 140);
    const reserved = Math.min(quantity, (productIndex * 3 + warehouseIndex) % 25);
    rows.push({
      id: `inv-${product.id}-${warehouse.code}`,
      sku: product.sku,
      productName: product.name,
      warehouseId: warehouse.id,
      warehouseCode: warehouse.code,
      binCode: bin.code,
      lotNo: `L${2026}${pad(1 + (productIndex % 9))}${pad(1 + warehouseIndex)}`,
      quantity,
      reserved,
      available: quantity - reserved,
      expiryDate:
        product.shelfLifeDays === null
          ? null
          : dayAt(product.shelfLifeDays - (productIndex % 30), 0),
      version: 3 + (productIndex % 7),
      updatedAt: at(-((productIndex % 20) + 2) * 45 * MIN),
    });
  });
  return rows;
});

const movementTypes: StockMovement['type'][] = [
  'RECEIVE', 'PUTAWAY', 'PICK', 'TRANSFER', 'ADJUST', 'CYCLE_COUNT', 'SHIP',
];

export const movements: StockMovement[] = Array.from({ length: 64 }).map((_, index) => {
  const item = inventory[index % inventory.length];
  const type = movementTypes[index % movementTypes.length];
  const quantity = type === 'PICK' || type === 'SHIP' ? -(2 + (index % 12)) : 3 + (index % 25);
  return {
    id: `mov-${index + 1}`,
    at: at(-(index * 37 + 15) * MIN),
    type,
    sku: item.sku,
    productName: item.productName,
    quantity,
    warehouseCode: item.warehouseCode,
    binCode: item.binCode,
    reference:
      type === 'PICK'
        ? orders[index % orders.length].trackingCode
        : type === 'RECEIVE'
          ? `PO-${pad(7200 + index, 5)}`
          : `MOV-${pad(9100 + index, 5)}`,
    actor: index % 3 === 0 ? 'Nguyễn Thị Hạnh' : index % 3 === 1 ? 'Hệ thống WMS' : 'Trần Quốc Hùng',
    balanceAfter: Math.max(0, item.quantity + quantity),
    note: type === 'ADJUST' ? 'Điều chỉnh sau kiểm kê' : undefined,
  };
});

const pickableOrders = orders.filter((order) => ['PICKING', 'PACKED', 'PENDING_PICKUP'].includes(order.status));

export const waves: Wave[] = [0, 1, 2, 3].map((index) => {
  const warehouse = warehouses[index % 3];
  const orderCount = 6 + index * 3;
  return {
    id: `wav-${index + 1}`,
    code: `WAV-${pad(2300 + index, 4)}`,
    warehouseId: warehouse.id,
    warehouseCode: warehouse.code,
    strategy: index === 2 ? 'FEFO' : index === 3 ? 'LIFO' : 'FIFO',
    status: index === 0 ? 'PICKING' : index === 1 ? 'ALLOCATED' : index === 2 ? 'PICKED' : 'DRAFT',
    orderCount,
    taskCount: orderCount + 4,
    picker: index === 3 ? 'Chưa gán' : pick(random, ['Nguyễn Thị Hạnh', 'Trần Quốc Hùng', 'Lê Đức Anh']),
    zone: pick(random, zones),
    createdAt: at(-(index * 52 + 40) * MIN),
    releasedAt: index === 3 ? null : at(-(index * 48 + 20) * MIN),
  };
});

export const pickTasks: PickTask[] = waves.flatMap((wave, waveIndex) => {
  const source = pickableOrders.slice(waveIndex * 2, waveIndex * 2 + 5);
  return Array.from({ length: 8 }).map((_, taskIndex) => {
    const order = source[taskIndex % Math.max(1, source.length)] ?? orders[taskIndex];
    const item = inventory[(waveIndex * 7 + taskIndex * 3) % inventory.length];
    const status: PickTask['status'] =
      waveIndex === 0 && taskIndex < 3 ? 'PICKED' : waveIndex === 2 ? 'PICKED' : 'PENDING';
    return {
      id: `tsk-${waveIndex + 1}-${taskIndex + 1}`,
      waveId: wave.id,
      waveCode: wave.code,
      orderTrackingCode: order.trackingCode,
      sku: item.sku,
      productName: item.productName,
      binCode: item.binCode,
      quantity: 1 + (taskIndex % 4),
      pickedQuantity: status === 'PICKED' ? 1 + (taskIndex % 4) : 0,
      status,
      assignee: wave.picker,
      sequence: taskIndex + 1,
    };
  });
});

export const cycleCounts: CycleCount[] = [
  {
    id: 'cc-1',
    code: 'CC-2026-0041',
    warehouseId: 'wh-hcm',
    warehouseCode: 'HCM-01',
    zone: 'A',
    scope: 'Toàn bộ kệ A — hàng thực phẩm',
    status: 'COUNTING',
    lines: 128,
    countedLines: 84,
    varianceUnits: -6,
    varianceValue: -1_240_000,
    assignee: 'Nguyễn Thị Hạnh',
    startedAt: at(-4 * HOUR),
    closedAt: null,
  },
  {
    id: 'cc-2',
    code: 'CC-2026-0040',
    warehouseId: 'wh-bduong',
    warehouseCode: 'BD-01',
    zone: 'C',
    scope: 'Kệ C — hóa mỹ phẩm',
    status: 'REVIEW',
    lines: 96,
    countedLines: 96,
    varianceUnits: 12,
    varianceValue: 3_480_000,
    assignee: 'Trần Quốc Hùng',
    startedAt: at(-26 * HOUR),
    closedAt: null,
  },
  {
    id: 'cc-3',
    code: 'CC-2026-0039',
    warehouseId: 'wh-hanoi',
    warehouseCode: 'HN-01',
    zone: 'B',
    scope: 'Kệ B — điện tử',
    status: 'APPROVED',
    lines: 64,
    countedLines: 64,
    varianceUnits: -2,
    varianceValue: -1_780_000,
    assignee: 'Lê Đức Anh',
    startedAt: at(-50 * HOUR),
    closedAt: at(-44 * HOUR),
  },
];

export const equipment: Equipment[] = [
  ['EQ-SC-101', 'Máy quét Zebra DS2208', 'SCANNER', 'HCM-01', 'ONLINE', 92],
  ['EQ-SC-102', 'Máy quét Zebra DS2208', 'SCANNER', 'HCM-01', 'ONLINE', 64],
  ['EQ-PDA-204', 'PDA Honeywell EDA52', 'PDA', 'BD-01', 'ONLINE', 38],
  ['EQ-PDA-205', 'PDA Honeywell EDA52', 'PDA', 'BD-01', 'OFFLINE', 0],
  ['EQ-PR-311', 'Máy in nhãn Godex G500', 'LABEL_PRINTER', 'HCM-01', 'ONLINE', null],
  ['EQ-SC-402', 'Cân điện tử Keli 150kg', 'SCALE', 'HN-01', 'ONLINE', null],
  ['EQ-FL-501', 'Xe nâng điện 1.5T', 'FORKLIFT', 'BD-01', 'MAINTENANCE', null],
  ['EQ-CAM-601', 'Camera trạm đóng gói', 'CAMERA', 'HCM-01', 'ONLINE', null],
].map((row, index) => {
  const [code, name, type, warehouseCode, status, batteryPct] = row as [
    string, string, Equipment['type'], string, Equipment['status'], number | null,
  ];
  return {
    id: `eq-${index + 1}`,
    code,
    name,
    type,
    warehouseCode,
    status,
    batteryPct,
    lastSeenAt: at(-(index * 7 + 1) * MIN),
    note: status === 'MAINTENANCE' ? 'Chờ thay càng nâng, dự kiến hoàn tất 12/11.' : undefined,
  };
});

export const packSessions: PackSession[] = Array.from({ length: 14 }).map((_, index) => {
  const order = orders[index % orders.length];
  const item = products[index % products.length];
  const match: PackSession['match'] = index % 9 === 4 ? 'MISMATCH' : index % 11 === 7 ? 'OVERRIDE' : 'MATCH';
  return {
    id: `pack-${index + 1}`,
    code: `PK-${pad(6800 + index, 5)}`,
    orderTrackingCode: order.trackingCode,
    station: `ST-${1 + (index % 3)}`,
    operator: pick(random, ['Lê Thị Mai', 'Phạm Văn Tú', 'Nguyễn Hồng Vy']),
    expectedSku: item.sku,
    scannedSku: match === 'MISMATCH' ? products[(index + 3) % products.length].sku : item.sku,
    match,
    confidence: Number((0.72 + (index % 25) * 0.01).toFixed(2)),
    weightKg: Number((0.5 + (index % 12) * 0.35).toFixed(2)),
    boxSize: (['S', 'M', 'L', 'XL'] as const)[index % 4],
    status: index < 11 ? 'SEALED' : 'OPEN',
    createdAt: at(-(index * 22 + 6) * MIN),
  };
});

// ---------------------------------------------------------------------------
// Geofencing, SOS, returns
// ---------------------------------------------------------------------------

export const geofences: Geofence[] = [
  {
    id: 'geo-1',
    name: 'Kho Tân Bình — vùng cấm xe tải',
    kind: 'RESTRICTED',
    centerLat: 10.8013,
    centerLng: 106.6527,
    radiusM: 850,
    province: 'TP. Hồ Chí Minh',
    active: true,
    alerts24h: 3,
    note: 'Cấm xe tải trên 1T từ 6h đến 9h.',
  },
  {
    id: 'geo-2',
    name: 'KCN Sóng Thần',
    kind: 'SAFE',
    centerLat: 10.9239,
    centerLng: 106.7147,
    radiusM: 2400,
    province: 'Bình Dương',
    active: true,
    alerts24h: 0,
  },
  {
    id: 'geo-3',
    name: 'Cầu Sài Gòn — hạn chế tải trọng',
    kind: 'RESTRICTED',
    centerLat: 10.7986,
    centerLng: 106.7287,
    radiusM: 420,
    province: 'TP. Hồ Chí Minh',
    active: true,
    alerts24h: 1,
  },
  {
    id: 'geo-4',
    name: 'Trung tâm phân phối Long Biên',
    kind: 'SAFE',
    centerLat: 21.0476,
    centerLng: 105.8878,
    radiusM: 1800,
    province: 'Hà Nội',
    active: true,
    alerts24h: 0,
  },
  {
    id: 'geo-5',
    name: 'Phố đi bộ Nguyễn Huệ',
    kind: 'RESTRICTED',
    centerLat: 10.7743,
    centerLng: 106.7038,
    radiusM: 600,
    province: 'TP. Hồ Chí Minh',
    active: false,
    alerts24h: 0,
  },
];

export const sosAlerts: SosAlert[] = [
  {
    id: 'sos-1',
    code: 'SOS-4412',
    driverName: 'Trần Minh Phúc',
    tripCode: 'TRP-4101',
    kind: 'GEOFENCE_BREACH',
    severity: 'HIGH',
    status: 'OPEN',
    lat: 10.7986,
    lng: 106.7287,
    createdAt: at(-24 * MIN),
    note: 'Xe vào vùng cấm Cầu Sài Gòn, cần điều phối lại lộ trình.',
  },
  {
    id: 'sos-2',
    code: 'SOS-4411',
    driverName: 'Lê Hoàng Sơn',
    tripCode: 'TRP-4102',
    kind: 'IDLE_TOO_LONG',
    severity: 'MEDIUM',
    status: 'ACKNOWLEDGED',
    lat: 10.8494,
    lng: 106.7537,
    createdAt: at(-95 * MIN),
    acknowledgedBy: 'Phạm Thu Trang',
    note: 'Dừng quá 40 phút tại Thủ Đức, tài xế báo kẹt xe.',
  },
  {
    id: 'sos-3',
    code: 'SOS-4409',
    driverName: 'Nguyễn Văn Tài',
    tripCode: 'TRP-4100',
    kind: 'PANIC',
    severity: 'CRITICAL',
    status: 'RESOLVED',
    lat: 10.734,
    lng: 106.7216,
    createdAt: at(-8 * HOUR),
    acknowledgedBy: 'Trần Quốc Hùng',
    note: 'Báo nhầm, tài xế xác nhận an toàn.',
  },
];

const returnReasons: ReturnRequest['reason'][] = [
  'REFUSED', 'DAMAGED', 'WRONG_ITEM', 'NOT_DELIVERED', 'OTHER',
];

export const returns: ReturnRequest[] = Array.from({ length: 9 }).map((_, index) => {
  const order = orders[index % orders.length];
  return {
    id: `ret-${index + 1}`,
    code: `RET-${pad(5100 + index, 4)}`,
    orderTrackingCode: order.trackingCode,
    clientName: order.clientName,
    reason: returnReasons[index % returnReasons.length],
    status: (['REQUESTED', 'APPROVED', 'IN_TRANSIT', 'INSPECTING', 'REFUNDED', 'REJECTED'] as const)[index % 6],
    inspection: (['PENDING', 'SELLABLE', 'DAMAGED', 'SCRAP'] as const)[index % 4],
    refundAmount: order.codAmount || order.shippingFee,
    createdAt: at(-(index * 9 + 3) * HOUR),
    resolvedAt: index % 3 === 0 ? at(-(index * 4 + 1) * HOUR) : null,
    note: index % 4 === 0 ? 'Khách từ chối nhận vì giao trễ 2 ngày.' : undefined,
  };
});

// ---------------------------------------------------------------------------
// Finance
// ---------------------------------------------------------------------------

export const remittances: CodRemittance[] = trips.map((trip, index) => {
  const expected = trip.codExpected;
  const submitted = index === 1 ? expected - 120_000 : expected;
  return {
    id: `cod-${index + 1}`,
    code: `COD-${pad(7300 + index, 4)}`,
    driverId: trip.driverId,
    driverName: trip.driverName,
    tripCode: trip.code,
    expectedAmount: expected,
    submittedAmount: submitted,
    variance: submitted - expected,
    status: index === 0 ? 'SUBMITTED' : index === 1 ? 'DISPUTED' : 'RECONCILED',
    bankRef: index === 2 ? 'VCB-20261109-0912' : null,
    submittedAt: index === 2 ? at(-20 * HOUR) : at(-(6 + index) * HOUR),
    reconciledAt: index === 2 ? at(-18 * HOUR) : null,
    note: index === 1 ? 'Thiếu 120.000 ₫, tài xế đang đối chiếu biên lai.' : undefined,
  };
});

export const bankTransactions: BankTransaction[] = [
  {
    id: 'btx-1',
    txnDate: at(-18 * HOUR),
    description: 'VCB iBanking — NOP TIEN COD TRP-4102',
    amount: 3_420_000,
    bankRef: 'VCB-20261109-0912',
    matchedRemittanceId: 'cod-3',
    matchedAt: at(-18 * HOUR),
  },
  {
    id: 'btx-2',
    txnDate: at(-5 * HOUR),
    description: 'VCB iBanking — NOP TIEN COD TRP-4100',
    amount: 4_200_000,
    bankRef: 'VCB-20261110-0455',
    matchedRemittanceId: null,
    matchedAt: null,
  },
  {
    id: 'btx-3',
    txnDate: at(-4 * HOUR),
    description: 'VCB iBanking — NOP TIEN COD TRP-4101',
    amount: 5_430_000,
    bankRef: 'VCB-20261110-0618',
    matchedRemittanceId: null,
    matchedAt: null,
  },
  {
    id: 'btx-4',
    txnDate: at(-28 * HOUR),
    description: 'Thu hộ từ đối tác — lô 09/11',
    amount: 1_960_000,
    bankRef: 'VCB-20261109-0741',
    matchedRemittanceId: null,
    matchedAt: null,
  },
];

export const expenses: Expense[] = Array.from({ length: 10 }).map((_, index) => {
  const trip = trips[index % trips.length];
  return {
    id: `exp-${index + 1}`,
    code: `EXP-${pad(3400 + index, 4)}`,
    tripCode: trip.code,
    driverName: trip.driverName,
    type: (['FUEL', 'TOLL', 'PARKING', 'MAINTENANCE', 'ALLOWANCE'] as const)[index % 5],
    amount: 120_000 + index * 85_000,
    receiptCount: 1 + (index % 3),
    status: (['APPROVED', 'SUBMITTED', 'DRAFT', 'REJECTED'] as const)[index % 4],
    createdAt: at(-(index * 11 + 2) * HOUR),
    note: index % 4 === 3 ? 'Thiếu hóa đơn gốc.' : undefined,
  };
});

export const invoices: Invoice[] = clients.flatMap((client, index) =>
  [0, 1].map((monthOffset) => {
    const amount = 18_500_000 + index * 6_200_000;
    const paid = monthOffset === 0 ? amount : index % 3 === 0 ? 0 : Math.round(amount * 0.6);
    return {
      id: `inv-${index + 1}-${monthOffset}`,
      code: `INV-2026${pad(10 - monthOffset)}-${pad(index + 1, 3)}`,
      clientName: client.name,
      period: `10/2026`,
      amount,
      paidAmount: paid,
      status: (paid >= amount ? 'PAID' : paid === 0 ? 'OVERDUE' : 'SENT') as Invoice['status'],
      issuedAt: dayAt(-30 - monthOffset * 30, 9),
      dueAt: dayAt(-4 - monthOffset * 30, 17),
      note: index % 4 === 0 ? 'Đã gửi nhắc nợ lần 1.' : undefined,
    };
  }),
);

// ---------------------------------------------------------------------------
// AI, IAM, audit, webhooks
// ---------------------------------------------------------------------------

export const aiInsights: AiInsight[] = [
  {
    id: 'ai-1',
    model: 'DEMAND_FORECAST',
    title: 'Nhu cầu sữa tươi tăng 24% tại HCM tuần tới',
    detail:
      'Mô hình dự báo theo ngày trong tuần và lịch khuyến mãi của 3 khách hàng lớn. Khuyến nghị tăng tồn an toàn tại kho HCM-01 trước 12/11.',
    metricLabel: 'MAE dự báo',
    metricValue: '7,8%',
    confidence: 0.86,
    status: 'NEW',
    entityRef: 'SLG-MILK-001',
    createdAt: at(-3 * HOUR),
  },
  {
    id: 'ai-2',
    model: 'COST_ANOMALY',
    title: 'Chi phí nhiên liệu chuyến TRP-4102 cao bất thường',
    detail:
      'Chi phí 610.000 ₫ cao hơn 38% so với cùng tuyến. Đã đối chiếu 2 hóa đơn, một hóa đơn không khớp biển số xe.',
    metricLabel: 'Điểm bất thường',
    metricValue: '0,91',
    confidence: 0.91,
    status: 'NEW',
    entityRef: 'TRP-4102',
    createdAt: at(-6 * HOUR),
  },
  {
    id: 'ai-3',
    model: 'CHURN_RISK',
    title: 'Minh Long Trading có nguy cơ rời bỏ trong 30 ngày',
    detail:
      'Sản lượng giảm 32% trong 3 tuần, 4 đơn giao trễ liên tiếp. Điểm rủi ro 0,77.',
    metricLabel: 'F1-score',
    metricValue: '0,74',
    confidence: 0.77,
    status: 'ACKNOWLEDGED',
    entityRef: 'CL-003',
    createdAt: at(-1 * DAY),
  },
  {
    id: 'ai-4',
    model: 'DELIVERY_ETA',
    title: 'ETA tuyến Thủ Đức chậm hơn kế hoạch 22 phút',
    detail:
      'Ảnh hưởng 9 đơn trong chuyến TRP-4101. Nguyên nhân: ùn tắc tại nút giao Phạm Văn Đồng.',
    metricLabel: 'MAE ETA',
    metricValue: '6,4 phút',
    confidence: 0.82,
    status: 'ACTIONED',
    entityRef: 'TRP-4101',
    createdAt: at(-9 * HOUR),
  },
  {
    id: 'ai-5',
    model: 'ROUTE_OPTIMIZER',
    title: 'Tối ưu lại lộ trình tiết kiệm 18,4 km',
    detail:
      'Áp dụng CVRP cho 3 chuyến đang chạy, giảm 12% quãng đường và 26 phút di chuyển.',
    metricLabel: 'Quãng đường giảm',
    metricValue: '18,4 km',
    confidence: 0.93,
    status: 'NEW',
    entityRef: 'TRP-4100',
    createdAt: at(-2 * HOUR),
  },
  {
    id: 'ai-6',
    model: 'DEMAND_FORECAST',
    title: 'Tồn kho Hải Châu thấp hơn điểm đặt hàng lại',
    detail:
      'Dự báo thiếu 64 thùng mì Hảo Hảo trong 5 ngày tới nếu không nhập thêm.',
    metricLabel: 'RMSE',
    metricValue: '11,2',
    confidence: 0.79,
    status: 'DISMISSED',
    entityRef: 'SLG-NOOD-031',
    createdAt: at(-2 * DAY),
  },
];

export const apiKeys: ApiKey[] = [
  {
    id: 'key-1',
    name: 'Tích hợp ERP An Phát',
    prefix: 'slg_live_7f2c',
    scopes: ['orders:read', 'orders:write', 'inventory:read'],
    status: 'ACTIVE',
    createdAt: dayAt(-90, 10),
    lastUsedAt: at(-12 * MIN),
    createdBy: 'Trần Quốc Hùng',
  },
  {
    id: 'key-2',
    name: 'Webhook vận chuyển',
    prefix: 'slg_live_91ab',
    scopes: ['shipments:read', 'tracking:read'],
    status: 'ACTIVE',
    createdAt: dayAt(-45, 14),
    lastUsedAt: at(-3 * HOUR),
    createdBy: 'Nguyễn Thị Hạnh',
  },
  {
    id: 'key-3',
    name: 'Sandbox đối tác',
    prefix: 'slg_test_4cd0',
    scopes: ['orders:read'],
    status: 'EXPIRED',
    createdAt: dayAt(-400, 9),
    lastUsedAt: dayAt(-210, 16),
    createdBy: 'Lê Đức Anh',
  },
];

const auditActions: Array<[string, string, string, AuditLog['result']]> = [
  ['Phê duyệt quyết toán COD', 'cod_remittance', 'COD-7302', 'SUCCESS'],
  ['Sửa phân quyền vai trò', 'role', 'LOGISTICS_MANAGER', 'SUCCESS'],
  ['Tạo API key', 'api_key', 'slg_live_91ab', 'SUCCESS'],
  ['Huỷ đơn hàng', 'order', 'SLG-20261108-000247', 'SUCCESS'],
  ['Đăng nhập thất bại', 'session', 'ops@minhlong.vn', 'DENIED'],
  ['Xuất báo cáo tồn kho', 'report', 'inventory_202611', 'SUCCESS'],
  ['Điều chỉnh tồn kho', 'inventory', 'SLG-OIL-017', 'SUCCESS'],
  ['Gọi API ngoài phạm vi', 'api_key', 'slg_test_4cd0', 'DENIED'],
  ['Đồng bộ webhook thất bại', 'webhook', 'https://erp.anphat.vn/hooks', 'ERROR'],
  ['Đóng chuyến TRP-4100', 'trip', 'TRP-4100', 'SUCCESS'],
];

export const auditLogs: AuditLog[] = auditActions.map(([action, entity, entityRef, result], index) => ({
  id: `aud-${index + 1}`,
  at: at(-(index * 47 + 8) * MIN),
  actor: index % 4 === 0 ? 'Nguyễn Thị Hạnh' : index % 4 === 1 ? 'Trần Quốc Hùng' : index % 4 === 2 ? 'Hệ thống' : 'Lê Đức Anh',
  action,
  entity,
  entityRef,
  ip: `113.161.${20 + index}.${100 + index * 3}`,
  result,
}));

const roleRows: Array<[string, string, string, string[]]> = [
  ['TENANT_ADMIN', 'Quản trị tenant', 'Toàn quyền trong tenant, quản lý người dùng và cấu hình.', ['*']],
  [
    'WAREHOUSE_MANAGER',
    'Quản lý kho',
    'Điều hành nhập xuất, kiểm kê, cấu hình kho.',
    ['inventory:read', 'inventory:write', 'wave:write', 'cycle_count:write', 'product:write'],
  ],
  [
    'WAREHOUSE_STAFF',
    'Nhân viên kho',
    'Soạn hàng, quét đóng gói, kiểm kê theo phân công.',
    ['inventory:read', 'wave:read', 'pack:write', 'cycle_count:read'],
  ],
  [
    'LOGISTICS_MANAGER',
    'Điều phối vận tải',
    'Lập chuyến, phân tài xế, theo dõi GPS và SOS.',
    ['trip:read', 'trip:write', 'driver:write', 'gps:read', 'sos:write', 'cod:read'],
  ],
  ['DRIVER', 'Tài xế', 'Xem chuyến được gán, đẩy GPS, nộp COD.', ['trip:self', 'gps:write', 'cod:submit']],
  ['CUSTOMER_CLIENT', 'Khách hàng B2B', 'Tạo đơn, theo dõi vận đơn, xem hoá đơn.', ['order:self', 'invoice:self']],
];

export const roles: RoleDefinition[] = roleRows.map(([key, name, description, permissions], index) => ({
  id: `role-${index + 1}`,
  key,
  name,
  description,
  permissions,
  builtin: true,
  memberCount: [2, 3, 12, 4, 18, 6][index],
}));

const userRows: Array<[string, string, string]> = [
  ['Trần Quốc Hùng', 'hung.tran@smartlogi.vn', 'TENANT_ADMIN'],
  ['Nguyễn Thị Hạnh', 'hanh.nguyen@smartlogi.vn', 'WAREHOUSE_MANAGER'],
  ['Lê Đức Anh', 'anh.le@smartlogi.vn', 'WAREHOUSE_MANAGER'],
  ['Phạm Thu Trang', 'trang.pham@smartlogi.vn', 'LOGISTICS_MANAGER'],
  ['Nguyễn Văn Tài', 'tai.nguyen@smartlogi.vn', 'DRIVER'],
  ['Trần Minh Phúc', 'phuc.tran@smartlogi.vn', 'DRIVER'],
  ['Lê Thị Mai', 'mai.le@smartlogi.vn', 'WAREHOUSE_STAFF'],
  ['Hoàng Minh Quân', 'quan.hoang@anphat.vn', 'CUSTOMER_CLIENT'],
];

export const users: UserAccount[] = userRows.map(([name, email, role], index) => ({
  id: `usr-${index + 1}`,
  name,
  email,
  phone: phone(),
  role,
  status: index === 7 ? 'INVITED' : 'ACTIVE',
  lastActiveAt: index === 7 ? null : at(-(index * 19 + 2) * MIN),
  createdAt: dayAt(-260 + index * 28, 9),
}));

export const webhooks: WebhookEndpoint[] = [
  {
    id: 'whk-1',
    url: 'https://erp.anphat.vn/hooks/smartlogi',
    events: ['order.created', 'order.delivered', 'cod.reconciled'],
    status: 'ACTIVE',
    secretPrefix: 'whsec_7a2',
    successRate: 0.998,
    lastDeliveryAt: at(-8 * MIN),
  },
  {
    id: 'whk-2',
    url: 'https://ops.minhlong.vn/api/logistics',
    events: ['shipment.updated', 'return.approved'],
    status: 'FAILING',
    secretPrefix: 'whsec_4c9',
    successRate: 0.71,
    lastDeliveryAt: at(-2 * HOUR),
  },
  {
    id: 'whk-3',
    url: 'https://hanhphucbaby.vn/webhooks/delivery',
    events: ['order.created', 'order.returned'],
    status: 'PAUSED',
    secretPrefix: 'whsec_1d5',
    successRate: 0.96,
    lastDeliveryAt: dayAt(-12, 18),
  },
];

export const notifications: Notification[] = [
  {
    id: 'ntf-1',
    at: at(-24 * MIN),
    title: 'Cảnh báo vùng cấm',
    detail: 'TRP-4101 đi vào vùng cấm Cầu Sài Gòn.',
    severity: 'CRITICAL',
    read: false,
    href: '/logistics/sos',
  },
  {
    id: 'ntf-2',
    at: at(-2 * HOUR),
    title: 'Quyết toán COD chờ duyệt',
    detail: 'COD-7300 đã nộp, cần đối soát.',
    severity: 'WARNING',
    read: false,
    href: '/finance/cod',
  },
  {
    id: 'ntf-3',
    at: at(-5 * HOUR),
    title: 'Wave WAV-2302 đã phân bổ',
    detail: '15 đơn, 19 tác vụ soạn hàng tại BD-01.',
    severity: 'INFO',
    read: true,
    href: '/wms/waves',
  },
  {
    id: 'ntf-4',
    at: at(-1 * DAY),
    title: 'Kiểm kê CC-2026-0040 chờ duyệt',
    detail: 'Chênh lệch +12 đơn vị tại kệ C.',
    severity: 'WARNING',
    read: true,
    href: '/inventory/cycle-count',
  },
];

// ---------------------------------------------------------------------------
// Khách hàng B2C dùng customer portal (s以自己的单号) riêng biệt với `clients`.
// ---------------------------------------------------------------------------

const customerNames = [
  'Trần Thanh Tuấn', 'Nguyễn Thị Hương', 'Lê Minh Hoàng', 'Phạm Thùy Linh',
  'Đỗ Quốc Bảo', 'Trịnh Thị Mai', 'Vũ Đình Đạt', 'Hoàng Văn Thảo',
  'Bùi Thị Hoa', 'Nguyễn Văn An', 'Phùng Duy Sơn', 'Vũ Thị Thu',
  'Trần Tấn Đạt', 'Lương Đình Hương', 'Mai Hùng Cường', 'Lê Thị Yến',
];

export const customers: Customer[] = customerNames.map((name, index) => {
  const area = areas[(index * 2) % areas.length];
  const addressFull = addressOf(area);
  const wards = ['Phường 1', 'Phường 3', 'Phường 5', 'Phường 10', 'Phường 11', 'Phường Bao Thạnh'];
  return {
    id: `cust-${index + 1}`,
    code: `Cust-${pad(index + 1, 4)}`,
    name,
    contactName: name,
    email: `cust${index + 1}@gmail.com`,
    phone: phone(),
    address: `${addressFull}`,
    province: area.province,
    district: area.district,
    ward: wards[index % wards.length],
    status: index === 4 ? 'PAUSED' : index === 8 ? 'CHURNED' : 'ACTIVE',
    creditLimit: 5_000_000 + index * 1_200_000,
    ordersThisMonth: 3 + index,
    codOutstanding: index < 3 ? 12_500_000 + index * 5_400_000 : 0,
    monthlyVolume: 20 + index * 3,
    apiKeyCount: 0,
    joinedAt: dayAt(-400 + index * 12, 9),
  };
});

export const customerReviews: CustomerReview[] = customers
  .slice(0, 10)
  .map((customer, index) => ({
    id: `rev-${index + 1}`,
    customerId: customer.id,
    customerName: customer.name,
    rating: 3 + (index % 3) + (index % 2),
    comment: [
      'Giao nhanh, nhân viên thân thiện.',
      'Hàng nguyên vẹn, giá tốt.',
      'Chưa hài lòng, bị trễ giao.',
      'Sẽ đặt hàng trong tương lai.',
      'Dịch vụ khách hàng chuyên nghiệp.',
      'Hỗ trợ đổi trả nhanh chóng.',
      'Hệ thống theo dõi tiện lợi.',
      'Sự linh hoạt khi giao hàng.',
      'Phí vận chuyển hợp lý.',
      'Khuyên dùng cho nhu cầu gửi hàng.',
    ][index],
    createdAt: dayAt(-30 + index * 3, 9),
  }));

// ---------------------------------------------------------------------------
// Hoạt động đa kênh của thông báo (SMS/email/PUSH...).
// ---------------------------------------------------------------------------

export const notificationEvents: NotificationEvent[] = [
  {
    id: 'nevt-1',
    kind: 'SMS',
    to: drivers[0].phone,
    recipientName: drivers[0].name,
    subject: 'Chào chuyến TRP-4101',
    body: 'Bạn có chuyến TRP-4101 vào lúc 08:00 sáng nay. Xuất phát từwarehouse BD-01.',
    status: 'DELIVERED',
    sentAt: at(-165 * MIN),
    deliveredAt: at(-164 * MIN),
    createdAt: at(-165 * MIN),
    extra: { refId: 'trp-1' },
  },
  {
    id: 'nevt-2',
    kind: 'EMAIL',
    to: customers[0].email,
    recipientName: customers[0].name,
    subject: 'Đơn hàng SLG-260709-8 đã lên đường',
    body: 'Đống hàng SLG-260709-8 của bạn đang trên đường đi.',
    status: 'DELIVERED',
    sentAt: at(-130 * MIN),
    deliveredAt: at(-128 * MIN),
    createdAt: at(-130 * MIN),
    extra: { refId: 'SLG-260709-8' },
  },
  {
    id: 'nevt-3',
    kind: 'PUSH',
    to: 'Bùi Thị Hoa',
    recipientName: 'Bùi Thị Hoa',
    subject: 'Mã đơn hàng mới',
    body: 'Mã của bạn là STG-26085-5924. Theo dõi tại https://customer.tracking/26085.',
    status: 'FAILED',
    sentAt: null,
    deliveredAt: null,
    createdAt: at(-95 * MIN),
    extra: {},
  },
  {
    id: 'nevt-4',
    kind: 'WHATSAPP',
    to: '0986452710',
    recipientName: 'Lưu ý',
    subject: 'Đơn hàng chờ xác nhận',
    body: 'Đơn hàng của quý khách đang chờ biên dịch, vui lòng.',
    status: 'PENDING',
    sentAt: null,
    deliveredAt: null,
    createdAt: new Date().toISOString(),
    extra: {},
  },
  {
    id: 'nevt-5',
    kind: 'IN_APP',
    to: 'admin',
    recipientName: 'Hệ thống',
    subject: 'Cảnh báo tồn khoBucket',
    body: 'Tồn của giao dịch bằng điểm cảnh báo.',
    status: 'SENT',
    sentAt: at(-45 * MIN),
    deliveredAt: null,
    createdAt: at(-45 * MIN),
    extra: {},
  },
];

// ---------------------------------------------------------------------------
// Nhiên liệu xe theo mốc thời gian.
// ---------------------------------------------------------------------------

const fuelStations = [
  'XP Eni Bến Thành', 'Lào Cai Shell 321', 'Xăng dầu Sài Gòn Q3', 'Petrolimex Việt Trì',
  'AMIP Kiên Giang', 'ABC nhiên liệu', 'B Xu', 'G Tùng',
];

export const fuelLogs: FuelLog[] = [0, 1, 2, 3, 4, 5].map((vehicleIndex, logIndex) => ({
  id: `fuel-${logIndex + 1}`,
  vehicleId: `veh-${vehicleIndex + 1}`,
  vehiclePlate: vehicles[vehicleIndex].plate,
  at: at(-(5 + logIndex * 5) * DAY),
  liters: 40 + (logIndex % 7) * 15,
  cost: 1_100_000 + (logIndex % 7) * 450_000,
  km: vehicles[vehicleIndex].odometerKm + logIndex * 120,
  station: fuelStations[logIndex % fuelStations.length],
  note: '',
}));

// ---------------------------------------------------------------------------
// Bảo trì & diagnose xe.
// ---------------------------------------------------------------------------

const maintenanceTypes: MaintenanceType[] = ['OIL', 'TIRE', 'ENGINE', 'BRAKE', 'REGULAR', 'RANDOM'];
const maintenanceProviders = ['Đại lý Đức Anh', 'Dịch vụ So Faro', 'Hãng Xăng Xe Trung Tâm', 'JX Kia Parse'];

export const maintenanceRecords: MaintenanceRecord[] = [0, 1, 2, 3, 4, 5].map(
  (vehicleIndex, recordIndex) => ({
    id: `mt-${recordIndex + 1}`,
    vehicleId: `veh-${vehicleIndex + 1}`,
    vehiclePlate: vehicles[vehicleIndex].plate,
    type: maintenanceTypes[recordIndex % maintenanceTypes.length],
    scheduledAt: at(-(20 + recordIndex * 40) * DAY),
    cost: [4_500_000, 24_000_000, 12_500_000, 1_200_000, 3_800_000][recordIndex % 5],
    doneAt: at(-(18 + recordIndex * 40) * DAY),
    provider: maintenanceProviders[recordIndex % maintenanceProviders.length],
    note: '',
  }),
);

// ---------------------------------------------------------------------------
// Phản xạ tài xế: check-in/out, đến/thấy/không giao được, dừng...
// ---------------------------------------------------------------------------

const activityKinds: DriverActivityKind[] = [
  'CHECK_IN', 'CHECK_OUT', 'STOP_ARRIVE', 'STOP_DELIVER', 'STOP_FAIL', 'IDLE_START',
  'IDLE_END', 'REFUEL', 'MAINTENANCE', 'BONUS', 'FINE',
];

const next = (dayOffset: number) => at(-(dayOffset % 40) * DAY);

export const driverActivities: DriverActivity[] = [0, 1, 2, 3, 4, 5, 6, 7].map(
  (driverIndex, activityIndex) => {
    const trip = trips[activityIndex % trips.length];
    return {
      id: `act-${activityIndex + 1}`,
      driverId: `drv-${driverIndex + 1}`,
      driverName: drivers[driverIndex].name,
      tripId: trip.id,
      tripCode: trip.code,
      kind: activityKinds[activityIndex % activityKinds.length],
      at: next(driverIndex * 5 + activityIndex * 2),
      location:
        activityKinds[activityIndex % activityKinds.length] === 'CHECK_IN'
          ? { lat: 10.7769, lng: 106.7009 }
          : undefined,
      note: '',
    };
  },
);

// ---------------------------------------------------------------------------
// POD — hình ảnh/ban ký khi hoàn tất giao hàng.
// ---------------------------------------------------------------------------

export const pods: PODRecord[] = [0, 1, 2].map((tripIndex, recordIndex) => ({
  id: `pod-${recordIndex + 1}`,
  tripId: trips[tripIndex].id,
  tripCode: trips[tripIndex].code,
  driverId: trips[tripIndex].driverId,
  driverName: trips[tripIndex].driverName,
  customerName: trips[tripIndex].stops[0].customerName,
  contactPhone: phone(),
  photo: `https://pod.smartlogi.vn/${trips[tripIndex].code}-${recordIndex + 1}.jpg`,
  signature: `https://pod.smartlogi.vn/${trips[tripIndex].code}-${recordIndex + 1}.png`,
  deliveredAt: at(-((3 - tripIndex) * 3) * DAY),
  recipient: trips[tripIndex].stops[0].customerName,
  note: '',
  createdAt: at(-((3 - tripIndex) * 3) * DAY),
}));

export const tenantSettings: TenantSettings = {
  id: 'tenant-settings',
  name: 'SmartLogi Demo Logistics',
  slug: 'demo-logistics-vn',
  timezone: 'Asia/Ho_Chi_Minh',
  currency: 'VND',
  locale: 'vi-VN',
  address: '124 Trường Chinh, Tân Bình, TP. Hồ Chí Minh',
  contactName: 'Trần Quốc Hùng',
  contactEmail: 'hung.tran@smartlogi.vn',
  autoAllocateStrategy: 'FIFO',
  codCutoffHour: 17,
  lowStockThreshold: 40,
  notifyChannels: ['email', 'webhook'],
  updatedAt: at(-2 * DAY),
};
