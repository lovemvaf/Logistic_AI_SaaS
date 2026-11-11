# Kiến trúc Hệ thống & Lược đồ Dữ liệu (As-Is Architecture & ERD)

Tài liệu này mô tả kiến trúc thực tế (As-Is) của SmartLogi AI SaaS sau quá trình hợp nhất modular monolith và gia cố các cổng kiểm soát `G0–G5` (trên nền snapshot baseline `775ba1ce181191054397cb62bb7430530ce33f81`, xác minh CI 6/6 jobs PASSED ở commit `75cf1ea` / Run `43023689371`).

---

## 1. Tổng quan Kiến trúc 5 Runtime & Khách hàng

Hệ thống tách biệt lớp giao diện biên, lớp cổng API/BFF, một ứng dụng nghiệp vụ lõi dạng **Modular Monolith**, hai dịch vụ Go hiệu năng cao, một Edge AI Worker chạy độc lập và một workspace Rust đang ở mức thử nghiệm (`501`/stub).

```mermaid
flowchart TD
  subgraph Clients["Khách hàng & Thiết bị đầu cuối (4 Web Portals: 84 trang + 1 Expo App: 10 màn hình)"]
    AP["admin-portal (:4001, 17 trang)"]
    TP["tenant-portal (:4002, 48 trang)"]
    CP["customer-portal (:4003, 13 trang)"]
    PS["pack-station-web (:4004, 6 trang)<br/>MobileNet ImageNet + Web Serial"]
    DA["driver-app (Expo ~56 / RN 0.85, 10 màn hình)<br/>AsyncStorage OfflineSyncEngine"]
    DEV["Thiết bị GPS IoT (HTTP/UDP) & Webhook Đối tác"]
  end

  subgraph GatewayLayer["Lớp Biên & Proxy"]
    PP["portals-proxy (Nginx :8080)"]
    GW["api/api-gateway (NestJS :3000)<br/>JWT Auth, Rate-Limit, Circuit Breaker, BFF"]
  end

  subgraph AppCore["Khối Nghiệp vụ Lõi (NestJS Modular Monolith :8081)"]
    CORE["backend/core-api (/api/v1)<br/>Modules: iam | wms | orders | logistics | customer | notification"]
    QUEUE["BullMQ Worker (routing) & OutboxDispatcher (@Cron 5s)"]
  end

  subgraph SpecializedServices["Dịch vụ Chuyên biệt"]
    GPS["Go gps-ingestion-service<br/>HTTP :8090 (Bearer) | UDP :8091 (HMAC + Replay Guard)"]
    WH["Go webhook-service (:8092)<br/>SSRF IP/DNS Guard + HMAC X-SLG-Signature"]
    AIW["Cloudflare workers/ai-worker (:8787)<br/>Hono TS: VRP NN+2opt | LLM + Formula Fallback | Z-score"]
    RUST["backend/rust-api (Thử nghiệm / Một phần 501 + AI giả lập)"]
  end

  subgraph Infra["Hạ tầng Dữ liệu & Sự kiện"]
    PG[("PostgreSQL 15 + PostGIS 3.3 (:5432)<br/>66 Prisma Models | 58 bảng bật FORCE RLS")]
    RD[("Redis 7 (:6379)<br/>Cache + BullMQ + Active Fleet Geo")]
    KF[("Apache Kafka 7.4 (:9092)<br/>Notification & Domain Events")]
    S3[("LocalStack / S3 (:4566)<br/>POD Photos & Signatures")]
    D1[("Cloudflare D1 / KV<br/>AI Model Registry & Feedback")]
  end

  AP & TP & CP & PS --> PP
  PP --> GW
  DA --> GW
  DEV -->|"HTTP POST /api/v1/gps/ingest"| GW
  DEV -->|"UDP :8091 (HMAC-SHA256)"| GPS

  GW -->|"ROUTE_RULES (longest-prefix-first)"| CORE
  GW -->|"GPS ingest HTTP"| GPS
  GW -->|"Inbound webhook /ai/*"| WH
  GW -->|"/api/v1/routing & /api/v1/ai"| AIW

  CORE --> PG
  CORE --> RD
  CORE --> S3
  CORE -->|"Transactional Outbox + BullMQ"| QUEUE
  QUEUE --> KF
  QUEUE -->|"POST /deliver"| WH
  QUEUE -->|"x-ai-api-key + POST /routing/solve"| AIW
  GPS --> PG
  GPS --> RD
  AIW --> D1
```

### Danh mục gói dùng chung (`packages/`)

| Gói | Vai trò thực tế trong Workspace |
|---|---|
| [`packages/prisma-schemas`](../packages/prisma-schemas) | Schema duy nhất của toàn hệ thống (66 model PostgreSQL/PostGIS), migration RLS và test cô lập SQL |
| [`packages/shared-types`](../packages/shared-types) | Định nghĩa `Roles`, `Permissions`, `RolePermissionMap`, decorator `@RequireRoles` / `@ExcludeRoles` / `@RequirePermissions` và [`PermissionsGuard`](../packages/shared-types/src/guards/permissions.guard.ts) |
| [`packages/wms-engine`](../packages/wms-engine) | Thuật toán cấp phát tồn kho `FIFO`/`FEFO`/`LIFO`, `allocateWithCapacity`, `assignPutawayBin`, `generateWave`, `calculateReplenishment` |
| [`packages/offline-sync-engine`](../packages/offline-sync-engine) | Thành phần đồng bộ offline dùng chung trong workspace |
| [`packages/hardware-bridge`](../packages/hardware-bridge) | Bridge giao tiếp cân điện tử / đầu đọc mã vạch Web Serial |
| [`packages/map-components`](../packages/map-components), `ui-kit`, `ui-components`, `ui-tokens` | UI dùng chung giữa các Next.js 15 portals |

---

## 2. Cơ chế Cô lập Đa khách thuê (Multi-Tenancy & PostgreSQL RLS)

Hệ thống bảo vệ dữ liệu đa khách thuê qua **hai lớp phòng thủ độc lập** bên trong [`PrismaService`](../backend/core-api/src/core/prisma/prisma.service.ts) và PostgreSQL 15:

```mermaid
sequenceDiagram
  autonumber
  participant C as Client (JWT Bearer)
  participant GW as api/api-gateway
  participant MW as TenantMiddleware & SchemaInterceptor
  participant PS as PrismaService (ALS + TX)
  participant PG as PostgreSQL (role: smartlogi_app)

  C->>GW: HTTP Request + Authorization: Bearer <JWT>
  GW->>MW: Forward sau xác thực chữ ký JWT
  MW->>PS: runWithTenantRequest(tenantId, schemaName, handler)
  PS->>PS: assertSchemaName(schemaName) /^[a-zA-Z0-9_]+$/
  PS->>PG: BEGIN TRANSACTION (timeout 30s)
  PS->>PG: SET LOCAL search_path TO "<schemaName>", public
  PS->>PG: SELECT set_config('app.tenant_id', '<tenantId>', true)
  Note over PS,PG: Mọi query ORM/raw đều gắn tenant_id qua transaction-local GUC
  PG-->>PG: RLS Policy (FORCE ROW LEVEL SECURITY)<br/>tenant_id = current_setting('app.tenant_id', true)
  PG-->>PS: Kết quả chỉ thuộc 1 tenant (hoặc 42501 nếu sai tenant)
  PS->>PG: COMMIT / ROLLBACK (connection trả về pool sạch hoàn toàn)
```

### Quy tắc kỹ thuật quan trọng đã xác minh
1. **Không còn `Scope.REQUEST` trên service**: Thay bằng `AsyncLocalStorage<TenantStore>` (`tenantContext`) gắn TransactionClient (`tx`) và Proxy hỗ trợ gọi lồng nhau (nested `$transaction` tái sử dụng transaction hiện tại).
2. **Fail-Closed theo thiết kế**: Kết nối ứng dụng phải dùng role `smartlogi_app` (`NOSUPERUSER`, `NOBYPASSRLS`) theo [`tenant-isolation.sql`](../packages/prisma-schemas/prisma/tests/tenant-isolation.sql). Khi `app.tenant_id` rỗng hoặc không khớp, PostgreSQL không trả về dòng nào và chặn ghi chéo (`42501 insufficient_privilege`).
3. **58 bảng bật `ENABLE` + `FORCE ROW LEVEL SECURITY`**:
   - **51 bảng nghiệp vụ cốt lõi** từ [`20240616000000_enable_tenant_rls`](../packages/prisma-schemas/prisma/migrations/20240616000000_enable_tenant_rls/migration.sql): `adjustments`, `ai_feedbacks`, `ai_models`, `bins`, `branches`, `categories`, `client_users`, `client_webhooks`, `clients`, `cod_remittances`, `custom_roles`, `cycle_counts`, `deliveries`, `demand_forecasts`, `driver_expenses`, `drivers`, `equipment_checkout`, `file_attachments`, `geofences`, `gps_tracking_logs`, `inventory`, `invoice_line_items`, `notifications`, `order_items`, `order_tracking_events`, `orders`, `pack_station_logs`, `products`, `racks`, `refunds`, `return_inspections`, `return_items`, `return_reasons`, `return_requests`, `role_permissions`, `route_optimization_jobs`, `scan_logs`, `shipping_rates`, `sos_alerts`, `staff_shifts`, `stock_movements`, `task_items`, `tasks`, `tenant_users`, `trip_stops`, `trips`, `user_roles`, `vehicles`, `warehouses`, `wave_picking`, `zones`.
   - **7 bảng tài chính, API key và cấu hình bổ sung** trong đợt gia cố [`20261111000000_harden_tenant_rls_and_audit`](../packages/prisma-schemas/prisma/migrations/20261111000000_harden_tenant_rls_and_audit/migration.sql): `invoices`, `payment_transactions`, `tenant_api_keys`, `feature_flags`, `tenant_settings`, `api_usage_daily`, `tenant_ui_configs`.
4. **8 bảng cấp nền tảng / liên kết gián tiếp không bật RLS**: `Tenant`, `subscription_plans`, `system_admins`, `system_audit_logs` (lọc theo `tenantId` trong controller/service), `system_settings`, `outbox_events` (worker toàn cục), `notification_templates`, `client_api_keys` (gắn qua khóa ngoại `client_id` trỏ bảng `clients` có RLS).
5. **Quyền Platform có kiểm soát (`runAsPlatform`)**: Chỉ được gọi bởi các đường platform (`AdminDashboardController`, đăng nhập/reset mật khẩu tìm tenant theo email, worker nền), tạm bật `set_config('app.bypass_rls', 'on', true)` và khôi phục giá trị cũ trong khối `finally`.

---

## 3. Lược đồ Cơ sở Dữ liệu PostgreSQL & PostGIS (66 Models)

Nguồn chuẩn duy nhất: [`packages/prisma-schemas/prisma/schema.prisma`](../packages/prisma-schemas/prisma/schema.prisma).

> **Lưu ý tên bảng SQL thực tế**: Model `Tenant` không khai báo `@@map`, nên tên bảng PostgreSQL là `public."Tenant"` (PascalCase). Toàn bộ **65 model còn lại** sử dụng `@@map` dạng snake_case (`orders`, `inventory`, `stock_movements`, ...). Mọi truy vấn SQL thô đều truyền `TEXT` chuẩn (không ép kiểu `::uuid`, cho phép ID kiểu CUID hoặc UUID).

### Nhóm thực thể & Quan hệ cốt lõi (ERD logic)

```mermaid
erDiagram
  Tenant ||--o{ TenantUser : has
  Tenant ||--o{ CustomRole : defines
  Tenant ||--o{ Branch : operates
  Tenant ||--o{ Invoice : billed
  SubscriptionPlan ||--o{ Tenant : plans

  Warehouse ||--o{ Zone : contains
  Zone ||--o{ Rack : contains
  Rack ||--o{ Bin : contains
  Product ||--o{ Inventory : stored_in
  Bin ||--o{ Inventory : holds
  Inventory ||--o{ StockMovement : logs

  Client ||--o{ Order : places
  Order ||--o{ OrderItem : includes
  Order ||--o{ OrderTrackingEvent : tracks
  Order ||--o{ Delivery : fulfilled_by
  Order ||--o{ ReturnRequest : triggers
  ReturnRequest ||--o{ ReturnItem : details
  ReturnRequest ||--o{ ReturnInspection : qc
  ReturnRequest ||--o{ Refund : refunds

  Vehicle ||--o{ Trip : assigned
  Driver ||--o{ Trip : drives
  Trip ||--o{ TripStop : sequences
  Trip ||--o{ Delivery : delivers
  Driver ||--o{ DriverExpense : claims
  Driver ||--o{ CodRemittance : settles
  Driver ||--o{ SosAlert : raises
  Driver ||--o{ GpsTrackingLog : streams
```

### Danh mục đầy đủ 66 Prisma Models phân theo Miền nghiệp vụ

| Miền (Domain) | Số lượng | Danh sách Model (tên bảng PostgreSQL) |
|---|---:|---|
| **Platform, IAM & Config** | 15 | `OutboxEvent` (`outbox_events`), `Tenant` (`"Tenant"`), `SubscriptionPlan` (`subscription_plans`), `SystemAuditLog` (`system_audit_logs`), `SystemAdmin` (`system_admins`), `TenantUser` (`tenant_users`), `CustomRole` (`custom_roles`), `RolePermission` (`role_permissions`), `UserRole` (`user_roles`), `Branch` (`branches`), `TenantApiKey` (`tenant_api_keys`), `FeatureFlag` (`feature_flags`), `SystemSetting` (`system_settings`), `TenantSetting` (`tenant_settings`), `TenantUiConfig` (`tenant_ui_configs`) |
| **WMS (Kho & Đóng gói)** | 15 | `Warehouse` (`warehouses`), `Zone` (`zones`), `Rack` (`racks`), `Bin` (`bins`), `Category` (`categories`), `Product` (`products`), `Inventory` (`inventory`), `StockMovement` (`stock_movements`), `WavePicking` (`wave_picking`), `Task` (`tasks`), `TaskItem` (`task_items`), `CycleCount` (`cycle_counts`), `Adjustment` (`adjustments`), `ScanLog` (`scan_logs`), `PackStationLog` (`pack_station_logs`), `StaffShift` (`staff_shifts`), `EquipmentCheckout` (`equipment_checkout`) *(17 bảng thực tế khi tính cả ca/thiết bị)* |
| **Clients, Orders & RMA** | 11 | `Client` (`clients`), `ClientUser` (`client_users`), `ClientWebhook` (`client_webhooks`), `ClientApiKey` (`client_api_keys`), `Order` (`orders`), `OrderItem` (`order_items`), `OrderTrackingEvent` (`order_tracking_events`), `ReturnReason` (`return_reasons`), `ReturnRequest` (`return_requests`), `ReturnItem` (`return_items`), `ReturnInspection` (`return_inspections`), `Refund` (`refunds`) *(12 model)* |
| **TMS, Fleet, GPS & Geofence** | 10 | `Vehicle` (`vehicles`), `Driver` (`drivers` - có `last_known_location geometry(Point,4326)` + GIST index), `Trip` (`trips`), `TripStop` (`trip_stops`), `Delivery` (`deliveries`), `DriverExpense` (`driver_expenses`), `CodRemittance` (`cod_remittances`), `SosAlert` (`sos_alerts`), `Geofence` (`geofences` - có `polygon geometry(Polygon,4326)` + GIST index), `GpsTrackingLog` (`gps_tracking_logs`) |
| **Billing, Usage & Misc** | 9 | `Invoice` (`invoices`), `InvoiceLineItem` (`invoice_line_items`), `PaymentTransaction` (`payment_transactions`), `ApiUsageDaily` (`api_usage_daily`), `FileAttachment` (`file_attachments`), `ShippingRate` (`shipping_rates`), `Notification` (`notifications`), `NotificationTemplate` (`notification_templates`), `RouteOptimizationJob` (`route_optimization_jobs`) |
| **AI Metadata & Feedback** | 3 | `AiModel` (`ai_models`), `AiFeedback` (`ai_feedbacks`), `DemandForecast` (`demand_forecasts`) |

*(Tổng đối chiếu chính xác: 66 `model` khai báo trong `schema.prisma`, bao gồm `15 + 17 + 12 + 10 + 9 + 3 = 66`.)*

---

## 4. Các Động cơ Lõi & Máy Trạng thái (Core Engines & State Machines)

### 4.1. Transactional Outbox (`OutboxService` & `OutboxDispatcher`)
- **Ghi đồng bộ trong Transaction**: Nghiệp vụ gọi `OutboxService.enqueue(msg, tx)` để lưu vào `outbox_events` cùng lúc với thay đổi bảng nghiệp vụ.
- **Nhận việc an toàn đa instance**: [`OutboxDispatcher`](../backend/core-api/src/core/outbox/outbox-dispatcher.service.ts) chạy chu kỳ 5 giây (`@Cron('*/5 * * * * *')`), khóa lô tối đa 20 bản ghi bằng `FOR UPDATE SKIP LOCKED`.
- **Chiến lược giao phát (At-Least-Once)**: Tối đa 5 lần thử (`MAX_ATTEMPTS = 5`), lùi thời gian lũy thừa `min(300s, 10 * 2^(attempts-1))`. Sau 5 lần lỗi, sự kiện chuyển sang `FAILED` để vận hành xử lý; hệ thống không tự khẳng định *exactly-once*, nên consumer và webhook receiver phải hỗ trợ `idempotencyKey = event.id`.

### 4.2. Động cơ Kho [`packages/wms-engine/src/index.ts`](../packages/wms-engine/src/index.ts)
- **Cấp phát tồn kho (`FIFO`, `FEFO`, `LIFO`)**: Hỗ trợ `allocateWithCapacity` theo dõi trọng lượng và thể tích **cộng dồn còn lại** của từng bin (`remainingCapacityByBin` được trừ ngay sau mỗi dòng hàng cùng bin, khắc phục lỗi tái sử dụng dung lượng bin).
- **Đề xuất cất hàng (`assignPutawayBin`)**: Chuẩn hóa tỷ lệ lấp đầy không thứ nguyên cho hai đại lượng khác đơn vị (`(currentWeight/maxWeight + currentVolume/maxVolume) / 2`), chọn bin khả dụng ít đầy nhất thỏa mãn cả `weightAvailable` lẫn `volumeAvailable`.
- **Gom sóng lấy hàng (`generateWave`)**: Phân cụm đơn hàng theo độ ưu tiên (`priority`) và lô `waveSize`, tự động ánh xạ `sourceBinId` từ `productBinMap` nếu được truyền vào; thời gian ước lượng dùng công thức heuristic tuyến tính `totalItems * 2` phút (không phải tối ưu đường đi TSP trong kho).

### 4.3. Máy Trạng thái Nghiệp vụ

```mermaid
stateDiagram-v2
  state "Order Lifecycle" as O {
    [*] --> PENDING
    PENDING --> CONFIRMED
    CONFIRMED --> PACKED
    PACKED --> DISPATCHED
    DISPATCHED --> IN_TRANSIT
    IN_TRANSIT --> OUT_FOR_DELIVERY
    OUT_FOR_DELIVERY --> DELIVERED
    PENDING --> CANCELLED
    DELIVERED --> RETURN_REQUESTED
    RETURN_REQUESTED --> RETURNED
  }

  state "RMA ReturnRequest" as RMA {
    [*] --> RMA_PENDING: PENDING
    RMA_PENDING --> APPROVED
    RMA_PENDING --> REJECTED
    APPROVED --> PICKUP_SCHEDULED
    PICKUP_SCHEDULED --> PICKED_UP
    PICKED_UP --> INSPECTED
    INSPECTED --> CLOSED: completeReturn (atomic updateMany guard)
    INSPECTED --> REFUNDED: refundReturn (capped by approved items)
  }

  state "COD Remittance" as COD {
    [*] --> COD_PENDING: PENDING
    COD_PENDING --> COD_APPROVED: APPROVED / Driver submit
    COD_APPROVED --> RECONCILED: match qrCodeToken/ref trong $transaction
    COD_PENDING --> COD_REJECTED: REJECTED
  }

  state "Offline SyncAction (Mobile)" as SYNC {
    [*] --> SYNC_PENDING: PENDING
    SYNC_PENDING --> SYNCING
    SYNCING --> COMPLETED: HTTP 2xx + X-Sync-Id
    SYNCING --> SYNC_FAILED: Transient error (retryCount < 5, backoff)
    SYNC_FAILED --> SYNCING: nextAttemptAt reached
    SYNCING --> DEAD_LETTER: 4xx non-408/429 hoặc retryCount >= 5
  }
```
