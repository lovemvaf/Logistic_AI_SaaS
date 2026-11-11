#!/usr/bin/env python3
"""Di chuyển mã nguồn từ các service NestJS sang backend/core-api (3B).

Script này copy file từ service cũ sang core-api và tự động sửa lại các
import tương đối (ví dụ `../prisma/prisma.service`) theo bảng ánh xạ.

Cách dùng:
    python3 scripts/migrate-core.py iam
"""
import os
import re
import shutil
import sys

ALL_SERVICES = [
    'iam-service',
    'inventory-service',
    'order-service',
    'logistics-service',
    'customer-api',
    'notification-service',
]

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
CORE = os.path.join(ROOT, 'backend/core-api/src')

IMPORT_RE = re.compile(r"""(from\s+|import\s+)(['"])(\.[^'"]*)\2""")


def svc(name: str) -> str:
    return os.path.join(ROOT, 'backend', name, 'src')


# --- Ánh xạ nguồn -> đích (tương đối so với src của service / src của core) ---
MAPPING = {
    # --- core ---
    'iam-service|prisma/prisma.service.ts': 'core/prisma/prisma.service.ts',
    'iam-service|prisma/prisma.module.ts': 'core/prisma/prisma.module.ts',
    'iam-service|auth/jwt.strategy.ts': 'core/auth/jwt.strategy.ts',
    'iam-service|auth/google.strategy.ts': 'core/auth/google.strategy.ts',
    'iam-service|auth/jwt-auth.guard.ts': 'core/auth/jwt-auth.guard.ts',
    'iam-service|shared-types.ts': 'core/types/shared-types.ts',
    'iam-service|middleware/tenant.middleware.ts': 'core/tenant/tenant.middleware.ts',
    'iam-service|middleware/logger.middleware.ts': 'core/tenant/logger.middleware.ts',
    'iam-service|middleware/audit-log.interceptor.ts': 'core/tenant/audit-log.interceptor.ts',
    'iam-service|interceptors/request-logging.interceptor.ts': 'core/http/request-logging.interceptor.ts',
    'inventory-service|filters/http-exception.filter.ts': 'core/http/http-exception.filter.ts',
    'iam-service|scripts/schema-provisioner.ts': 'core/provisioner/schema-provisioner.ts',

    # --- module IAM ---
    'iam-service|auth/auth.service.ts': 'modules/iam/auth/auth.service.ts',
    'iam-service|services/mfa.service.ts': 'modules/iam/services/mfa.service.ts',
    'iam-service|payments/stripe.service.ts': 'modules/iam/payments/stripe.service.ts',
    'iam-service|data/tenant-provisioning.ts': 'modules/iam/data/tenant-provisioning.ts',
    'iam-service|scripts/default-roles.ts': 'modules/iam/scripts/default-roles.ts',

    # --- module WMS (inventory-service) ---
    'inventory-service|controllers/adjustments.controller.ts': 'modules/wms/controllers/adjustments.controller.ts',
    'inventory-service|controllers/bins.controller.ts': 'modules/wms/controllers/bins.controller.ts',
    'inventory-service|controllers/cycle-counts.controller.ts': 'modules/wms/controllers/cycle-counts.controller.ts',
    'inventory-service|controllers/inventory.controller.ts': 'modules/wms/controllers/inventory.controller.ts',
    'inventory-service|controllers/inventory.service.ts': 'modules/wms/services/inventory.service.ts',
    'inventory-service|controllers/mobile.controller.ts': 'modules/wms/controllers/mobile.controller.ts',
    'inventory-service|controllers/products.controller.ts': 'modules/wms/controllers/products.controller.ts',
    'inventory-service|controllers/warehouse-ops.controller.ts': 'modules/wms/controllers/warehouse-ops.controller.ts',
    'inventory-service|locations/locations.controller.ts': 'modules/wms/locations/locations.controller.ts',
    'inventory-service|tasks/tasks.controller.ts': 'modules/wms/tasks/tasks.controller.ts',
    'inventory-service|warehouses/branches.controller.ts': 'modules/wms/warehouses/branches.controller.ts',
    'inventory-service|warehouses/warehouses.controller.ts': 'modules/wms/warehouses/warehouses.controller.ts',
    'inventory-service|waves/waves.controller.ts': 'modules/wms/waves/waves.controller.ts',
    'inventory-service|waves/waves.service.ts': 'modules/wms/waves/waves.service.ts',

    # --- module Orders (order-service) ---
    'order-service|controllers/orders.controller.ts': 'modules/orders/controllers/orders.controller.ts',
    'order-service|controllers/returns.controller.ts': 'modules/orders/controllers/returns.controller.ts',
    'order-service|controllers/bulk-upload.controller.ts': 'modules/orders/controllers/bulk-upload.controller.ts',
    'order-service|dtos/bulk-upload.dto.ts': 'modules/orders/dtos/bulk-upload.dto.ts',
    'order-service|dtos/create-order.dto.ts': 'modules/orders/dtos/create-order.dto.ts',
    'order-service|clients/clients.controller.ts': 'modules/orders/clients/clients.controller.ts',
    'order-service|tracking/tracking.controller.ts': 'modules/orders/tracking/tracking.controller.ts',
    'order-service|webhooks/webhooks.controller.ts': 'modules/orders/webhooks/webhooks.controller.ts',
    'order-service|services/kafka-event.service.ts': 'modules/orders/services/kafka-event.service.ts',
    'order-service|auth/auth.controller.ts': 'modules/orders/auth/auth.controller.ts',

    # --- module Logistics (logistics-service) ---
    'logistics-service|controllers/ai-management.controller.ts': 'modules/logistics/controllers/ai-management.controller.ts',
    'logistics-service|controllers/ai-models.controller.ts': 'modules/logistics/controllers/ai-models.controller.ts',
    'logistics-service|controllers/cod-remittances.controller.ts': 'modules/logistics/controllers/cod-remittances.controller.ts',
    'logistics-service|controllers/finance.controller.ts': 'modules/logistics/controllers/finance.controller.ts',
    'logistics-service|controllers/logistics.controller.ts': 'modules/logistics/controllers/logistics.controller.ts',
    'logistics-service|controllers/mobile-gps.controller.ts': 'modules/logistics/controllers/mobile-gps.controller.ts',
    'logistics-service|controllers/mobile-wallet.controller.ts': 'modules/logistics/controllers/mobile-wallet.controller.ts',
    'logistics-service|controllers/returns.controller.ts': 'modules/logistics/controllers/returns.controller.ts',
    'logistics-service|controllers/upload.controller.ts': 'modules/logistics/controllers/upload.controller.ts',
    'logistics-service|driver-app/driver-app.controller.ts': 'modules/logistics/driver-app/driver-app.controller.ts',
    'logistics-service|dtos/create-geofence.dto.ts': 'modules/logistics/dtos/create-geofence.dto.ts',
    'logistics-service|dtos/dispatch-trip.dto.ts': 'modules/logistics/dtos/dispatch-trip.dto.ts',
    'logistics-service|dtos/mobile.dto.ts': 'modules/logistics/dtos/mobile.dto.ts',
    'logistics-service|dtos/optimize-routing.dto.ts': 'modules/logistics/dtos/optimize-routing.dto.ts',
    'logistics-service|fleet/drivers.controller.ts': 'modules/logistics/fleet/drivers.controller.ts',
    'logistics-service|fleet/vehicles.controller.ts': 'modules/logistics/fleet/vehicles.controller.ts',
    'logistics-service|processors/routing.processor.ts': 'modules/logistics/processors/routing.processor.ts',
    'logistics-service|services/geocoding.service.ts': 'modules/logistics/services/geocoding.service.ts',
    'logistics-service|services/logistics.service.ts': 'modules/logistics/services/logistics.service.ts',
    'logistics-service|services/s3.service.ts': 'modules/logistics/services/s3.service.ts',
    'logistics-service|tracking/geofences.controller.ts': 'modules/logistics/tracking/geofences.controller.ts',
    'logistics-service|tracking/gps.controller.ts': 'modules/logistics/tracking/gps.controller.ts',
    'logistics-service|trips/mobile-trips.controller.ts': 'modules/logistics/trips/mobile-trips.controller.ts',
    'logistics-service|trips/trips.controller.ts': 'modules/logistics/trips/trips.controller.ts',

    # --- module Customer (customer-api) ---
    'customer-api|controllers/client-inventory.controller.ts': 'modules/customer/controllers/client-inventory.controller.ts',
    'customer-api|controllers/client-invoices.controller.ts': 'modules/customer/controllers/client-invoices.controller.ts',
    'customer-api|controllers/client-orders.controller.ts': 'modules/customer/controllers/client-orders.controller.ts',
    'customer-api|controllers/client-returns.controller.ts': 'modules/customer/controllers/client-returns.controller.ts',
    'customer-api|controllers/client-webhooks.controller.ts': 'modules/customer/controllers/client-webhooks.controller.ts',
    'customer-api|controllers/public-tracking.controller.ts': 'modules/customer/controllers/public-tracking.controller.ts',
    'customer-api|dtos/client-bulk-upload.dto.ts': 'modules/customer/dtos/client-bulk-upload.dto.ts',
    'customer-api|dtos/client-order-create.dto.ts': 'modules/customer/dtos/client-order-create.dto.ts',
    'customer-api|dtos/feedback.dto.ts': 'modules/customer/dtos/feedback.dto.ts',
    'customer-api|dtos/invoice-pay.dto.ts': 'modules/customer/dtos/invoice-pay.dto.ts',
    'customer-api|dtos/order.dto.ts': 'modules/customer/dtos/order.dto.ts',
    'customer-api|dtos/verify-tracking.dto.ts': 'modules/customer/dtos/verify-tracking.dto.ts',
    'customer-api|dtos/webhook-create.dto.ts': 'modules/customer/dtos/webhook-create.dto.ts',

    # --- module Notification (notification-service) ---
    'notification-service|controllers/event.controller.ts': 'modules/notification/controllers/event.controller.ts',
    'notification-service|controllers/notifications.controller.ts': 'modules/notification/controllers/notifications.controller.ts',
    'notification-service|dtos/notify-email.dto.ts': 'modules/notification/dtos/notify-email.dto.ts',
    'notification-service|dtos/notify-push.dto.ts': 'modules/notification/dtos/notify-push.dto.ts',
    'notification-service|dtos/notify-sms.dto.ts': 'modules/notification/dtos/notify-sms.dto.ts',
    'notification-service|gateways/notification.gateway.ts': 'modules/notification/gateways/notification.gateway.ts',
    'notification-service|providers/email.provider.ts': 'modules/notification/providers/email.provider.ts',
    'notification-service|providers/fcm-push.provider.ts': 'modules/notification/providers/fcm-push.provider.ts',
    'notification-service|providers/provider.factory.ts': 'modules/notification/providers/provider.factory.ts',
    'notification-service|providers/push.provider.ts': 'modules/notification/providers/push.provider.ts',
    'notification-service|providers/sendgrid-email.provider.ts': 'modules/notification/providers/sendgrid-email.provider.ts',
    'notification-service|providers/sms.provider.ts': 'modules/notification/providers/sms.provider.ts',
    'notification-service|providers/twilio-sms.provider.ts': 'modules/notification/providers/twilio-sms.provider.ts',
    'notification-service|services/notification.service.ts': 'modules/notification/services/notification.service.ts',
    'notification-service|services/tasks.service.ts': 'modules/notification/services/tasks.service.ts',
    'notification-service|prisma/event-prisma.service.ts': 'modules/notification/prisma/event-prisma.service.ts',
}

# Thư mục được copy nguyên cả (giữ nguyên cấu trúc bên trong).
DIRS = {
    'iam-service|controllers': 'modules/iam/controllers',
    'iam-service|dtos': 'modules/iam/dtos',
}

# Hạ tầng dùng chung: file của service cŽ được resolve về bản trong core
# (dùng để sửa import, không copy lần nữa).
# Service cũ dùng lại implementation của service khác (chỉ để sửa import).
SERVICE_ALIASES = {
    'order-service|auth/auth.service.ts': 'modules/iam/auth/auth.service.ts',
    'logistics-service|auth/auth.service.ts': 'modules/iam/auth/auth.service.ts',
    'customer-api|auth/auth.service.ts': 'modules/iam/auth/auth.service.ts',
}

CORE_FILES = {
    'auth/jwt-auth.guard.ts': 'core/auth/jwt-auth.guard.ts',
    'auth/jwt.strategy.ts': 'core/auth/jwt.strategy.ts',
    'prisma/prisma.service.ts': 'core/prisma/prisma.service.ts',
    'prisma/prisma.module.ts': 'core/prisma/prisma.module.ts',
    'middleware/tenant.middleware.ts': 'core/tenant/tenant.middleware.ts',
    'middleware/audit-log.interceptor.ts': 'core/tenant/audit-log.interceptor.ts',
    'interceptors/request-logging.interceptor.ts': 'core/http/request-logging.interceptor.ts',
    'filters/http-exception.filter.ts': 'core/http/http-exception.filter.ts',
    'shared-types.ts': 'core/types/shared-types.ts',
}


def rel_to_service(service: str, path: str) -> str:
    return os.path.relpath(path, svc(service)).replace(os.sep, '/')


def collect():
    """Trả về (danh sách file cần copy, bảng resolve import)."""
    to_copy = {}
    for key, dest in MAPPING.items():
        service, rel = key.split('|', 1)
        to_copy[(service, rel)] = dest
    for key, dest in DIRS.items():
        service, reldir = key.split('|', 1)
        src_dir = os.path.join(svc(service), reldir)
        for name in sorted(os.listdir(src_dir)):
            if name.endswith('.ts'):
                to_copy[(service, f'{reldir}/{name}')] = f'{dest}/{name}'

    resolve = dict(to_copy)
    # Hạ tầng dùng chung: resolve về bản trong core.
    for service in ALL_SERVICES:
        for rel, dest in CORE_FILES.items():
            resolve.setdefault((service, rel), dest)
    # Service cũ dùng lại implementation của service khác.
    for key, dest in SERVICE_ALIASES.items():
        service, rel = key.split('|', 1)
        resolve.setdefault((service, rel), dest)
    return to_copy, resolve


def rewrite_imports(content: str, service: str, old_rel: str, new_rel: str, table: dict) -> str:
    old_dir = os.path.dirname(old_rel)
    new_dir = os.path.dirname(new_rel)

    def repl(match: 're.Match[str]') -> str:
        keyword, quote, spec = match.group(1), match.group(2), match.group(3)
        if not spec.startswith('.'):
            return match.group(0)
        target = os.path.normpath(os.path.join(old_dir, spec)).replace(os.sep, '/')
        # Thử khớp chính xác, rồi thử khớp với đuôi .ts / index.ts.
        candidates = [target, f'{target}.ts', f'{target}/index.ts']
        new_target = None
        for cand in candidates:
            for (s, r), dest in table.items():
                if s == service and r == cand:
                    new_target = dest
                    break
            if new_target:
                break
        if not new_target:
            return match.group(0)
        if new_target.endswith('.ts'):
            new_target = new_target[:-3]
        new_spec = os.path.relpath(new_target, new_dir).replace(os.sep, '/')
        if not new_spec.startswith('.'):
            new_spec = f'./{new_spec}'
        return f'{keyword}{quote}{new_spec}{quote}'

    return IMPORT_RE.sub(repl, content)


# Chỉnh sửa sau khi copy: các thay đổi phải tồn tại qua mọi lần chạy lại script.
FIXUPS = {
    # Provisioner: đường dẫn tìm schema.prisma phải cover cả dev lẫn docker.
    'core/provisioner/schema-provisioner.ts': [
        (
            "    // Resolve the schema path flexibly depending on run context (dev vs dist).\n"
            "    let schemaPath = path.join(\n"
            "      __dirname,\n"
            "      '../../../../../packages/prisma-schemas/prisma/schema.prisma',\n"
            "    );\n"
            "    if (!fs.existsSync(schemaPath)) {\n"
            "      schemaPath = path.join(process.cwd(), '../../packages/prisma-schemas/prisma/schema.prisma');\n"
            "    }\n"
            "    if (!fs.existsSync(schemaPath)) {\n"
            "      schemaPath = path.join(process.cwd(), 'packages/prisma-schemas/prisma/schema.prisma');\n"
            "    }\n"
            "    if (!fs.existsSync(schemaPath)) {\n"
            "      throw new Error(`Prisma schema not found (looked for ${schemaPath})`);\n"
            "    }",
            "    // Resolve the schema path flexibly depending on run context:\n"
            "    //   - dev (ts-node): <repo>/packages/prisma-schemas/prisma/schema.prisma\n"
            "    //   - build (dist):  cung duong dan, tinh tu file da compile\n"
            "    //   - docker:        /app/prisma/schema.prisma (Dockerfile copy vao)\n"
            "    const candidates = [\n"
            "      path.join(__dirname, '../../../../../packages/prisma-schemas/prisma/schema.prisma'),\n"
            "      path.join(__dirname, '../../../../../../packages/prisma-schemas/prisma/schema.prisma'),\n"
            "      path.join(process.cwd(), 'packages/prisma-schemas/prisma/schema.prisma'),\n"
            "      path.join(process.cwd(), '../../packages/prisma-schemas/prisma/schema.prisma'),\n"
            "      path.join(process.cwd(), 'prisma/schema.prisma'),\n"
            "    ];\n"
            "    const schemaPath = candidates.find((candidate) => fs.existsSync(candidate));\n"
            "    if (!schemaPath) {\n"
            "      throw new Error(\n"
            "        `Prisma schema not found (looked in: ${candidates.join(', ')})`,\n"
            "      );\n"
            "    }",
        ),
    ],
    # Prisma thêm comment `-- CreateTable` vào đầu statement -> regex phải
    # không neo `^` để tìm được câu CREATE TABLE.
    'core/provisioner/schema-provisioner.ts': [
        (
            "        const match = statement.match(/^CREATE TABLE \"([^\"]+)\"/);",
            "        // Prisma thêm comment `-- CreateTable` ở đầu mỗi statement nên không\n"
            "        // được neo `^CREATE TABLE` - statement phải bắt đầu bằng comment.\n"
            "        const match = statement.match(/CREATE TABLE \"([^\"]+)\"/);",
        ),
    ],
    # `auth.controller.ts` của order-service không dùng AuthService (chỉ dùng
    # JwtService để đổi refresh token) => bỏ dependency không cần thiết.
    'modules/orders/auth/auth.controller.ts': [
        ("import { AuthService } from '../../iam/auth/auth.service';\n", ''),
        (
            "  constructor(\n"
            "    private readonly authService: AuthService,\n"
            "    private readonly jwtService: JwtService,\n"
            "  ) {}",
            "  constructor(private readonly jwtService: JwtService) {}",
        ),
    ],
}


def apply_fixups(dest_rel: str, content: str) -> str:
    for old, new in FIXUPS.get(dest_rel, []):
        old = old.encode().decode('unicode_escape')
        new = new.encode().decode('unicode_escape')
        content = content.replace(old, new)
    return content


def main() -> int:
    to_copy, table = collect()
    copied = 0
    for (service, old_rel), new_rel in sorted(to_copy.items()):
        src = os.path.join(svc(service), old_rel)
        dest = os.path.join(CORE, new_rel)
        if not os.path.exists(src):
            print(f'MISSING {src}')
            continue
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        with open(src, encoding='utf-8') as fh:
            content = fh.read()
        content = rewrite_imports(content, service, old_rel, new_rel, table)
        content = apply_fixups(new_rel, content)
        with open(dest, 'w', encoding='utf-8') as fh:
            fh.write(content)
        copied += 1
    print(f'copied {copied} files')
    return 0


if __name__ == '__main__':
    sys.exit(main())
