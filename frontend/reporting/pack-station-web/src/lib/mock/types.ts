/**
 * Domain types cho pack station web.
 *
 * Các kiểu này bám theo hợp đồng REST `/api/v1/` giả định (inventory, wms):
 * khi backend hoạt động thì adapter REST (`repository`) trả về cùng hình
 * dạng. Trang không tự khai báo lại shape bên trong.
 */

export type Id = string;
export type IsoDate = string;

export type PackOrderStatus =
  | 'PENDING'
  | 'IN_QUEUE'
  | 'IN_PROGRESS'
  | 'CORRECTING'
  | 'PACKED'
  | 'CLOSED'
  | 'CANCELLED';

export type PackStationStatus = 'AVAILABLE' | 'BUSY' | 'OFFLINE';

export type PackSessionStatus = 'ACTIVE' | 'SEALING' | 'CLOSED';

export type MatchResult = 'MATCH' | 'MISMATCH' | 'OVERRIDE';

export type ServicePriority = 'NORMAL' | 'HIGH' | 'URGENT';

export type BoxType = 'LARGE' | 'MEDIUM' | 'SMALL' | 'FILM';

export type CorrectionStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

/** Mã đơn theo mẫu SmartLogi. */
export type PackCode = string;

/** Đơn chờ đóng gói tại trạm. */
export type PackOrder = {
  id: Id;
  packCode: string;
  trackingCode: string;
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string;
  expectedSku: string;
  expectedQuantity: number;
  estimatedWeight: number;
  expectedWeightGrams?: number;
  boxType: BoxType;
  status: PackOrderStatus;
  priority: ServicePriority;
  stationId?: string;
  sessionId?: Id;
  scheduledAt: IsoDate;
  createdAt: IsoDate;
  updatedAt: IsoDate;
  sealedAt: IsoDate | null;
  note?: string;
  /** Mã SKU quét được từ máy quét hoặc AI. */
  scannedSku?: string;
  /** Kết quả so khớp giữa mã quét và mã dự kiến. */
  scanResult?: MatchResult;
  /** Thời điểm quét cuối (nếu có). */
  scannedAt?: IsoDate;
  /** Nếu không có cân điện tử thì dùng bàn phím nhập thủ công. */
  estimatedWeightKg?: number;
  /** Giá trị nếu AI có thể dự đoán được mã SKU. */
  aiPrediction?: AiPrediction;
  /** Cảnh báo chênh lệch trọng lượng khi đóng kiện (nếu vượt ngưỡng cho phép). */
  weightWarning?: string;
  weightGrams?: number;
  dimensionCm?: string;
  /** Các lượt quét đã thực hiện trên đơn này. */
  scanLogs?: ScanLog[];
};

/** SKU / sản phẩm của trạm đóng gói. */
export type PackProduct = {
  id: Id;
  sku: string;
  name: string;
  weight: number;
  boxType: BoxType;
  barcode: string;
  price: number;
};

/** Nhân viên đóng gói tại trạm. */
export type PackStaff = {
  id: Id;
  staffCode: string;
  fullName: string;
  email: string;
  role: 'WAREHOUSE_STAFF' | 'WAREHOUSE_MANAGER' | 'TENANT_ADMIN';
  phone: string;
  stationId?: string;
};

/** Phiên đóng gói của một nhân viên tại một trạm. */
export type PackSession = {
  id: Id;
  sessionCode: string;
  stationId: string;
  staffId: string;
  status: PackSessionStatus;
  totalPacked: number;
  totalMatched: number;
  totalMismatched: number;
  totalCorrected: number;
  elapsedSeconds: number;
  startedAt: IsoDate;
  closedAt: IsoDate | null;
  scanLogs: ScanLog[];
};

/** Một lượt quét mã trên trạm đóng gói. */
export type ScanLog = {
  packCode: string;
  trackingCode: string;
  sku: string;
  expectedSku: string;
  result: MatchResult;
  note?: string;
  /** Độ tin cậy của dự đoán AI khi quét (nếu là AI). */
  confidence?: number;
  /** Trọng lượng kiện của đơn dự kiến. */
  weight?: number;
  /** Kiểu hộp của đơn dự kiến. */
  boxType?: BoxType;
  stationId?: string;
  staffId?: string;
  scannedAt: IsoDate;
};

/** Alias cho ScanLog theo đúng hợp đồng domain. */
export type PackScanLog = ScanLog;

/** Kết quả dự đoán AI khi quét một đơn. */
export type AiPrediction = {
  id: Id;
  sku: string;
  confidence: number;
  candidates: Array<{ sku: string; confidence: number }>;
  error?: string | null;
};

/** Ghi chú đính chính khi quét sai mã hoặc trạng thái đơn hàng. */
export type CorrectionLog = {
  id: Id;
  packCode: string;
  trackingCode: string;
  orderSku: string;
  scannedSku: string;
  reason: string;
  status: CorrectionStatus;
  createdAt: IsoDate;
};

/** Tóm tắt hiệu suất trạm / ca. */
export type StationSummary = {
  sessionsToday: number;
  packsToday: number;
  matchRate: number;
  correctionCount: number;
  averageSecondsPerPack: number;
  activeStations: PackStation[];
};

export type PackStation = {
  id: Id;
  code: string;
  name: string;
  status: PackStationStatus;
};

export type NewOrderInput = {
  scanningCode: string;
  expectedSku: string;
  estimatedWeight: number;
  boxType: BoxType;
  staffId: string;
  stationId: string;
};

export type OverrideInput = {
  packCode: string;
  scannedSku: string;
  reason: string;
  stationId?: string;
};

export type SealInput = {
  packCode: string;
  scannedSku: string;
  scannedAt: IsoDate;
  stationId?: string;
  weightGrams?: number;
  dimensionCm?: string;
};

export type SessionStartInput = {
  staffId: string;
  stationId: string;
};

export type ScanInput = {
  packCode: string;
  scannedSku: string;
  /** Độ tin cậy của AI (nếu có) khi khởi tạo mã quét. */
  confidence?: number;
};

export type CorrectionInput = {
  packCode: string;
  trackingCode: string;
  orderSku: string;
  scannedSku: string;
  reason: string;
};

/** Nhóm độ lệch khi AI phát hiện ra một bất thường trong quy trình đóng gói. */
export type AnomalyKind = 'SKU_MISMATCH' | 'VOLUMETRIC' | 'CAPACITY_RISK' | 'SCALE_ALT';

/** Dự đoán SKU của camera AI, cùng các đối thủ cạnh tranh và độ tin cậy. */
export type AiPredictionResult = {
  sku: string;
  confidence: number;
  candidates: Array<{ sku: string; confidence: number }>;
};

/** Nhận định bất thường thể tích / trọng lượng / SKU của một đơn hàng. */
export type AiAnomaly = {
  id: Id;
  packCode: string;
  trackingCode: string;
  kind: AnomalyKind;
  severity: 'high' | 'medium' | 'low';
  expectedSku: string;
  expectedWeight: number;
  detectedWeight: number;
  scannedSku?: string;
  message: string;
  recommendation: string;
  createdAt: IsoDate;
};
