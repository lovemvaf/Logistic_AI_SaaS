import type {
  AiInsight,
  ApiKey,
  Client,
  CodRemittance,
  Customer,
  CycleCount,
  Driver,
  DriverActivityKind,
  Equipment,
  Expense,
  MaintenanceType,
  MovementType,
  NotificationEvent,
  NotificationEventKind,
  OrderPartial,
  OrderStatus,
  PickTask,
  ReturnRequest,
  ServiceLevel,
  SosAlert,
  TripStatus,
  TripStop,
  UserAccount,
  Vehicle,
  Warehouse,
  Wave,
  WebhookEndpoint,
} from './mock';

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const ORDER_LABELS: Record<OrderStatus, string> = {
  NEW: 'Mới',
  UNASSIGNED: 'Chưa gán chuyến',
  PENDING_PICKUP: 'Chờ lấy hàng',
  PICKING: 'Đang soạn',
  PACKED: 'Đã đóng gói',
  IN_TRANSIT: 'Đang vận chuyển',
  OUT_FOR_DELIVERY: 'Đang phát',
  DELIVERED: 'Đã giao',
  FAILED: 'Giao thất bại',
  RETURN_REQUESTED: 'Yêu cầu trả',
  RETURNED: 'Đã trả',
  CANCELLED: 'Đã huỷ',
};

const ORDER_TONES: Record<OrderStatus, Tone> = {
  NEW: 'info',
  UNASSIGNED: 'warning',
  PENDING_PICKUP: 'warning',
  PICKING: 'info',
  PACKED: 'info',
  IN_TRANSIT: 'info',
  OUT_FOR_DELIVERY: 'info',
  DELIVERED: 'success',
  FAILED: 'danger',
  RETURN_REQUESTED: 'warning',
  RETURNED: 'neutral',
  CANCELLED: 'neutral',
};

const TRIP_LABELS: Record<TripStatus, string> = {
  PLANNED: 'Đã lập',
  DISPATCHED: 'Đã điều phối',
  IN_PROGRESS: 'Đang chạy',
  COMPLETED: 'Đã đóng',
  CANCELLED: 'Đã huỷ',
};

const TRIP_TONES: Record<TripStatus, Tone> = {
  PLANNED: 'neutral',
  DISPATCHED: 'info',
  IN_PROGRESS: 'info',
  COMPLETED: 'success',
  CANCELLED: 'neutral',
};

const RETURN_LABELS: Record<ReturnRequest['status'], string> = {
  REQUESTED: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  IN_TRANSIT: 'Đang về kho',
  INSPECTING: 'Đang kiểm định',
  REFUNDED: 'Đã hoàn tiền',
  REJECTED: 'Từ chối',
};

const RETURN_TONES: Record<ReturnRequest['status'], Tone> = {
  REQUESTED: 'warning',
  APPROVED: 'info',
  IN_TRANSIT: 'info',
  INSPECTING: 'warning',
  REFUNDED: 'success',
  REJECTED: 'danger',
};

const COD_LABELS: Record<CodRemittance['status'], string> = {
  PENDING: 'Chờ nộp',
  SUBMITTED: 'Đã nộp',
  RECONCILED: 'Đã đối soát',
  DISPUTED: 'Đang lệch',
};

const COD_TONES: Record<CodRemittance['status'], Tone> = {
  PENDING: 'warning',
  SUBMITTED: 'info',
  RECONCILED: 'success',
  DISPUTED: 'danger',
};

const MOVEMENT_LABELS: Record<MovementType, string> = {
  RECEIVE: 'Nhập kho',
  PUTAWAY: 'Cất hàng',
  PICK: 'Soạn hàng',
  TRANSFER: 'Chuyển vị trí',
  ADJUST: 'Điều chỉnh',
  CYCLE_COUNT: 'Kiểm kê',
  RETURN: 'Hàng trả',
  SHIP: 'Xuất kho',
};

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Quản trị nền tảng',
  TENANT_ADMIN: 'Quản trị tenant',
  WAREHOUSE_MANAGER: 'Quản lý kho',
  WAREHOUSE_STAFF: 'Nhân viên kho',
  LOGISTICS_MANAGER: 'Điều phối vận tải',
  DRIVER: 'Tài xế',
  CUSTOMER_CLIENT: 'Khách hàng B2B',
  TENANT_USER: 'Người dùng tenant',
};

const CUSTOMER_STATUS_LABELS: Record<Customer['status'], string> = {
  ACTIVE: 'Hoạt động',
  PAUSED: 'Tạm ngưng',
  CHURNED: 'Ngừng hoạt động',
};

const CUSTOMER_STATUS_TONES: Record<Customer['status'], Tone> = {
  ACTIVE: 'success',
  PAUSED: 'warning',
  CHURNED: 'danger',
};

const CLIENT_STATUS_LABELS: Record<Client['status'], string> = CUSTOMER_STATUS_LABELS;
const CLIENT_STATUS_TONES: Record<Client['status'], Tone> = CUSTOMER_STATUS_TONES;

const DRIVER_STATUS_LABELS: Record<Driver['status'], string> = {
  AVAILABLE: 'Sẵn sàng',
  ON_TRIP: 'Đang chuyến',
  OFF_DUTY: 'Nghỉ ca',
  SUSPENDED: 'Tạm đình chỉ',
};

const DRIVER_STATUS_TONES: Record<Driver['status'], Tone> = {
  AVAILABLE: 'success',
  ON_TRIP: 'info',
  OFF_DUTY: 'neutral',
  SUSPENDED: 'danger',
};

const VEHICLE_STATUS_LABELS: Record<Vehicle['status'], string> = {
  AVAILABLE: 'Sẵn sàng',
  IN_USE: 'Đang vận hành',
  MAINTENANCE: 'Bảo trì',
};

const VEHICLE_STATUS_TONES: Record<Vehicle['status'], Tone> = {
  AVAILABLE: 'success',
  IN_USE: 'info',
  MAINTENANCE: 'warning',
};

const SHIPPING_STATUS_LABELS: Record<TripStop['status'], string> = {
  PENDING: 'Chờ giao',
  ARRIVED: 'Đã đến',
  DELIVERED: 'Đã giao',
  FAILED: 'Giao thất bại',
};

const SHIPPING_STATUS_TONES: Record<TripStop['status'], Tone> = {
  PENDING: 'neutral',
  ARRIVED: 'info',
  DELIVERED: 'success',
  FAILED: 'danger',
};

const SERVICE_LABELS: Record<ServiceLevel, string> = {
  STANDARD: 'Tiêu chuẩn',
  EXPRESS: 'Nhanh',
  SAME_DAY: 'Hàng ngày',
};

const SERVICE_TONES: Record<ServiceLevel, Tone> = {
  STANDARD: 'info',
  EXPRESS: 'info',
  SAME_DAY: 'success',
};

const WAREHOUSE_STATUS_LABELS: Record<Warehouse['status'], string> = {
  ACTIVE: 'Hoạt động',
  MAINTENANCE: 'Bảo trì',
};

const WAREHOUSE_TONES: Record<Warehouse['status'], Tone> = {
  ACTIVE: 'success',
  MAINTENANCE: 'warning',
};

const WAVE_STATUS_LABELS: Record<Wave['status'], string> = {
  DRAFT: 'Phác thảo',
  ALLOCATED: 'Đã phân bổ',
  PICKING: 'Đang soạn',
  PICKED: 'Đã soạn',
  CANCELLED: 'Đã huỷ',
};

const WAVE_STATUS_TONES: Record<Wave['status'], Tone> = {
  DRAFT: 'neutral',
  ALLOCATED: 'info',
  PICKING: 'info',
  PICKED: 'success',
  CANCELLED: 'neutral',
};

const PICK_TASK_STATUS_LABELS: Record<PickTask['status'], string> = {
  PENDING: 'Chờ',
  PICKED: 'Đã soạn',
  SHORT: 'Thiếu',
  SKIPPED: 'Bỏ qua',
};

const PICK_TASK_STATUS_TONES: Record<PickTask['status'], Tone> = {
  PENDING: 'neutral',
  PICKED: 'success',
  SHORT: 'warning',
  SKIPPED: 'neutral',
};

const CYCLE_COUNT_STATUS_LABELS: Record<CycleCount['status'], string> = {
  DRAFT: 'Phác thảo',
  COUNTING: 'Đang đếm',
  REVIEW: 'Đang xét',
  APPROVED: 'Đã duyệt',
  CANCELLED: 'Đã huỷ',
};

const CYCLE_COUNT_STATUS_TONES: Record<CycleCount['status'], Tone> = {
  DRAFT: 'neutral',
  COUNTING: 'info',
  REVIEW: 'warning',
  APPROVED: 'success',
  CANCELLED: 'neutral',
};

const EQUIPMENT_STATUS_LABELS: Record<Equipment['status'], string> = {
  ONLINE: 'Hoạt động',
  OFFLINE: 'Ngắt kết nối',
  MAINTENANCE: 'Bảo trì',
};

const EQUIPMENT_STATUS_TONES: Record<Equipment['status'], Tone> = {
  ONLINE: 'success',
  OFFLINE: 'danger',
  MAINTENANCE: 'warning',
};

const INVOICE_STATUS_LABELS: Record<Invoice['status'], string> = {
  DRAFT: 'Bản nháp',
  SENT: 'Đã gửi',
  PAID: 'Đã trả',
  OVERDUE: 'Quá hạn',
  VOID: 'Hủy bỏ',
};

const INVOICE_STATUS_TONES: Record<Invoice['status'], Tone> = {
  DRAFT: 'neutral',
  SENT: 'info',
  PAID: 'success',
  OVERDUE: 'danger',
  VOID: 'danger',
};

const ACCOUNT_STATUS_LABELS: Record<UserAccount['status'], string> = {
  ACTIVE: 'Hoạt động',
  INVITED: 'Đã mời',
  SUSPENDED: 'Tạm đình chỉ',
};

const ACCOUNT_STATUS_TONES: Record<UserAccount['status'], Tone> = {
  ACTIVE: 'success',
  INVITED: 'info',
  SUSPENDED: 'danger',
};

const API_KEY_STATUS_LABELS: Record<ApiKey['status'], string> = {
  ACTIVE: 'Hoạt động',
  REVOKED: 'Đã thu hồi',
  EXPIRED: 'Hết hạn',
};

const API_KEY_STATUS_TONES: Record<ApiKey['status'], Tone> = {
  ACTIVE: 'success',
  REVOKED: 'neutral',
  EXPIRED: 'danger',
};

const WEBHOOK_STATUS_LABELS: Record<WebhookEndpoint['status'], string> = {
  ACTIVE: 'Hoạt động',
  PAUSED: 'Tạm dừng',
  FAILING: 'Có lỗi',
};

const WEBHOOK_STATUS_TONES: Record<WebhookEndpoint['status'], Tone> = {
  ACTIVE: 'success',
  PAUSED: 'warning',
  FAILING: 'danger',
};

const ALERT_KIND_LABELS: Record<SosAlert['kind'], string> = {
  PANIC: 'Cảnh báo tay',
  GEOFENCE_BREACH: 'Vượt địa danh',
  OFF_ROUTE: 'Lệch tuyến',
  IDLE_TOO_LONG: 'Ngừng lâu',
};

const ALERT_STATUS_LABELS: Record<SosAlert['status'], string> = {
  OPEN: 'Mở',
  ACKNOWLEDGED: 'Đã tiếp nhận',
  RESOLVED: 'Đã đóng',
};

const ALERT_STATUS_TONES: Record<SosAlert['status'], Tone> = {
  OPEN: 'warning',
  ACKNOWLEDGED: 'info',
  RESOLVED: 'success',
};

const ALERT_SEVERITY_TONES: Record<SosAlert['severity'], Tone> = {
  LOW: 'neutral',
  MEDIUM: 'info',
  HIGH: 'warning',
  CRITICAL: 'danger',
};

const INSIGHT_STATUS_LABELS: Record<AiInsight['status'], string> = {
  NEW: 'Mới',
  ACKNOWLEDGED: 'Đã ghi nhận',
  ACTIONED: 'Đã xử lý',
  DISMISSED: 'Đã bỏ',
};

const INSIGHT_STATUS_TONES: Record<AiInsight['status'], Tone> = {
  NEW: 'info',
  ACKNOWLEDGED: 'warning',
  ACTIONED: 'success',
  DISMISSED: 'neutral',
};

const MAINTENANCE_TYPE_LABELS: Record<MaintenanceType, string> = {
  OIL: 'Đổi dầu',
  TIRE: 'Thay lốp',
  ENGINE: 'Sửa máy',
  BRAKE: 'Thay phanh',
  REGULAR: 'Bảo dưỡng định kỳ',
  RANDOM: 'Khác',
};

const ACTIVITY_KIND_LABELS: Record<DriverActivityKind, string> = {
  CHECK_IN: 'Điểm danh vào',
  CHECK_OUT: 'Điểm danh ra',
  STOP_ARRIVE: 'Đến điểm',
  STOP_DELIVER: 'Giao thành công',
  STOP_FAIL: 'Giao thất bại',
  IDLE_START: 'Bắt đầu chờ',
  IDLE_END: 'Kết thúc chờ',
  REFUEL: 'Đổ nhiên liệu',
  MAINTENANCE: 'Bảo trì',
  BONUS: 'Thưởng',
  FINE: 'Phạt',
};

const ACTIVITY_KIND_TONES: Record<DriverActivityKind, Tone> = {
  CHECK_IN: 'info',
  CHECK_OUT: 'info',
  STOP_ARRIVE: 'info',
  STOP_DELIVER: 'success',
  STOP_FAIL: 'danger',
  IDLE_START: 'warning',
  IDLE_END: 'info',
  REFUEL: 'neutral',
  MAINTENANCE: 'warning',
  BONUS: 'success',
  FINE: 'danger',
};

const ORDER_PARTIAL_STATUS_LABELS: Record<OrderPartial['status'], string> = {
  PARTIAL: 'Đang phân đơn',
  COMPLETE: 'Đủ hàng',
  CANCELLED: 'Đã huỷ',
};

const ORDER_PARTIAL_STATUS_TONES: Record<OrderPartial['status'], Tone> = {
  PARTIAL: 'info',
  COMPLETE: 'success',
  CANCELLED: 'neutral',
};

const NOTIFICATION_EVENT_STATUS_LABELS: Record<NotificationEvent['status'], string> = {
  PENDING: 'Chờ gửi',
  SENT: 'Đã gửi',
  DELIVERED: 'Đã nhận',
  FAILED: 'Thất bại',
};

const NOTIFICATION_EVENT_STATUS_TONES: Record<NotificationEvent['status'], Tone> = {
  PENDING: 'warning',
  SENT: 'info',
  DELIVERED: 'success',
  FAILED: 'danger',
};

const NOTIFICATION_EVENT_KIND_LABELS: Record<NotificationEventKind, string> = {
  SMS: 'Tin nhắn SMS',
  EMAIL: 'Email',
  PUSH: 'Thông báo đẩy',
  IN_APP: 'Trong ứng dụng',
  WHATSAPP: 'WhatsApp',
};

const EXPENSE_TYPE_LABELS: Record<Expense['type'], string> = {
  FUEL: 'Nhiên liệu',
  TOLL: 'Cầu đường',
  PARKING: 'Gửi xe',
  MAINTENANCE: 'Bảo trì',
  ALLOWANCE: 'Phụ cấp',
  OTHER: 'Khác',
};

const EXPENSE_TYPE_TONES: Record<Expense['type'], Tone> = {
  FUEL: 'info',
  TOLL: 'info',
  PARKING: 'info',
  MAINTENANCE: 'warning',
  ALLOWANCE: 'info',
  OTHER: 'neutral',
};

export const orderStatusLabel = (status: OrderStatus) => ORDER_LABELS[status] ?? status;
export const orderStatusTone = (status: OrderStatus): Tone => ORDER_TONES[status] ?? 'neutral';
export const tripStatusLabel = (status: TripStatus) => TRIP_LABELS[status] ?? status;
export const tripStatusTone = (status: TripStatus): Tone => TRIP_TONES[status] ?? 'neutral';
export const returnStatusLabel = (status: ReturnRequest['status']) => RETURN_LABELS[status] ?? status;
export const returnStatusTone = (status: ReturnRequest['status']): Tone =>
  RETURN_TONES[status] ?? 'neutral';
export const codStatusLabel = (status: CodRemittance['status']) => COD_LABELS[status] ?? status;
export const codStatusTone = (status: CodRemittance['status']): Tone => COD_TONES[status] ?? 'neutral';
export const movementTypeLabel = (type: MovementType) => MOVEMENT_LABELS[type] ?? type;
export const roleLabel = (role: string) => ROLE_LABELS[role] ?? role.replace(/_/g, ' ').toLowerCase();
export const customerStatusLabel = (status: Customer['status']) => CUSTOMER_STATUS_LABELS[status] ?? status;
export const customerStatusTone = (status: Customer['status']): Tone => CUSTOMER_STATUS_TONES[status] ?? 'neutral';
export const clientStatusLabel = (status: Client['status']) => CLIENT_STATUS_LABELS[status] ?? status;
export const clientStatusTone = (status: Client['status']): Tone => CLIENT_STATUS_TONES[status] ?? 'neutral';
export const driverStatusLabel = (status: Driver['status']) => DRIVER_STATUS_LABELS[status] ?? status;
export const driverStatusTone = (status: Driver['status']): Tone => DRIVER_STATUS_TONES[status] ?? 'neutral';
export const vehicleStatusLabel = (status: Vehicle['status']) => VEHICLE_STATUS_LABELS[status] ?? status;
export const vehicleStatusTone = (status: Vehicle['status']): Tone => VEHICLE_STATUS_TONES[status] ?? 'neutral';
export const shippingStatusLabel = (status: TripStop['status']) => SHIPPING_STATUS_LABELS[status] ?? status;
export const shippingStatusTone = (status: TripStop['status']): Tone => SHIPPING_STATUS_TONES[status] ?? 'neutral';
export const serviceLabel = (service: ServiceLevel) => SERVICE_LABELS[service] ?? service;
export const serviceTone = (service: ServiceLevel): Tone => SERVICE_TONES[service] ?? 'neutral';
export const warehouseStatusLabel = (status: Warehouse['status']) => WAREHOUSE_STATUS_LABELS[status] ?? status;
export const warehouseStatusTone = (status: Warehouse['status']): Tone => WAREHOUSE_TONES[status] ?? 'neutral';
export const waveStatusLabel = (status: Wave['status']) => WAVE_STATUS_LABELS[status] ?? status;
export const waveStatusTone = (status: Wave['status']): Tone => WAVE_STATUS_TONES[status] ?? 'neutral';
export const pickTaskStatusLabel = (status: PickTask['status']) => PICK_TASK_STATUS_LABELS[status] ?? status;
export const pickTaskStatusTone = (status: PickTask['status']): Tone => PICK_TASK_STATUS_TONES[status] ?? 'neutral';
export const cycleCountStatusLabel = (status: CycleCount['status']) =>
  CYCLE_COUNT_STATUS_LABELS[status] ?? status;
export const cycleCountStatusTone = (status: CycleCount['status']): Tone =>
  CYCLE_COUNT_STATUS_TONES[status] ?? 'neutral';
export const equipmentStatusLabel = (status: Equipment['status']) => EQUIPMENT_STATUS_LABELS[status] ?? status;
export const equipmentStatusTone = (status: Equipment['status']): Tone => EQUIPMENT_STATUS_TONES[status] ?? 'neutral';
export const invoiceStatusLabel = (status: Invoice['status']) => INVOICE_STATUS_LABELS[status] ?? status;
export const invoiceStatusTone = (status: Invoice['status']): Tone => INVOICE_STATUS_TONES[status] ?? 'neutral';
export const accountStatusLabel = (status: UserAccount['status']) => ACCOUNT_STATUS_LABELS[status] ?? status;
export const accountStatusTone = (status: UserAccount['status']): Tone => ACCOUNT_STATUS_TONES[status] ?? 'neutral';
export const apiKeyStatusLabel = (status: ApiKey['status']) => API_KEY_STATUS_LABELS[status] ?? status;
export const apiKeyStatusTone = (status: ApiKey['status']): Tone => API_KEY_STATUS_TONES[status] ?? 'neutral';
export const webhookStatusLabel = (status: WebhookEndpoint['status']) => WEBHOOK_STATUS_LABELS[status] ?? status;
export const webhookStatusTone = (status: WebhookEndpoint['status']): Tone => WEBHOOK_STATUS_TONES[status] ?? 'neutral';
export const sosAlertStatusLabel = (status: SosAlert['status']) => ALERT_STATUS_LABELS[status] ?? status;
export const sosAlertStatusTone = (status: SosAlert['status']): Tone => ALERT_STATUS_TONES[status] ?? 'neutral';
export const sosAlertKindLabel = (kind: SosAlert['kind']) => ALERT_KIND_LABELS[kind] ?? kind;
export const sosAlertSeverityTone = (severity: SosAlert['severity']): Tone =>
  ALERT_SEVERITY_TONES[severity] ?? 'neutral';
export const insightStatusLabel = (status: AiInsight['status']) => INSIGHT_STATUS_LABELS[status] ?? status;
export const insightStatusTone = (status: AiInsight['status']): Tone => INSIGHT_STATUS_TONES[status] ?? 'neutral';
export const maintenanceTypeLabel = (type: MaintenanceType) => MAINTENANCE_TYPE_LABELS[type] ?? type;
export const activityKindLabel = (kind: DriverActivityKind) => ACTIVITY_KIND_LABELS[kind] ?? kind;
export const activityKindTone = (kind: DriverActivityKind): Tone => ACTIVITY_KIND_TONES[kind] ?? 'neutral';
export const orderPartialStatusLabel = (status: OrderPartial['status']) => ORDER_PARTIAL_STATUS_LABELS[status] ?? status;
export const orderPartialStatusTone = (status: OrderPartial['status']): Tone =>
  ORDER_PARTIAL_STATUS_TONES[status] ?? 'neutral';
export const notificationEventStatusLabel = (status: NotificationEvent['status']) =>
  NOTIFICATION_EVENT_STATUS_LABELS[status] ?? status;
export const notificationEventStatusTone = (status: NotificationEvent['status']): Tone =>
  NOTIFICATION_EVENT_STATUS_TONES[status] ?? 'neutral';
export const notificationEventKindLabel = (kind: NotificationEventKind) => NOTIFICATION_EVENT_KIND_LABELS[kind] ?? kind;
export const expenseTypeLabel = (type: Expense['type']) => EXPENSE_TYPE_LABELS[type] ?? type;
export const expenseTypeTone = (type: Expense['type']): Tone => EXPENSE_TYPE_TONES[type] ?? 'neutral';

const currency = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
});

const number = new Intl.NumberFormat('vi-VN');

const dateTime = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const dateOnly = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

export const formatCurrency = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value) ? currency.format(value) : '—';

export const formatNumber = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value) ? number.format(value) : '—';

export const formatDateTimeVN = (value: string | number | Date | null | undefined) => {
  if (value === null || value === undefined || value === '') return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '—' : dateTime.format(parsed);
};

export const formatDateVN = (value: string | number | Date | null | undefined) => {
  if (value === null || value === undefined || value === '') return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '—' : dateOnly.format(parsed);
};
