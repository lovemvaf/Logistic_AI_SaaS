export type TripSummary = {
  id: string;
  tripCode: string;
  vehicleId?: string;
  driverId?: string;
  status: string;
  plannedRouteGeometry?: string;
  actualRouteGeometry?: string;
  totalWeightKg: number;
  totalVolumeCbm: number;
  estimatedDistanceKm?: number;
  actualDistanceKm?: number;
  aiOptimized: boolean;
  departureTime?: string;
  returnTime?: string;
  metadata?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  vehicle?: VehicleSummary;
  driver?: DriverSummary;
  stops?: TripStop[];
  deliveries?: Delivery[];
};

export type VehicleSummary = {
  id: string;
  plateNumber: string;
  type: string;
  capacityKg: number;
  capacityCbm: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
};

export type DriverSummary = {
  id: string;
  userId: string;
  licenseClass: string;
  licenseExpiry: string;
  status: string;
  lastKnownLocation?: string;
  locationUpdatedAt?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  user?: {
    id: string;
    email: string;
    fullName: string;
    phone?: string;
    avatarUrl?: string;
    status: string;
  };
};

export type TripStop = {
  id: string;
  tripId: string;
  orderId?: string;
  stopType: string;
  sequence: number;
  location?: string;
  address: string;
  status: string;
  plannedEta?: string;
  actualArrivalTime?: string;
  createdAt: string;
  updatedAt: string;
  order?: {
    id: string;
    trackingCode: string;
    recipientName: string;
    recipientPhone: string;
  };
};

export type Delivery = {
  id: string;
  tripId: string;
  orderId: string;
  stopSequence: number;
  stopType: string;
  status: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  lat: number;
  lng: number;
  codAmountExpected: number;
  codAmountCollected: number;
  podImageUrl?: string;
  podSignatureUrl?: string;
  checkinLat?: number;
  checkinLng?: number;
  syncVersion: number;
  driverId?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  order?: {
    id: string;
    trackingCode: string;
  };
};

export type DriverExpense = {
  id: string;
  driverId: string;
  tripId?: string;
  amount: number;
  category: string;
  note?: string;
  receiptImageUrl?: string;
  fuelCost?: number;
  status: string;
  createdAt: string;
};

export type CodRemittance = {
  id: string;
  driverId: string;
  totalCodCollected: number;
  totalExpensesDeducted: number;
  amountRemitted: number;
  status: string;
  qrCodeToken?: string;
  createdAt: string;
};

export type SosAlert = {
  id: string;
  driverId: string;
  tripId?: string;
  message?: string;
  status: string;
  createdAt: string;
  driver?: DriverSummary;
  trip?: TripSummary;
};

export type Geofence = {
  id: string;
  name: string;
  polygon?: string;
  zoneType: string;
  isActive: boolean;
  createdAt: string;
};

export type GpsTrackingLog = {
  id: string;
  driverId: string;
  tripId?: string;
  lat: number;
  lng: number;
  speed?: number;
  heading?: number;
  isOfflineCached: boolean;
  timestamp: string;
};

export type RouteOptimizationJob = {
  id: string;
  status: string;
  payload: string;
  result?: string;
  createdAt: string;
  completedAt?: string;
};

export type WavePicking = {
  id: string;
  warehouseId: string;
  waveNumber: string;
  status: string;
  totalOrders: number;
  totalItems: number;
  createdBy: string;
  createdAt: string;
};

export type Task = {
  id: string;
  warehouseId: string;
  taskType: string;
  status: string;
  priority: number;
  assigneeId?: string;
  sourceBinId?: string;
  targetBinId?: string;
  productId: string;
  quantityRequested: number;
  quantityActual?: number;
  waveId?: string;
  createdAt: string;
  updatedAt: string;
  assignee?: { id: string; fullName: string; email: string };
  product?: { id: string; sku: string; name: string };
  items?: TaskItem[];
};

export type TaskItem = {
  id: string;
  taskId: string;
  productId: string;
  quantity: number;
  product?: { id: string; sku: string; name: string };
};

export type ScanLog = {
  id: string;
  warehouseId: string;
  taskId?: string;
  barcode: string;
  result: string;
  deviceId?: string;
  actorId?: string;
  createdAt: string;
};

export type PackStationLog = {
  id: string;
  warehouseId: string;
  orderId?: string;
  weightGrams?: number;
  dimensionCm?: string;
  deviceId?: string;
  createdAt: string;
};

export type StaffShift = {
  id: string;
  warehouseId: string;
  staffId: string;
  shiftStart: string;
  shiftEnd?: string;
  status: string;
  createdAt: string;
  staff?: { id: string; fullName: string; email: string };
};

export type EquipmentCheckout = {
  id: string;
  warehouseId: string;
  equipmentCode: string;
  staffId: string;
  checkedOutAt: string;
  returnedAt?: string;
  status: string;
  createdAt: string;
  staff?: { id: string; fullName: string; email: string };
};
