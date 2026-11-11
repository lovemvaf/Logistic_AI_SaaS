export type InventoryItem = {
  id: string;
  warehouseId: string;
  binId: string;
  productId: string;
  batchNumber?: string;
  expiryDate?: string;
  lpn?: string;
  quantityOnHand: number;
  quantityAllocated: number;
  status: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  product?: ProductSummary;
  bin?: BinSummary;
  warehouse?: WarehouseSummaryRef;
};

export type ProductSummary = {
  id: string;
  sku: string;
  name: string;
  barcode?: string;
  categoryId?: string;
  weightKg: number;
  volumeCbm: number;
  status: string;
};

export type BinSummary = {
  id: string;
  rackId: string;
  warehouseId: string;
  barcode: string;
  rowIndex: number;
  levelIndex: number;
  maxWeightKg: number;
  maxVolumeCbm: number;
};

export type WarehouseSummaryRef = {
  id: string;
  name: string;
  code: string;
  address: string;
  status: string;
};

export type StockMovement = {
  id: string;
  inventoryId: string;
  warehouseId: string;
  transactionType: string;
  quantityChange: number;
  balanceAfter: number;
  referenceDocument?: string;
  reasonCode?: string;
  actorId: string;
  createdAt: string;
  inventory?: InventoryItem;
  warehouse?: WarehouseSummaryRef;
};

export type Adjustment = {
  id: string;
  inventoryId: string;
  warehouseId: string;
  reasonCode?: string;
  quantityChange: number;
  createdBy: string;
  createdAt: string;
  inventory?: InventoryItem;
  creator?: UserSummaryRef;
};

export type CycleCount = {
  id: string;
  warehouseId: string;
  status: string;
  scheduledAt?: string;
  createdBy: string;
  createdAt: string;
  creator?: UserSummaryRef;
};

export type UserSummaryRef = {
  id: string;
  email: string;
  fullName: string;
  phone?: string;
  status: string;
};

export type ZoneSummary = {
  id: string;
  warehouseId: string;
  code: string;
  type: string;
};

export type RackSummary = {
  id: string;
  zoneId: string;
  code: string;
  aisle: string;
  rows: number;
  levels: number;
};

export type CategorySummary = {
  id: string;
  name: string;
  parentId?: string;
  slug: string;
  icon?: string;
  sortOrder: number;
  isActive: boolean;
};
