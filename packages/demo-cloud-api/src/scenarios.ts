import * as crypto from 'crypto';
import { DEMO_TENANT_IDS } from './auth';
import { detUuid, withPlatform, type TxClient } from './db';
import type { NetworkSimMode, ScenarioDefinition } from './types';

export const SCENARIO_CATALOG: ScenarioDefinition[] = [
  // --- OPERATIONS & DISPATCH (8) ---
  {
    code: 'NORMAL_DAY',
    title: 'Vận hành tiêu chuẩn tại Đồng Nai',
    category: 'OPERATIONS',
    severity: 'INFO',
    targetPortal: 'tenant',
    targetPath: '/dashboard',
    expectedOutcome: 'Các chuyến container, giao hàng last-mile và đóng gói vận hành thông suốt (230+ đơn).',
    simulatedSystems: ['GPS Telemetry Feed', 'Terminal Queue Feed'],
    summary: 'Thiết lập trạng thái cân bằng ban đầu trên các trục Amata - Long Bình - Cát Lái - Cái Mép.',
  },
  {
    code: 'PEAK_SURGE',
    title: 'Bùng nổ đơn hàng cao điểm cuối tuần (+15 đơn Pending)',
    category: 'OPERATIONS',
    severity: 'WARNING',
    targetPortal: 'tenant',
    targetPath: '/orders',
    expectedOutcome: 'Tạo thêm 10 đơn hàng cao điểm vào queue đóng gói và điều phối VRP.',
    simulatedSystems: ['Order Surge Generator'],
    summary: 'Mô phỏng lưu lượng đơn hàng B2B tăng đột biến tại KCN Amata & Nhơn Trạch.',
  },
  {
    code: 'SLA_BREACH',
    title: 'Cảnh báo trễ SLA giao hàng (>2 giờ)',
    category: 'OPERATIONS',
    severity: 'CRITICAL',
    targetPortal: 'tenant',
    targetPath: '/dashboard',
    expectedOutcome: 'Đơn giao chậm được gắn cờ cảnh báo SLA trên Control Tower.',
    simulatedSystems: ['SLA Watchdog'],
    summary: 'Giả lập đơn hàng quá hạn cam kết giao hàng trên tuyến Long Thành.',
  },
  {
    code: 'CARRIER_DELAY',
    title: 'Tàu biển trễ lịch ETD 48 giờ tại Cái Mép',
    category: 'OPERATIONS',
    severity: 'WARNING',
    targetPortal: 'tenant',
    targetPath: '/freight',
    expectedOutcome: 'Chứng từ Booking & cảnh báo ETD được cập nhật kèm khuyến nghị điều chỉnh.',
    simulatedSystems: ['Carrier AIS Feed (Simulated)'],
    summary: 'Hãng tàu MSC điều chỉnh giờ cắt máng muộn 48h khiến kế hoạch hạ cont thay đổi.',
  },
  {
    code: 'CONGESTION_CAT_LAI',
    title: 'Ùn ứ Cảng Cát Lái (>145 phút chờ cổng)',
    category: 'OPERATIONS',
    severity: 'CRITICAL',
    targetPortal: 'admin',
    targetPath: '/admin/geography',
    expectedOutcome: 'Cảnh báo ùn tắc nút giao Cát Lái — khuyến nghị chuyển hướng sang Cảng Phước An.',
    simulatedSystems: ['Synthetic Terminal Queue Telemetry'],
    summary: 'Ghi nhận quan trắc Synthetic Demo: waitMinutes=148, queueLength=78 xe tại cổng Cát Lái.',
  },
  {
    code: 'DRIVER_OFFLINE_SYNC',
    title: 'Tài xế mất mạng vùng Nhơn Trạch & đồng bộ lại',
    category: 'OPERATIONS',
    severity: 'WARNING',
    targetPortal: 'tenant',
    targetPath: '/driver-sim',
    expectedOutcome: 'Hàng đợi offline tích lũy 5 gói GPS/POD và đồng bộ thành công với idempotency.',
    simulatedSystems: ['Driver Offline Queue', 'GPS Telemetry'],
    summary: 'Mô phỏng mất kết nối 4G qua khu vực cầu Nhơn Trạch và đẩy lại batch khi có mạng.',
  },
  {
    code: 'VEHICLE_BREAKDOWN',
    title: 'Sự cố kỹ thuật xe đầu kéo trên QL51',
    category: 'OPERATIONS',
    severity: 'CRITICAL',
    targetPortal: 'tenant',
    targetPath: '/logistics/vehicles',
    expectedOutcome: 'Phát sinh cảnh báo phương tiện cần bảo trì khẩn và gán lại đầu kéo dự phòng.',
    simulatedSystems: ['Fleet OBD-II Telemetry'],
    summary: 'Đầu kéo 60LD-301 gặp sự cố áp suất lốp tại nút giao QL51 — Long Thành.',
  },
  {
    code: 'SOS_EMERGENCY',
    title: 'Tín hiệu SOS khẩn cấp từ tài xế đang giao hàng',
    category: 'OPERATIONS',
    severity: 'CRITICAL',
    targetPortal: 'tenant',
    targetPath: '/driver-sim',
    expectedOutcome: 'Tạo SosAlert ACTIVE trong PostgreSQL hiển thị ngay trên Bảng điều hành.',
    simulatedSystems: ['Driver SOS Beacon'],
    summary: 'Tài xế Nguyễn Văn An kích hoạt nút SOS tại tọa độ KCN Amata.',
  },

  // --- DELIVERY / COD / FINANCE (6) ---
  {
    code: 'POD_DISPUTED',
    title: 'Khách hàng khiếu nại ảnh chứng từ giao hàng (ePOD)',
    category: 'DELIVERY_FINANCE',
    severity: 'WARNING',
    targetPortal: 'customer',
    targetPath: '/client/returns',
    expectedOutcome: 'Phát sinh yêu cầu RMA mới gắn với đơn đã giao để đối chiếu ePOD.',
    simulatedSystems: ['ePOD Signature Canvas'],
    summary: 'Người nhận báo thiếu 1 kiện trong lô hàng giao tại Phường Long Bình.',
  },
  {
    code: 'PARTIAL_DELIVERY',
    title: 'Giao hàng một phần (Partial Delivery 70%)',
    category: 'DELIVERY_FINANCE',
    severity: 'INFO',
    targetPortal: 'tenant',
    targetPath: '/orders',
    expectedOutcome: 'Đơn hàng chuyển trạng thái PARTIAL_DELIVERED kèm lý do tồn kho/người nhận.',
    simulatedSystems: ['Driver Partial Delivery Flow'],
    summary: 'Kho khách chỉ tiếp nhận trước 70% số lượng thùng hàng trong ca sáng.',
  },
  {
    code: 'COD_MISMATCH',
    title: 'Lệch tiền thu hộ COD giữa tài xế và kế toán',
    category: 'DELIVERY_FINANCE',
    severity: 'WARNING',
    targetPortal: 'tenant',
    targetPath: '/finance/cod',
    expectedOutcome: 'Bảng kê COD hiển thị bản ghi chênh lệch 250,000 VND chờ kiểm tra.',
    simulatedSystems: ['COD Remittance Checker'],
    summary: 'Phát hiện chênh lệch số tiền mặt nộp quỹ so với tổng COD các đơn trong chuyến.',
  },
  {
    code: 'BANK_RECONCILE',
    title: 'Đối soát sao kê ngân hàng tự động (CSV Fixture)',
    category: 'DELIVERY_FINANCE',
    severity: 'INFO',
    targetPortal: 'tenant',
    targetPath: '/finance/cod',
    expectedOutcome: 'Sẵn sàng 3 mã nộp quỹ REM-20261101/02/03 khớp sao kê ngân hàng mẫu.',
    simulatedSystems: ['Simulated Bank Statement CSV Feed'],
    summary: 'Khớp lệnh thanh toán tự động qua mã QR nộp tiền REM-202611xx và phát hiện 1 dòng lạ.',
  },
  {
    code: 'DEM_DET_OVERDUE',
    title: 'Cảnh báo quá hạn lưu container DEM/DET (>5 ngày)',
    category: 'DELIVERY_FINANCE',
    severity: 'CRITICAL',
    targetPortal: 'tenant',
    targetPath: '/freight',
    expectedOutcome: 'Công thức tính phí DEM/DET bậc thang tự động cảnh báo phụ phí phát sinh.',
    simulatedSystems: ['DEM/DET Escalation Engine'],
    summary: 'Container MSCU 40HC vượt quá 5 ngày miễn lưu bãi — phát sinh biểu phí bậc 2.',
  },
  {
    code: 'INVOICE_DISPUTED',
    title: 'Tranh chấp hóa đơn phụ phí chờ chờ cổng cảng',
    category: 'DELIVERY_FINANCE',
    severity: 'WARNING',
    targetPortal: 'customer',
    targetPath: '/client/freight',
    expectedOutcome: 'Tranh chấp (DisputeCase) được mở trên cổng Khách hàng B2B để xử lý.',
    simulatedSystems: ['B2B Dispute Resolution'],
    summary: 'Khách hàng Amata Precision mở khiếu nại phí chờ cổng 1,900,000 VND.',
  },

  // --- CONTAINER / YARD / TRADE XNK (7) ---
  {
    code: 'CONTAINER_CONFLICT_409',
    title: 'Xung đột trùng lịch đầu kéo / container (HTTP 409)',
    category: 'CONTAINER_YARD_TRADE',
    severity: 'NEGATIVE_TEST',
    targetPortal: 'tenant',
    targetPath: '/freight',
    expectedOutcome: 'Cố gắng phân công đầu kéo đang bận sẽ bị chặn chuẩn HTTP 409 Conflict.',
    simulatedSystems: ['Equipment Overlap Guard'],
    summary: 'Kiểm chứng tính toàn vẹn chống double-booking rơ-moóc và đầu kéo container.',
  },
  {
    code: 'YARDFULL_REEFER',
    title: 'Bãi lạnh (Reefer Slots) đạt ngưỡng >85% công suất',
    category: 'CONTAINER_YARD_TRADE',
    severity: 'WARNING',
    targetPortal: 'tenant',
    targetPath: '/yard',
    expectedOutcome: 'Các slot ổ cắm lạnh R-R1 tại ICD Long Bình báo mức đầy cao.',
    simulatedSystems: ['Reefer Plug Telemetry'],
    summary: 'Tăng số container lạnh 40RF đang cắm điện tại Depot Đồng Nai.',
  },
  {
    code: 'GATE_IN_DAMAGED_EIR',
    title: 'Gate-In phát hiện container hư hỏng — xuất biên bản EIR',
    category: 'CONTAINER_YARD_TRADE',
    severity: 'WARNING',
    targetPortal: 'tenant',
    targetPath: '/yard',
    expectedOutcome: 'Tạo ContainerGateEvent + EquipmentInterchangeReceipt trạng thái DAMAGED.',
    simulatedSystems: ['Gate OCR & EIR Simulator'],
    summary: 'Ghi nhận móp vách phải container 40HC tại cổng vào Depot Nhơn Trạch.',
  },
  {
    code: 'TRADE_MISMATCH',
    title: 'Đối chiếu Commercial Invoice & Packing List lệch trọng lượng',
    category: 'CONTAINER_YARD_TRADE',
    severity: 'WARNING',
    targetPortal: 'tenant',
    targetPath: '/trade',
    expectedOutcome: 'Hồ sơ CI vs PL báo MISMATCH_FOUND (21,200 kg vs 20,950 kg).',
    simulatedSystems: ['Document Cross-Check Engine'],
    summary: 'Phát hiện sai lệch 250kg giữa Commercial Invoice và Packing List trước khi mở tờ khai.',
  },
  {
    code: 'PASSWORD_PDF_422',
    title: 'Từ chối file PDF đặt mật khẩu (HTTP 422)',
    category: 'CONTAINER_YARD_TRADE',
    severity: 'NEGATIVE_TEST',
    targetPortal: 'tenant',
    targetPath: '/trade',
    expectedOutcome: 'Tải lên tệp có bảo vệ mật khẩu trả về 422 PASSWORD_PROTECTED minh bạch.',
    simulatedSystems: ['Document PDF Parser'],
    summary: 'Kiểm chứng negative case khi chứng từ Bill of Lading bị khóa mật khẩu.',
  },
  {
    code: 'CUSTOMS_RED_CHANNEL',
    title: 'Tờ khai Hải quan phân Luồng ĐỎ — Kiểm hóa 100%',
    category: 'CONTAINER_YARD_TRADE',
    severity: 'CRITICAL',
    targetPortal: 'tenant',
    targetPath: '/trade',
    expectedOutcome: 'Tờ khai chuyển luồng RED trạng thái HOLD chờ kiểm hóa tại cảng.',
    simulatedSystems: ['Simulated VNACCS Customs Gateway'],
    summary: 'Hệ thống Hải quan mô phỏng yêu cầu kiểm tra thực tế container hàng nhập khẩu.',
  },
  {
    code: 'HS_REVIEW_GATE',
    title: 'Cổng kiểm soát duyệt mã HS (Bắt buộc chuyên viên XNK)',
    category: 'CONTAINER_YARD_TRADE',
    severity: 'NEGATIVE_TEST',
    targetPortal: 'tenant',
    targetPath: '/trade',
    expectedOutcome: 'Tờ khai chưa duyệt mã HS bị chặn submit (HTTP 409/422) cho tới khi duyệt.',
    simulatedSystems: ['HS Advisory Rule Engine'],
    summary: 'Đảm bảo AI gợi ý mã HS chỉ mang tính tham khảo, không tự động thông quan.',
  },

  // --- WMS & PACK STATION (6) ---
  {
    code: 'PACK_MISMATCH',
    title: 'Đóng gói sai mã SKU (Barcode Mismatch + Ngoại lệ)',
    category: 'WMS_PACK',
    severity: 'NEGATIVE_TEST',
    targetPortal: 'pack',
    targetPath: '/pack',
    expectedOutcome: 'Quét nhầm SKU kích hoạt cảnh báo đỏ và ghi nhận CorrectionLog.',
    simulatedSystems: ['Virtual Barcode Scanner'],
    summary: 'Thử nghiệm quét nhầm mã SKU cảm biến cho đơn hàng yêu cầu vi mạch CNC.',
  },
  {
    code: 'PACK_WEIGHT_OVER',
    title: 'Cân điện tử phát hiện sai lệch trọng lượng vượt ngưỡng (>15%)',
    category: 'WMS_PACK',
    severity: 'WARNING',
    targetPortal: 'pack',
    targetPath: '/pack',
    expectedOutcome: 'Cân ảo báo vượt dung sai khối lượng chuẩn, yêu cầu kiểm tra trước khi Seal.',
    simulatedSystems: ['Virtual Digital Scale'],
    summary: 'Phát hiện kiện hàng nặng hơn trọng lượng danh mục SKU do thừa hoặc nhầm hàng.',
  },
  {
    code: 'CAMERA_LOW_CONFIDENCE',
    title: 'Camera CV nhận diện độ tin cậy thấp (<0.6)',
    category: 'WMS_PACK',
    severity: 'WARNING',
    targetPortal: 'pack',
    targetPath: '/pack',
    expectedOutcome: 'CV trả về confidence < 0.6 — yêu cầu nhân viên quét mã vạch xác nhận thủ công.',
    simulatedSystems: ['Virtual MobileNet V2 Camera'],
    summary: 'Mô phỏng điều kiện thiếu sáng hoặc tem rách khiến camera dưới ngưỡng an toàn 0.6.',
  },
  {
    code: 'WMS_STOCKOUT',
    title: 'Cảnh báo hết tồn kho SKU chiến lược',
    category: 'WMS_PACK',
    severity: 'CRITICAL',
    targetPortal: 'tenant',
    targetPath: '/inventory',
    expectedOutcome: 'Hiển thị mặt hàng tồn = 0 và lô FEFO sắp hết hạn dưới 10 ngày.',
    simulatedSystems: ['WMS Stock Watchdog'],
    summary: 'SKU Mô-đun Nguồn Servo hết tồn khả dụng tại Kho Ngoại quan Long Bình.',
  },
  {
    code: 'WAVE_PICKING',
    title: 'Phát hành đợt lấy hàng Wave Picking mới',
    category: 'WMS_PACK',
    severity: 'INFO',
    targetPortal: 'tenant',
    targetPath: '/wms/waves',
    expectedOutcome: 'Sinh Wave picking mới gom đơn chờ soạn vào các Pick Task.',
    simulatedSystems: ['WMS Wave Allocator'],
    summary: 'Tạo đợt sóng lấy hàng theo khu vực kệ A1 và kho lạnh C1.',
  },
  {
    code: 'CYCLE_COUNT_VARIANCE',
    title: 'Kiểm kê định kỳ phát hiện chênh lệch tồn thực tế',
    category: 'WMS_PACK',
    severity: 'WARNING',
    targetPortal: 'tenant',
    targetPath: '/inventory/cycle-count',
    expectedOutcome: 'Tạo phiếu kiểm kê chờ Quản lý kho phê duyệt điều chỉnh tồn.',
    simulatedSystems: ['Cycle Count Workflow'],
    summary: 'Kiểm kê phát hiện lệch -2 đơn vị tại bin A101 chờ phê duyệt.',
  },

  // --- GEO, SECURITY & PLATFORM GOVERNANCE (5) ---
  {
    code: 'GEO_UNVERIFIED',
    title: 'Trạng thái mã hành chính 95 đơn vị Đồng Nai 2026 (Pending Code)',
    category: 'GEO_SECURITY',
    severity: 'INFO',
    targetPortal: 'admin',
    targetPath: '/admin/geography',
    expectedOutcome: 'Hiển thị trung thực PENDING_OFFICIAL_CODE và NO_OFFICIAL_POLYGON cho 95 đơn vị.',
    simulatedSystems: ['Dong Nai 2026 Geo Registry'],
    summary: 'Xác minh dữ liệu địa giới mới không bịa mã hành chính hay đa giác chính thức.',
  },
  {
    code: 'GEO_RESTRICTED_TRUCK',
    title: 'Cảnh báo khung giờ cấm tải xe đầu kéo KCN Amata / QL51',
    category: 'GEO_SECURITY',
    severity: 'WARNING',
    targetPortal: 'admin',
    targetPath: '/admin/geography',
    expectedOutcome: 'Tuyến VRP cảnh báo hạn chế khung giờ cao điểm 06:00-09:00 & 16:00-20:00.',
    simulatedSystems: ['Road Restriction Compliance'],
    summary: 'Hiển thị quy tắc cấm tải 32T & 25T theo hành lang Bắc / Trung tâm / Nam Đồng Nai.',
  },
  {
    code: 'TENANT_SUSPENDED_403',
    title: 'Kiểm chứng chặn Doanh nghiệp Tạm Khóa (HTTP 403)',
    category: 'GEO_SECURITY',
    severity: 'NEGATIVE_TEST',
    targetPortal: 'tenant',
    targetPath: '/login',
    expectedOutcome: 'Đăng nhập vào demo-suspended bị chặn tức thì với HTTP 403 TENANT_SUSPENDED.',
    simulatedSystems: ['Tenant Status Gate'],
    summary: 'Đảm bảo doanh nghiệp quá hạn thanh toán hoặc tạm khóa không thể gọi API.',
  },
  {
    code: 'PUBLIC_GRANT_PRIVACY',
    title: 'Bảo mật Public Tracking theo mức FULL / CITY_WARD / STATUS_ONLY',
    category: 'GEO_SECURITY',
    severity: 'INFO',
    targetPortal: 'customer',
    targetPath: '/client/freight',
    expectedOutcome: 'Token cấp STATUS_ONLY ẩn hoàn toàn địa chỉ chi tiết và SĐT người nhận.',
    simulatedSystems: ['Privacy Projection Guard'],
    summary: 'Chống lộ PII trên đường dẫn chia sẻ vận đơn công khai.',
  },
  {
    code: 'OUTBOX_DEAD_LETTER',
    title: 'Hàng đợi Webhook Outbox Dead-Letter (DLQ Redrive)',
    category: 'GEO_SECURITY',
    severity: 'CRITICAL',
    targetPortal: 'admin',
    targetPath: '/admin/geography',
    expectedOutcome: 'Có bản ghi DEAD_LETTER để Super Admin bấm Redrive hồi phục trạng thái.',
    simulatedSystems: ['Simulated Webhook Receiver'],
    summary: 'Mô phỏng đích webhook đối tác trả 502 vượt số lần retry -> đẩy vào Outbox DLQ.',
  },
];

export async function getOrCreateSandbox(
  sandboxKey = 'shared-demo',
  tenantId: string = DEMO_TENANT_IDS.DN3PL,
  tenantSlug = 'demo-3pl-dn',
) {
  return withPlatform(async (tx) => {
    const existing = await tx.demoSandbox.findUnique({ where: { sandboxKey } });
    if (existing) return existing;
    return tx.demoSandbox.create({
      data: {
        sandboxKey,
        tenantId,
        tenantSlug,
        activeScenario: 'NORMAL_DAY',
        scenarioStatus: 'ACTIVE',
        simSpeed: 1,
        telemetryPaused: false,
        networkSimMode: 'NORMAL',
        stateJson: { presetTitle: 'Vận hành tiêu chuẩn tại Đồng Nai', stepCount: 0 },
        expiresAt: new Date(Date.now() + 90 * 86400 * 1000),
      },
    });
  });
}

export async function appendSimulationEvent(
  tx: TxClient | null,
  params: {
    sandboxKey: string;
    tenantId?: string | null;
    category: string;
    eventType: string;
    summary: string;
    payloadJson?: Record<string, unknown>;
  },
) {
  const exec = async (client: TxClient) =>
    client.demoSimulationEvent.create({
      data: {
        sandboxKey: params.sandboxKey,
        tenantId: params.tenantId || null,
        category: params.category,
        eventType: params.eventType,
        summary: params.summary,
        payloadJson: (params.payloadJson || {}) as any,
      },
    });
  if (tx) return exec(tx);
  return withPlatform(exec);
}

export async function applyScenarioPreset(params: {
  scenarioCode: string;
  sandboxKey: string;
  tenantId?: string | null;
  tenantSlug?: string;
}) {
  const def = SCENARIO_CATALOG.find((s) => s.code === params.scenarioCode);
  if (!def) {
    throw new Error(`Không tìm thấy kịch bản "${params.scenarioCode}".`);
  }

  const targetTenantId = params.tenantId || DEMO_TENANT_IDS.DN3PL;
  const targetSlug = params.tenantSlug || 'demo-3pl-dn';

  return withPlatform(async (tx) => {
    const effects: string[] = [];

    if (def.code === 'PEAK_SURGE') {
      const client = await tx.client.findFirst({ where: { tenantId: targetTenantId } });
      if (client) {
        for (let i = 1; i <= 5; i++) {
          const track = `SLG-SURGE-${Date.now().toString().slice(-5)}-${i}`;
          await tx.order.create({
            data: {
              tenantId: targetTenantId,
              trackingCode: track,
              clientId: client.id,
              clientOrderRef: `SURGE-${i}`,
              status: 'PENDING',
              recipientName: `Đơn Cao điểm #${i}`,
              recipientPhone: `090988000${i}`,
              recipientAddress: 'KCN Amata, Phường Long Bình, Thành phố Đồng Nai',
              lat: 10.9478,
              lng: 106.8722,
              codAmount: 1450000 * i,
              shippingFee: 65000,
              notes: '[SIMULATED PEAK_SURGE] Tạo bởi Demo Control Center',
            },
          });
        }
        effects.push('Đã thêm 5 đơn hàng PENDING vào hàng đợi cao điểm trong Neon PostgreSQL.');
      }
    } else if (def.code === 'CONGESTION_CAT_LAI') {
      const catLai = await tx.logisticsFacility.findUnique({ where: { code: 'PORT_CAT_LAI' } });
      if (catLai) {
        await tx.terminalQueueObservation.create({
          data: {
            facilityId: catLai.id,
            waitMinutes: 148,
            queueLength: 78,
            sourceLabel: 'SYNTHETIC_DEMO',
            isOfficialTelemetry: false,
            notes: '[SIMULATED CONGESTION_CAT_LAI] Cảnh báo ùn ứ cổng B-C Cảng Cát Lái (>145p).',
          },
        });
        effects.push('Đã ghi nhận quan trắc Synthetic Demo 148 phút / 78 xe tại Cảng Cát Lái.');
      }
    } else if (def.code === 'SOS_EMERGENCY') {
      const driver = await tx.driver.findFirst({ where: { tenantId: targetTenantId } });
      const trip = await tx.trip.findFirst({ where: { tenantId: targetTenantId } });
      if (driver) {
        await tx.sosAlert.create({
          data: {
            tenantId: targetTenantId,
            driverId: driver.id,
            tripId: trip?.id || null,
            message: '[SIMULATED SOS @ 10.9478,106.8722] Xe đầu kéo báo sự cố khẩn tại nút giao KCN Amata QL1A.',
            status: 'ACTIVE',
          },
        });
        effects.push('Đã phát sinh SosAlert trạng thái ACTIVE tại tọa độ KCN Amata.');
      }
    } else if (def.code === 'OUTBOX_DEAD_LETTER') {
      await tx.outboxEvent.create({
        data: {
          eventId: crypto.randomUUID(),
          correlationId: `demo-scen-${Date.now()}`,
          tenantId: targetTenantId,
          channel: 'WEBHOOK',
          topic: 'shipment.delay_alert',
          payload: { simulated: true, scenario: 'OUTBOX_DEAD_LETTER', corridor: 'SOUTH' },
          status: 'DEAD_LETTER',
          attempts: 5,
          lastError: 'Simulated 502 Bad Gateway from partner sandbox during DLQ drill',
          deadLetterReason: 'MAX_RETRIES_EXCEEDED',
        },
      });
      effects.push('Đã đẩy thêm 1 sự kiện DEAD_LETTER mới vào Outbox để Admin kiểm chứng Redrive.');
    } else if (def.code === 'CUSTOMS_RED_CHANNEL') {
      const booking = await tx.freightBooking.findFirst({ where: { tenantId: targetTenantId } });
      if (booking) {
        const declNo = `RED-${Date.now().toString().slice(-6)}`;
        const decl = await tx.customsDeclaration.create({
          data: {
            tenantId: targetTenantId,
            declarationNo: declNo,
            bookingId: booking.id,
            direction: 'IMPORT',
            channel: 'RED',
            portCode: 'VNCAI',
            hsReviewRequired: true,
            status: 'HOLD',
            notes: '[SIMULATED RED CHANNEL] Phân luồng ĐỎ kiểm hóa container 40HC tại Cái Mép.',
          },
        });
        await tx.customsStatusEvent.create({
          data: {
            tenantId: targetTenantId,
            declarationId: decl.id,
            status: 'HOLD',
            channel: 'RED',
            message: 'Simulated VNACCS: Phân luồng ĐỎ — yêu cầu kiểm tra thực tế.',
          },
        });
        effects.push(`Đã tạo tờ khai phân luồng ĐỎ (${declNo}) ở trạng thái HOLD.`);
      }
    } else if (def.code === 'CYCLE_COUNT_VARIANCE') {
      const wh = await tx.warehouse.findFirst({ where: { tenantId: targetTenantId } });
      const creator = await tx.tenantUser.findFirst({ where: { tenantId: targetTenantId } });
      if (wh && creator) {
        await tx.cycleCount.create({
          data: {
            tenantId: targetTenantId,
            warehouseId: wh.id,
            status: 'PENDING',
            scheduledAt: new Date(Date.now() + 3600 * 1000),
            createdBy: creator.id,
          },
        });
        effects.push('Đã tạo phiếu Cycle Count mới chờ Quản lý kho phê duyệt.');
      }
    } else if (def.code === 'WAVE_PICKING') {
      const wh = await tx.warehouse.findFirst({ where: { tenantId: targetTenantId } });
      const creator = await tx.tenantUser.findFirst({ where: { tenantId: targetTenantId } });
      if (wh && creator) {
        await tx.wavePicking.create({
          data: {
            tenantId: targetTenantId,
            warehouseId: wh.id,
            waveNumber: `WAVE-SIM-${Date.now().toString().slice(-5)}`,
            status: 'IN_PROGRESS',
            totalOrders: 6,
            totalItems: 18,
            createdBy: creator.id,
          },
        });
        effects.push('Đã khởi tạo Wave Picking mới với 6 đơn hàng.');
      }
    } else if (def.code === 'POD_DISPUTED') {
      const ord = await tx.order.findFirst({ where: { tenantId: targetTenantId, status: 'DELIVERED' } });
      const client = await tx.client.findFirst({ where: { tenantId: targetTenantId } });
      if (ord && client) {
        await tx.returnRequest.create({
          data: {
            tenantId: targetTenantId,
            returnCode: `RMA-SIM-${Date.now().toString().slice(-5)}`,
            orderId: ord.id,
            clientId: client.id,
            status: 'PENDING',
            reasonNote: '[SIMULATED POD_DISPUTED] Khách báo thiếu 1 kiện khi đối chiếu ảnh ePOD.',
            pickupAddress: ord.recipientAddress,
            returnType: 'REFUND',
          },
        });
        effects.push(`Đã mở yêu cầu khiếu nại/hoàn trả RMA cho đơn ${ord.trackingCode}.`);
      }
    } else {
      effects.push(`Kịch bản "${def.title}" đã sẵn sàng thao tác trên ${def.targetPath}.`);
    }

    const sandbox = await tx.demoSandbox.upsert({
      where: { sandboxKey: params.sandboxKey },
      update: {
        activeScenario: def.code,
        scenarioStatus: 'ACTIVE',
        stateJson: {
          presetTitle: def.title,
          lastEffects: effects,
          updatedAt: new Date().toISOString(),
        },
        expiresAt: new Date(Date.now() + 7 * 86400 * 1000),
      },
      create: {
        sandboxKey: params.sandboxKey,
        tenantId: targetTenantId,
        tenantSlug: targetSlug,
        activeScenario: def.code,
        scenarioStatus: 'ACTIVE',
        simSpeed: 1,
        telemetryPaused: false,
        networkSimMode: 'NORMAL',
        stateJson: {
          presetTitle: def.title,
          lastEffects: effects,
          updatedAt: new Date().toISOString(),
        },
        expiresAt: new Date(Date.now() + 7 * 86400 * 1000),
      },
    });

    await appendSimulationEvent(tx, {
      sandboxKey: params.sandboxKey,
      tenantId: targetTenantId,
      category: 'SCENARIO',
      eventType: `SCENARIO_LOAD_${def.code}`,
      summary: `${def.title} — ${effects[0] || def.summary}`,
      payloadJson: { scenario: def.code, effects, simulated: true },
    });

    return { sandbox, scenario: def, effects };
  });
}

export async function stepSimulationTick(params: {
  sandboxKey: string;
  tenantId?: string | null;
}) {
  const targetTenantId = params.tenantId || DEMO_TENANT_IDS.DN3PL;
  return withPlatform(async (tx) => {
    const sbx = await tx.demoSandbox.findUnique({ where: { sandboxKey: params.sandboxKey } });
    if (sbx?.telemetryPaused) {
      return { stepped: false, reason: 'TELEMETRY_PAUSED', sandbox: sbx };
    }
    const prevState = (sbx?.stateJson as Record<string, any>) || {};
    const stepCount = Number(prevState.stepCount || 0) + 1;

    // Advance simulated driver GPS point along Dong Nai corridor (Long Binh -> Long Thanh -> Phuoc An)
    const driver = await tx.driver.findFirst({ where: { tenantId: targetTenantId } });
    const trip = await tx.trip.findFirst({ where: { tenantId: targetTenantId, status: 'IN_TRANSIT' } });
    const waypoints = [
      { lat: 10.9415, lng: 106.8908, label: 'ICD Tân Cảng Long Bình' },
      { lat: 10.8921, lng: 106.9125, label: 'Nút giao Tam Phước QL51' },
      { lat: 10.7795, lng: 106.9531, label: 'Long Thành Gateway' },
      { lat: 10.7421, lng: 106.9068, label: 'KCN Nhơn Trạch III' },
      { lat: 10.6789, lng: 106.9245, label: 'Cảng Phước An' },
    ];
    const wp = waypoints[stepCount % waypoints.length];

    if (driver) {
      await tx.gpsTrackingLog.create({
        data: {
          tenantId: targetTenantId,
          driverId: driver.id,
          tripId: trip?.id || null,
          lat: wp.lat + (Math.random() - 0.5) * 0.002,
          lng: wp.lng + (Math.random() - 0.5) * 0.002,
          speed: 42 + (stepCount % 18),
          heading: 165,
          isOfflineCached: false,
          timestamp: new Date(),
        },
      });
    }

    const updated = await tx.demoSandbox.upsert({
      where: { sandboxKey: params.sandboxKey },
      update: {
        stateJson: {
          ...prevState,
          stepCount,
          lastWaypoint: wp.label,
          lastTickAt: new Date().toISOString(),
        },
      },
      create: {
        sandboxKey: params.sandboxKey,
        tenantId: targetTenantId,
        tenantSlug: 'demo-3pl-dn',
        activeScenario: 'NORMAL_DAY',
        stateJson: { stepCount, lastWaypoint: wp.label, lastTickAt: new Date().toISOString() },
        expiresAt: new Date(Date.now() + 7 * 86400 * 1000),
      },
    });

    await appendSimulationEvent(tx, {
      sandboxKey: params.sandboxKey,
      tenantId: targetTenantId,
      category: 'TELEMETRY',
      eventType: 'GPS_SIM_TICK',
      summary: `[SIMULATED GPS] Bước #${stepCount}: Đầu kéo qua ${wp.label} (${42 + (stepCount % 18)} km/h)`,
      payloadJson: { stepCount, waypoint: wp.label, lat: wp.lat, lng: wp.lng, simulated: true },
    });

    return { stepped: true, stepCount, waypoint: wp, sandbox: updated };
  });
}

export async function resetSandboxState(params: {
  sandboxKey: string;
  tenantId?: string | null;
}) {
  const targetTenantId = params.tenantId || DEMO_TENANT_IDS.DN3PL;
  return withPlatform(async (tx) => {
    // Clean only runtime simulation artifacts created during interactive exploration
    await tx.order.deleteMany({
      where: { tenantId: targetTenantId, trackingCode: { startsWith: 'SLG-SURGE-' } },
    });
    await tx.sosAlert.deleteMany({
      where: { tenantId: targetTenantId, message: { contains: '[SIMULATED' } },
    });
    await tx.customsDeclaration.deleteMany({
      where: { tenantId: targetTenantId, declarationNo: { startsWith: 'RED-' } },
    });
    await tx.returnRequest.deleteMany({
      where: { tenantId: targetTenantId, returnCode: { startsWith: 'RMA-SIM-' } },
    });
    await tx.wavePicking.deleteMany({
      where: { tenantId: targetTenantId, waveNumber: { startsWith: 'WAVE-SIM-' } },
    });
    await tx.cycleCount.deleteMany({
      where: {
        tenantId: targetTenantId,
        status: 'PENDING',
        id: { notIn: ['30000002-0000-4000-8000-00000000007f', '40000002-0000-4000-8000-00000000007f', '50000002-0000-4000-8000-00000000007f'] },
      },
    });
    await tx.outboxEvent.deleteMany({
      where: { tenantId: targetTenantId, correlationId: { startsWith: 'demo-scen-' } },
    });
    await tx.demoSimulationEvent.deleteMany({ where: { sandboxKey: params.sandboxKey } });

    const sandbox = await tx.demoSandbox.upsert({
      where: { sandboxKey: params.sandboxKey },
      update: {
        activeScenario: 'NORMAL_DAY',
        scenarioStatus: 'ACTIVE',
        simSpeed: 1,
        telemetryPaused: false,
        networkSimMode: 'NORMAL',
        stateJson: { presetTitle: 'Vận hành tiêu chuẩn tại Đồng Nai', stepCount: 0, resetAt: new Date().toISOString() },
      },
      create: {
        sandboxKey: params.sandboxKey,
        tenantId: targetTenantId,
        tenantSlug: 'demo-3pl-dn',
        activeScenario: 'NORMAL_DAY',
        scenarioStatus: 'ACTIVE',
        simSpeed: 1,
        telemetryPaused: false,
        networkSimMode: 'NORMAL',
        stateJson: { presetTitle: 'Vận hành tiêu chuẩn tại Đồng Nai', stepCount: 0, resetAt: new Date().toISOString() },
        expiresAt: new Date(Date.now() + 7 * 86400 * 1000),
      },
    });

    await appendSimulationEvent(tx, {
      sandboxKey: params.sandboxKey,
      tenantId: targetTenantId,
      category: 'SANDBOX',
      eventType: 'SANDBOX_RESET',
      summary: `Sandbox "${params.sandboxKey}" đã khôi phục trạng thái vận hành tiêu chuẩn.`,
      payloadJson: { sandboxKey: params.sandboxKey },
    });

    return { sandbox };
  });
}

export function normalizeNetworkMode(raw: unknown): NetworkSimMode {
  const up = String(raw || 'NORMAL').toUpperCase();
  if (up === 'SLOW_800MS' || up === 'RATE_LIMIT_429' || up === 'SERVER_500') {
    return up;
  }
  return 'NORMAL';
}
