export type Tenant = {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  planId?: string;
  dbSchemaName: string;
  status: string;
  maxUsers: number;
  maxWarehouses: number;
  maxVehicles: number;
  maxApiCallsPerDay: number;
  settingsJson: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  plan?: SubscriptionPlan;
  users?: TenantUser[];
  warehouses?: WarehouseSummary[];
};

export type SubscriptionPlan = {
  id: string;
  name: string;
  code: string;
  priceMonthly: number;
  maxUsers: number;
  maxWarehouses: number;
  maxVehicles: number;
  featuresJson: string;
  priceCurrency: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TenantUser = {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string;
  phone?: string;
  avatarUrl?: string;
  status: string;
  lastLogin?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  roles?: UserRole[];
  driver?: DriverProfile;
};

export type UserRole = {
  userId: string;
  roleId: string;
  role?: CustomRole;
};

export type CustomRole = {
  id: string;
  name: string;
  isSystemDefault: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  permissions?: RolePermission[];
};

export type RolePermission = {
  roleId: string;
  resource: string;
  action: string;
};

export type WarehouseSummary = {
  id: string;
  name: string;
  code: string;
  address: string;
  status: string;
  managerId?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  manager?: UserSummary;
  zones?: Zone[];
};

export type Zone = {
  id: string;
  warehouseId: string;
  code: string;
  type: string;
  createdAt: string;
  updatedAt: string;
  racks?: Rack[];
};

export type Rack = {
  id: string;
  zoneId: string;
  code: string;
  aisle: string;
  rows: number;
  levels: number;
  createdAt: string;
  updatedAt: string;
  bins?: Bin[];
};

export type Bin = {
  id: string;
  rackId: string;
  warehouseId: string;
  barcode: string;
  rowIndex: number;
  levelIndex: number;
  maxWeightKg: number;
  maxVolumeCbm: number;
  posX?: number;
  posY?: number;
  posZ?: number;
  createdAt: string;
  updatedAt: string;
};

export type UserSummary = {
  id: string;
  email: string;
  fullName: string;
  phone?: string;
  avatarUrl?: string;
  status: string;
};

export type DriverProfile = {
  id: string;
  userId: string;
  licenseClass: string;
  licenseExpiry: string;
  status: string;
  lastKnownLocation?: string;
  locationUpdatedAt?: string;
};

export type Branch = {
  id: string;
  type: string;
  code: string;
  name: string;
  address: string;
  lat?: number;
  lng?: number;
  capacityCbm?: number;
  managerId?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
};

export type FeatureFlag = {
  id: string;
  tenantId: string;
  key: string;
  enabled: boolean;
  description?: string;
  createdAt: string;
  updatedAt: string;
};

export type TenantSetting = {
  id: string;
  tenantId: string;
  key: string;
  value: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
};

export type SystemSetting = {
  id: string;
  key: string;
  value: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
};

export type TenantApiKey = {
  id: string;
  tenantId: string;
  keyHash: string;
  name?: string;
  scopes: string[];
  createdAt: string;
  revokedAt?: string;
};

export type SystemAdmin = {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type SystemAuditLog = {
  id: string;
  tenantId?: string;
  actorId: string;
  actorEmail: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  oldValues?: string;
  newValues?: string;
  ipAddress: string;
  createdAt: string;
};
