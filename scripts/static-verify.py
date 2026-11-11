#!/usr/bin/env python3
"""
Cross-platform static invariant & documentation verifier for SmartLogi AI SaaS.

Runs purely on Python 3 stdlib (no Node, Go, Rust, Docker, or DB runtime needed)
so both local environments and CI catch regressions in RBAC boundaries, SQL/RLS
safety, NestJS route ordering, Gateway-to-portal routing parity, CSV formula
sanitization, honest AI/CV fallbacks, and documentation/traceability integrity.

Usage:
  python3 -X utf8 scripts/static-verify.py            # full verification (default in CI)
  python3 -X utf8 scripts/static-verify.py --code-only # code/tests/CI checks only
"""

from __future__ import annotations

import argparse
import csv
import pathlib
import re
import sys
from typing import Callable, List, Tuple

REPO_ROOT = pathlib.Path(__file__).resolve().parents[1]

EXPECTED_TESTS = [
    "api/api-gateway/src/config/services.config.spec.ts",
    "api/api-gateway/src/controllers/health.controller.spec.ts",
    "api/api-gateway/src/guards/jwt.gateway.guard.spec.ts",
    "backend/core-api/src/modules/iam/__tests__/rbac-boundary.spec.ts",
    "backend/core-api/src/modules/iam/__tests__/tenant-isolation.spec.ts",
    "backend/core-api/src/modules/logistics/__tests__/cod-reconcile.spec.ts",
    "backend/core-api/src/modules/wms/__tests__/wms-concurrency.spec.ts",
    "backend/gps-ingestion-service/main_test.go",
    "backend/webhook-service/main_test.go",
    "packages/prisma-schemas/prisma/tests/tenant-isolation.sql",
    "packages/wms-engine/src/index.spec.ts",
    "workers/ai-worker/tests/compute.test.ts",
    "workers/ai-worker/tests/journey.test.ts",
    "workers/ai-worker/tests/llm.test.ts",
    "workers/ai-worker/tests/vrp.test.ts",
]

INTERNAL_CLIENT_EXCLUDED_CONTROLLERS = {
    "iam/controllers/api-keys.controller.ts",
    "iam/controllers/branches.controller.ts",
    "iam/controllers/feature-flags.controller.ts",
    "iam/controllers/iam-portal-aliases.controller.ts",
    "iam/controllers/tenant-audit-logs.controller.ts",
    "iam/controllers/tenant-billing.controller.ts",
    "iam/controllers/tenant-dashboard.controller.ts",
    "iam/controllers/tenant-roles.controller.ts",
    "iam/controllers/tenant-settings.controller.ts",
    "iam/controllers/tenant-users.controller.ts",
    "logistics/controllers/ai-management.controller.ts",
    "logistics/controllers/ai-models.controller.ts",
    "logistics/controllers/cod-remittances.controller.ts",
    "logistics/controllers/finance.controller.ts",
    "logistics/controllers/logistics-portal-aliases.controller.ts",
    "logistics/controllers/logistics.controller.ts",
    "logistics/controllers/mobile-gps.controller.ts",
    "logistics/controllers/mobile-wallet.controller.ts",
    "logistics/controllers/returns.controller.ts",
    "logistics/controllers/upload.controller.ts",
    "logistics/driver-app/driver-app.controller.ts",
    "logistics/fleet/drivers.controller.ts",
    "logistics/fleet/vehicles.controller.ts",
    "logistics/tracking/geofences.controller.ts",
    "logistics/tracking/gps.controller.ts",
    "logistics/trips/mobile-trips.controller.ts",
    "logistics/trips/trips.controller.ts",
    "notification/controllers/notifications.controller.ts",
    "orders/clients/clients.controller.ts",
    "orders/controllers/bulk-upload.controller.ts",
    "orders/controllers/orders-portal-aliases.controller.ts",
    "orders/controllers/orders.controller.ts",
    "orders/controllers/returns.controller.ts",
    "orders/tracking/tracking.controller.ts",
    "orders/webhooks/webhooks.controller.ts",
    "wms/controllers/adjustments.controller.ts",
    "wms/controllers/bins.controller.ts",
    "wms/controllers/cycle-counts.controller.ts",
    "wms/controllers/inventory.controller.ts",
    "wms/controllers/mobile.controller.ts",
    "wms/controllers/products.controller.ts",
    "wms/controllers/warehouse-ops.controller.ts",
    "wms/controllers/wms-portal-aliases.controller.ts",
    "wms/locations/locations.controller.ts",
    "wms/tasks/tasks.controller.ts",
    "wms/warehouses/branches.controller.ts",
    "wms/warehouses/warehouses.controller.ts",
    "wms/waves/waves.controller.ts",
}

REQUIRED_DOCS = [
    "docs/README.md",
    "docs/Chi_Tiet_Kien_Truc_Va_Chuc_Nang.md",
    "docs/Tien_Do_Va_Do_Hoan_Thien_Chi_Tiet.md",
    "docs/architecture-and-erd.md",
    "docs/api-contracts.md",
    "docs/operations-runbook.md",
    "docs/ai-model-cards.md",
    "docs/role-guides.md",
    "docs/ho-so-cap-nhat-B3-B4.md",
    "docs/upgrade/coverage.csv",
    "docs/upgrade/decisions.md",
    "docs/upgrade/handoff.md",
    "docs/upgrade/plan.md",
    "docs/upgrade/tool-inventory.md",
    "docs/upgrade/verification.md",
]


def read_text(rel: str) -> str:
    return (REPO_ROOT / rel).read_text(encoding="utf-8", errors="strict")


def strip_c_comments(text: str) -> str:
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    text = re.sub(r"//[^\n]*", "", text)
    return text


def strip_sql_comments(text: str) -> str:
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    text = re.sub(r"--[^\n]*", "", text)
    return text


def check_core_files_and_tests() -> List[str]:
    errs: List[str] = []
    required = [
        ".github/workflows/ci.yml",
        "packages/prisma-schemas/prisma/schema.prisma",
        "packages/prisma-schemas/prisma/migrations/20261111000000_harden_tenant_rls_and_audit/migration.sql",
        "packages/shared-types/src/guards/permissions.guard.ts",
        "packages/shared-types/src/role-permission-map.ts",
        "backend/core-api/src/core/prisma/prisma.service.ts",
        "api/api-gateway/src/config/services.config.ts",
        *EXPECTED_TESTS,
    ]
    for rel in required:
        if not (REPO_ROOT / rel).is_file():
            errs.append(f"Missing required file: {rel}")
    return errs


def check_no_uuid_casts() -> List[str]:
    errs: List[str] = []
    scan_roots = ["backend", "api", "packages", "workers"]
    for sub in scan_roots:
        base = REPO_ROOT / sub
        if not base.exists():
            continue
        for p in sorted(base.rglob("*")):
            if not p.is_file() or any(x in p.parts for x in ("node_modules", ".next", "dist", "target")):
                continue
            if p.suffix not in {".ts", ".tsx", ".js", ".go", ".rs", ".sql"}:
                continue
            raw = p.read_text(encoding="utf-8", errors="replace")
            cleaned = strip_sql_comments(raw) if p.suffix == ".sql" else strip_c_comments(raw)
            for idx, line in enumerate(cleaned.splitlines(), 1):
                if re.search(r"::uuid\b", line):
                    errs.append(f"Executable ::uuid cast found at {p.relative_to(REPO_ROOT).as_posix()}:{idx}")
    return errs


def check_rls_and_prisma_service() -> List[str]:
    errs: List[str] = []
    ps = read_text("backend/core-api/src/core/prisma/prisma.service.ts")
    for token in ("assertSchemaName", "app.tenant_id", "app.bypass_rls", "set_config"):
        if token not in ps:
            errs.append(f"prisma.service.ts missing required isolation primitive: {token}")

    mig = read_text(
        "packages/prisma-schemas/prisma/migrations/20261111000000_harden_tenant_rls_and_audit/migration.sql"
    )
    for tbl in (
        "invoices",
        "payment_transactions",
        "tenant_api_keys",
        "feature_flags",
        "tenant_settings",
        "api_usage_daily",
        "tenant_ui_configs",
    ):
        if tbl not in mig:
            errs.append(f"Hardened RLS migration missing table {tbl}")
    for clause in ("ENABLE ROW LEVEL SECURITY", "FORCE ROW LEVEL SECURITY"):
        if clause not in mig:
            errs.append(f"Hardened RLS migration missing clause: {clause}")

    sql_test = read_text("packages/prisma-schemas/prisma/tests/tenant-isolation.sql")
    for check_tok in ("FORCE ROW LEVEL SECURITY", "insufficient_privilege", "app.tenant_id", "app.bypass_rls"):
        if check_tok not in sql_test:
            errs.append(f"tenant-isolation.sql missing verification step: {check_tok}")
    return errs


def check_rbac_and_nestjs_route_ordering() -> List[str]:
    errs: List[str] = []
    mod_root = REPO_ROOT / "backend" / "core-api" / "src" / "modules"

    # 1. Admin controllers must require SUPER_ADMIN (except admin-auth)
    for p in sorted((mod_root / "iam" / "controllers").glob("admin-*.controller.ts")):
        if p.name == "admin-auth.controller.ts":
            continue
        t = strip_c_comments(p.read_text(encoding="utf-8"))
        if "@RequireRoles(Roles.SUPER_ADMIN)" not in t:
            errs.append(f"Admin controller missing @RequireRoles(Roles.SUPER_ADMIN): {p.name}")

    # 2. Internal controllers must exclude CUSTOMER_CLIENT
    for rel in sorted(INTERNAL_CLIENT_EXCLUDED_CONTROLLERS):
        p = mod_root / rel
        if not p.is_file():
            errs.append(f"Expected controller missing: {rel}")
            continue
        t = strip_c_comments(p.read_text(encoding="utf-8"))
        if not re.search(r"@ExcludeRoles\([^)]*Roles\.CUSTOMER_CLIENT", t):
            errs.append(f"Internal controller missing @ExcludeRoles(Roles.CUSTOMER_CLIENT): {rel}")

    # 3. Verify role-permission-map least privilege
    rpm = strip_c_comments(read_text("packages/shared-types/src/role-permission-map.ts"))
    for mgr_role in ("WAREHOUSE_MANAGER", "LOGISTICS_MANAGER"):
        m = re.search(rf"\[Roles\.{mgr_role}\]\s*:\s*\[(.*?)\]", rpm, flags=re.S)
        if not m:
            errs.append(f"RolePermissionMap missing entry for {mgr_role}")
        elif "Permissions.BillingManage" in m.group(1):
            errs.append(f"Privilege escalation in RolePermissionMap: {mgr_role} must not have BillingManage")

    client_m = re.search(r"\[Roles\.CUSTOMER_CLIENT\]\s*:\s*\[(.*?)\]", rpm, flags=re.S)
    if not client_m:
        errs.append("RolePermissionMap missing entry for CUSTOMER_CLIENT")
    else:
        for forbidden in ("MobileGpsBatch", "DriversManage", "BillingManage", "TenantsManage", "RolesManage"):
            if forbidden in client_m.group(1):
                errs.append(f"CUSTOMER_CLIENT must not grant {forbidden}")

    # 4. Verify no parameterized NestJS route shadows a later static route on the same controller+method
    for p in sorted(mod_root.rglob("*.controller.ts")):
        text = strip_c_comments(p.read_text(encoding="utf-8"))
        parts = re.split(r"(?=@Controller\()", text)
        for part in parts:
            if not part.startswith("@Controller("):
                continue
            routes = re.findall(r'@(Get|Post|Patch|Put|Delete)\(\s*(?:[\'"]([^\'"]*)[\'"])?\s*\)', part)
            by_method: dict[str, list[str]] = {}
            for method, route in routes:
                by_method.setdefault(method, []).append(route)
            for method, rlist in by_method.items():
                for i in range(len(rlist)):
                    segs_i = [s for s in rlist[i].split("/") if s]
                    if not segs_i:
                        continue
                    for j in range(i + 1, len(rlist)):
                        segs_j = [s for s in rlist[j].split("/") if s]
                        if len(segs_i) != len(segs_j):
                            continue
                        shadows = True
                        more_generic = False
                        for si, sj in zip(segs_i, segs_j):
                            if si == sj:
                                continue
                            if si.startswith(":") and not sj.startswith(":"):
                                more_generic = True
                                continue
                            shadows = False
                            break
                        if shadows and more_generic:
                            errs.append(
                                f"Route shadowing in {p.relative_to(REPO_ROOT).as_posix()}: "
                                f"@{method}('{rlist[i]}') precedes @{method}('{rlist[j]}')"
                            )
    return errs


def check_gateway_portal_route_parity() -> List[str]:
    errs: List[str] = []
    svc_cfg = read_text("api/api-gateway/src/config/services.config.ts")
    prefixes = re.findall(r"prefix:\s*'([^']+)'", svc_cfg)
    if not prefixes:
        return ["Could not parse ROUTE_RULES prefixes in services.config.ts"]

    def matches(api_path: str) -> bool:
        clean = api_path.split("?")[0]
        if not clean.startswith("/api/v1"):
            clean = "/api/v1" + (clean if clean.startswith("/") else "/" + clean)
        return any(clean == pre or clean.startswith(pre + "/") for pre in prefixes)

    targets = [
        "frontend/feature-test/admin-portal/src",
        "frontend/reporting/tenant-portal/src",
        "frontend/reporting/customer-portal/src",
        "frontend/reporting/pack-station-web/src",
        "frontend/mobile/driver-app/src",
    ]
    call_re = re.compile(
        r"(?:\b(?:api|client|axiosInstance)\.(?:get|post|put|patch|delete)|\b(?:get|post|put|patch|del)\s*\()\s*(?:<[^>]+>)?\s*(['\"`])(/[^'\"`]+)\1"
    )
    req_re = re.compile(r"request\(\s*'(?:GET|POST|PUT|PATCH|DELETE)'\s*,\s*(['\"`])(/[^'\"`]+)\1")

    for sub in targets:
        base = REPO_ROOT / sub
        for f in sorted(base.rglob("*.ts*")):
            t = f.read_text(encoding="utf-8")
            for _, path in call_re.findall(t) + req_re.findall(t):
                if not matches(path):
                    errs.append(f"Unrouted portal API call {path} in {f.relative_to(REPO_ROOT).as_posix()}")
    return errs


def check_frontend_invariants() -> List[str]:
    errs: List[str] = []
    portals = [
        "frontend/feature-test/admin-portal/src",
        "frontend/reporting/tenant-portal/src",
        "frontend/reporting/customer-portal/src",
        "frontend/reporting/pack-station-web/src",
    ]
    for sub in portals:
        found = any(
            "NEXT_PUBLIC_DATA_SOURCE" in p.read_text(encoding="utf-8")
            for p in (REPO_ROOT / sub).rglob("*.ts*")
        )
        if not found:
            errs.append(f"Portal missing NEXT_PUBLIC_DATA_SOURCE mode gate: {sub}")

    # Zero decorative emojis in frontend UI files
    emoji_re = re.compile(r"[\U0001F300-\U0001FAFF\u2600-\u27BF]")
    for p in sorted((REPO_ROOT / "frontend").rglob("*.ts*")):
        if any(x in p.parts for x in ("node_modules", ".next", "dist")):
            continue
        t = p.read_text(encoding="utf-8", errors="replace")
        if emoji_re.search(t):
            errs.append(f"Decorative emoji found in {p.relative_to(REPO_ROOT).as_posix()}")

    # Admin portal: no silent catch fallback into local-store functions
    for p in sorted((REPO_ROOT / "frontend/feature-test/admin-portal/src/app").rglob("*.tsx")):
        t = strip_c_comments(p.read_text(encoding="utf-8"))
        for m in re.finditer(r"catch\s*(?:\([^)]*\))?\s*\{([^}]{0,600})\}", t, flags=re.S):
            body = m.group(1)
            if re.search(r"\b(?:getAll|getOne|SEED_DATA)\s*\(", body) and "isMockDataSource" not in body:
                errs.append(
                    f"Potential silent mock fallback in catch block: {p.relative_to(REPO_ROOT).as_posix()}"
                )

    # CSV exports must sanitize CWE-1236 formula prefixes & revoke ObjectURL where used
    csv_files = [
        ("frontend/feature-test/admin-portal/src/app/admin/audit-logs/page.tsx", True),
        ("frontend/feature-test/admin-portal/src/app/admin/billing/page.tsx", True),
        ("frontend/feature-test/admin-portal/src/app/admin/orders/upload/page.tsx", False),
        ("frontend/reporting/tenant-portal/src/app/inventory/page.tsx", True),
        ("frontend/reporting/tenant-portal/src/app/wms/products/page.tsx", True),
    ]
    for rel, needs_revoke in csv_files:
        t = read_text(rel)
        if "=+-@" not in t and "=+" not in t:
            errs.append(f"CSV formula injection guard missing in {rel}")
        if '.replace(/"/g' not in t:
            errs.append(f"CSV quote escaping missing in {rel}")
        if needs_revoke and "URL.revokeObjectURL" not in t:
            errs.append(f"CSV download misses URL.revokeObjectURL cleanup in {rel}")
        if "data:text/csv" in t:
            errs.append(f"Unsafe unescaped data:text/csv URI remains in {rel}")

    # driver-app checks: no top-level await & no unguarded browser alert()
    for p in sorted((REPO_ROOT / "frontend/mobile/driver-app/src").rglob("*.ts*")):
        t = strip_c_comments(p.read_text(encoding="utf-8"))
        for idx, line in enumerate(t.splitlines(), 1):
            if re.match(r"^await\s+", line):
                errs.append(f"Top-level await in driver-app: {p.relative_to(REPO_ROOT).as_posix()}:{idx}")
            if re.search(r"(?<!Alert\.)\balert\s*\(", line):
                errs.append(f"Browser alert() call in driver-app: {p.relative_to(REPO_ROOT).as_posix()}:{idx}")

    return errs


def check_ai_cv_go_rust_invariants() -> List[str]:
    errs: List[str] = []

    vrp = read_text("workers/ai-worker/src/lib/vrp.ts")
    if "haversine_circuity_1.41" not in vrp:
        errs.append("ai-worker vrp.ts missing distance_source disclosure 'haversine_circuity_1.41'")

    compute = read_text("workers/ai-worker/src/routes/compute.ts")
    for tok in ("unmeasured", "min_recommended_samples", "deterministic_heuristic_fallback"):
        if tok not in compute:
            errs.append(f"ai-worker compute.ts missing honest ML contract token: {tok}")

    admin_ai = read_text("workers/ai-worker/src/routes/admin.ts")
    for tok in ("TRAINING_NOT_IMPLEMENTED", "501", "/v1/training-dataset"):
        if tok not in admin_ai:
            errs.append(f"ai-worker admin.ts missing honest ML contract token: {tok}")
    if "0.86" in admin_ai:
        errs.append("ai-worker admin.ts still contains hardcoded 0.86 accuracy constant")

    ai_db = read_text("workers/ai-worker/src/lib/db.ts")
    if "human_corrected IS NOT NULL" not in ai_db:
        errs.append("ai-worker lib/db.ts missing human_corrected IS NOT NULL filter on dataset export")

    ai_index = read_text("workers/ai-worker/src/index.ts")
    if "0.86" in ai_index:
        errs.append("ai-worker index.ts still contains hardcoded 0.86 accuracy seed")

    llm = read_text("workers/ai-worker/src/lib/llm.ts")
    if "wrapUntrustedData" not in llm:
        errs.append("ai-worker llm.ts missing prompt injection wrapper wrapUntrustedData")

    cv_mapper = read_text("frontend/reporting/pack-station-web/src/lib/cv-mapper.ts")
    if "CV_CONFIDENCE_THRESHOLD = 0.6" not in cv_mapper:
        errs.append("pack-station-web cv-mapper.ts missing CV_CONFIDENCE_THRESHOLD = 0.6")

    gps_go = read_text("backend/gps-ingestion-service/main.go")
    for tok in ("verifyUDPPacket", "constantTimeBearerMatch", "isValidSchemaName", "isValidGPSPoint"):
        if tok not in gps_go:
            errs.append(f"gps-ingestion-service main.go missing guard function: {tok}")

    wh_go = read_text("backend/webhook-service/main.go")
    for tok in ("isRestrictedIP", "validateWebhookURL", "maskSecret"):
        if tok not in wh_go:
            errs.append(f"webhook-service main.go missing guard function: {tok}")

    for rust_rel in (
        "backend/rust-api/crates/api/src/routes/meta.rs",
        "backend/rust-api/crates/api/src/routes/ai.rs",
    ):
        if not (REPO_ROOT / rust_rel).is_file():
            errs.append(f"Missing rust-api file: {rust_rel}")

    return errs


def check_ci_and_docs() -> List[str]:
    errs: List[str] = []

    ci = read_text(".github/workflows/ci.yml")
    for job in ("static-verify:", "node-workspace:", "ai-worker:", "go-services:", "rust-api:", "postgres-rls:"):
        if job not in ci:
            errs.append(f".github/workflows/ci.yml missing job: {job}")

    for rel in REQUIRED_DOCS:
        if not (REPO_ROOT / rel).is_file():
            errs.append(f"Missing required doc: {rel}")

    # Check UTF-8 cleanly & zero U+FFFD replacement chars across all docs + scripts + CI
    all_doc_paths = [p.relative_to(REPO_ROOT).as_posix() for p in sorted((REPO_ROOT / "docs").rglob("*.md"))]
    for rel in sorted(set(REQUIRED_DOCS + all_doc_paths + ["scripts/static-verify.py", ".github/workflows/ci.yml"])):
        p = REPO_ROOT / rel
        if not p.is_file():
            continue
        t = p.read_text(encoding="utf-8")
        if "\ufffd" in t:
            errs.append(f"Replacement character U+FFFD (mojibake) found in {rel}")

    # Verify markdown relative links & active repo paths across active docs/*.md and docs/upgrade/*.md.
    # Immutable pre-monolith historical archives (docs/plans/*, docs/agent-prompts/*, docs/PRISMA_ANALYSIS.md)
    # are UTF-8 checked above without enforcing current-tree paths from pre-merge directories.
    archive_prefixes = ("docs/plans/", "docs/agent-prompts/")
    archive_files = {"docs/PRISMA_ANALYSIS.md"}
    md_files = [
        md
        for md in sorted((REPO_ROOT / "docs").rglob("*.md"))
        if not md.relative_to(REPO_ROOT).as_posix().startswith(archive_prefixes)
        and md.relative_to(REPO_ROOT).as_posix() not in archive_files
    ]
    link_re = re.compile(r"\[[^\]]*\]\(([^)]+)\)")
    path_prefixes = ("backend/", "frontend/", "api/", "packages/", "workers/", "scripts/", "docs/", ".github/")

    for md in md_files:
        rel_md = md.relative_to(REPO_ROOT).as_posix()
        content = md.read_text(encoding="utf-8")

        # 1. Markdown links
        for target in link_re.findall(content):
            tgt = target.strip().split()[0]
            if not tgt or tgt.startswith(("http://", "https://", "mailto:", "#", "file://")):
                continue
            tgt_no_anchor = tgt.split("#")[0]
            if not tgt_no_anchor:
                continue
            resolved = (md.parent / tgt_no_anchor).resolve()
            if not resolved.exists():
                errs.append(f"Broken relative markdown link in {rel_md}: ({target})")

        # 2. Inline code repo paths (skip globs/placeholders/line-suffix/legacy markers)
        in_fence = False
        for line in content.splitlines():
            if line.strip().startswith("```"):
                in_fence = not in_fence
                continue
            if in_fence:
                continue
            # Skip explicitly tagged historical references if line notes legacy removed tree
            lower_line = line.lower()
            is_legacy_line = any(
                tag in lower_line for tag in ("lịch sử", "legacy", "cũ", "trước kia", "từng mô tả", "đã gộp", "thay bằng")
            )
            if is_legacy_line:
                continue
            for code in re.findall(r"`([^`\n]+)`", line):
                cand = code.strip()
                if not any(cand.startswith(pre) for pre in path_prefixes):
                    continue
                if any(ch in cand for ch in ("*", "{", "}", "<", ">", " ", "|", "?", "[")):
                    continue
                cand = re.sub(r":L?\d+(?:-L?\d+)?$", "", cand).rstrip("/")
                if cand.endswith("..."):
                    continue
                if not (REPO_ROOT / cand).exists():
                    errs.append(f"Broken backtick repo path in {rel_md}: `{code}`")

    # Verify coverage.csv rows cover all required IDs
    cov_path = REPO_ROOT / "docs/upgrade/coverage.csv"
    if cov_path.is_file():
        with cov_path.open("r", encoding="utf-8", newline="") as f:
            rows = list(csv.DictReader(f))
        ids = {r.get("id", "").strip() for r in rows if r.get("id")}
        expected_ids: set[str] = set()
        expected_ids.update(f"P{i:02d}" for i in range(1, 16))
        expected_ids.update(f"N{i:02d}" for i in range(1, 53))
        expected_ids.update(f"R{i:02d}" for i in range(1, 25))
        expected_ids.update(f"B3-{i:02d}" for i in range(1, 8))
        expected_ids.add("B4-COVER")
        expected_ids.update(f"B4-CH{i:02d}" for i in range(1, 22))
        expected_ids.update(f"FIG-{i:02d}" for i in range(1, 24))
        expected_ids.update(f"TBL-{i:02d}" for i in range(1, 12))
        expected_ids.update(f"REF-{i:02d}" for i in range(1, 10))
        missing = sorted(expected_ids - ids)
        if missing:
            errs.append(f"docs/upgrade/coverage.csv missing {len(missing)} ID(s): {', '.join(missing[:12])}")

    # Ensure updated root docs carry explicit superseded/current banners
    for doc_rel, markers in [
        ("docs/Chi_Tiet_Kien_Truc_Va_Chuc_Nang.md", ("Tài liệu lịch sử", "architecture-and-erd.md")),
        ("docs/Tien_Do_Va_Do_Hoan_Thien_Chi_Tiet.md", ("Bản superseded", "89.7%")),
        ("docs/README.md", ("core-api", "ai-worker")),
    ]:
        p = REPO_ROOT / doc_rel
        if p.is_file():
            txt = p.read_text(encoding="utf-8")
            for mk in markers:
                if mk not in txt:
                    errs.append(f"{doc_rel} missing required update marker '{mk}'")

    return errs


def main() -> int:
    parser = argparse.ArgumentParser(description="Static verifier for SmartLogi AI SaaS")
    parser.add_argument("--code-only", action="store_true", help="Skip doc/traceability checks")
    args = parser.parse_args()

    checks: List[Tuple[str, Callable[[], List[str]]]] = [
        ("Core files & regression test presence", check_core_files_and_tests),
        ("No executable ::uuid casts", check_no_uuid_casts),
        ("Prisma TENANT isolation & RLS migration/SQL", check_rls_and_prisma_service),
        ("NestJS RBAC boundaries & route ordering", check_rbac_and_nestjs_route_ordering),
        ("API Gateway vs frontend/mobile route parity", check_gateway_portal_route_parity),
        ("Frontend data-source gate, CSV CWE-1236, clean UI", check_frontend_invariants),
        ("AI Worker, MobileNet CV, Go & Rust invariants", check_ai_cv_go_rust_invariants),
    ]
    if not args.code_only:
        checks.append(("CI workflow, docs links & traceability matrix", check_ci_and_docs))

    total_errors: List[str] = []
    for label, fn in checks:
        errs = fn()
        status = "PASS" if not errs else "FAIL"
        print(f"[{status}] {label}")
        for e in errs:
            print(f"  - {e}")
        total_errors.extend(errs)

    print(f"\nSummary: {len(checks)} check group(s), {len(total_errors)} error(s).")
    return 1 if total_errors else 0


if __name__ == "__main__":
    sys.exit(main())
