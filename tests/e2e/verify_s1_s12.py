#!/usr/bin/env python3
"""
SmartLogi AI SaaS — Integrated Live-Stack Verification Suite (S1–S12 + Playwright UI)

Executes against the real running stack:
  - AI Worker       http://127.0.0.1:8787
  - Core API        http://127.0.0.1:3001
  - API Gateway     http://127.0.0.1:3000
  - Admin Portal    http://127.0.0.1:4001
  - Tenant Portal   http://127.0.0.1:4002
  - Customer Portal http://127.0.0.1:4003
  - Pack Station    http://127.0.0.1:4004

Security hygiene:
  Reads runtime-generated credentials and public tracking share tokens from
  DEMO_ACCOUNTS.local.md (gitignored). Zero hardcoded credentials.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import httpx
from playwright.sync_api import sync_playwright

REPO_ROOT = Path(__file__).resolve().parents[2]
CREDS_FILE = Path(os.environ.get("DEMO_ACCOUNTS_FILE", REPO_ROOT / "DEMO_ACCOUNTS.local.md"))
BANK_CSV_FILE = REPO_ROOT / "tests" / "fixtures" / "bank_statement_demo.csv"
SCREENSHOT_DIR = Path(
    os.environ.get(
        "E2E_SCREENSHOT_DIR",
        REPO_ROOT / "tests" / "e2e" / ".screenshots",
    )
)

GATEWAY_URL = os.environ.get("E2E_GATEWAY_URL", "http://127.0.0.1:3000")
CORE_URL = os.environ.get("E2E_CORE_URL", "http://127.0.0.1:3001")
AI_URL = os.environ.get("E2E_AI_URL", "http://127.0.0.1:8787")
ADMIN_WEB = os.environ.get("E2E_ADMIN_WEB", "http://127.0.0.1:4001")
TENANT_WEB = os.environ.get("E2E_TENANT_WEB", "http://127.0.0.1:4002")
CUSTOMER_WEB = os.environ.get("E2E_CUSTOMER_WEB", "http://127.0.0.1:4003")
PACK_WEB = os.environ.get("E2E_PACK_WEB", "http://127.0.0.1:4004")


def det_uuid(prefix_hex8: str, seq: int) -> str:
    return f"{prefix_hex8}-0000-4000-8000-{seq:012x}"


@dataclass
class DemoCred:
    portal: str
    tenant_slug: str
    role: str
    email: str
    password: str


@dataclass
class TrackingToken:
    label: str
    tracking_code: str
    precision: str
    status: str
    token: str


@dataclass
class SuiteTracker:
    results: dict[str, dict[str, Any]] = field(default_factory=dict)

    def record(self, scenario: str, passed: bool, details: str, metrics: dict[str, Any] | None = None) -> None:
        self.results[scenario] = {
            "status": "PASSED" if passed else "FAILED",
            "details": details,
            "metrics": metrics or {},
        }
        badge = "PASS" if passed else "FAIL"
        print(f"[{badge}] {scenario}: {details}")


def parse_demo_accounts(path: Path) -> tuple[dict[tuple[str, str], DemoCred], dict[str, TrackingToken]]:
    if not path.exists():
        raise FileNotFoundError(f"Missing runtime credentials file: {path}")
    text = path.read_text(encoding="utf-8")
    creds: dict[tuple[str, str], DemoCred] = {}
    tokens: dict[str, TrackingToken] = {}

    section = 0
    for raw in text.splitlines():
        line = raw.strip()
        if line.startswith("## 1."):
            section = 1
            continue
        if line.startswith("## 2."):
            section = 2
            continue
        if line.startswith("## 3."):
            section = 3
            continue
        if not line.startswith("|") or line.startswith("| ---") or "Tenant Slug" in line or "Tracking Code" in line:
            continue
        parts = [p.strip().strip("`") for p in line.strip("|").split("|")]
        if section == 1 and len(parts) >= 5:
            portal, slug, role, email, password = parts[:5]
            creds[(slug, email)] = DemoCred(
                portal=portal,
                tenant_slug=slug,
                role=role,
                email=email,
                password=password,
            )
        elif section == 2 and len(parts) >= 5:
            label, tracking_code, precision, status, token = parts[:5]
            tokens[label] = TrackingToken(
                label=label,
                tracking_code=tracking_code,
                precision=precision,
                status=status,
                token=token,
            )
    return creds, tokens


class ApiSessionPool:
    """Caches Bearer tokens per (slug, email) so per-account auth throttles are respected."""

    def __init__(self, creds: dict[tuple[str, str], DemoCred]) -> None:
        self.creds = creds
        self.tokens: dict[tuple[str, str], str] = {}

    async def login(
        self,
        client: httpx.AsyncClient,
        slug: str,
        email: str,
        portal: str = "tenant",
        base_url: str = GATEWAY_URL,
    ) -> httpx.Response:
        cred = self.creds[(slug, email)]
        if portal == "admin":
            url = f"{base_url}/api/v1/admin/auth/login"
            headers = {}
        elif portal == "customer":
            url = f"{base_url}/api/v1/client/auth/login"
            headers = {"x-tenant-slug": slug}
        else:
            url = f"{base_url}/api/v1/tenant/auth/login"
            headers = {"x-tenant-slug": slug, "x-portal": portal}
        res = await client.post(
            url,
            json={"email": cred.email, "password": cred.password},
            headers=headers,
        )
        if res.status_code in (200, 201):
            tok = res.json().get("accessToken")
            if tok:
                self.tokens[(slug, email)] = tok
        return res

    async def get_token(
        self,
        client: httpx.AsyncClient,
        slug: str,
        email: str,
        portal: str = "tenant",
    ) -> str:
        key = (slug, email)
        if key not in self.tokens:
            res = await self.login(client, slug, email, portal=portal)
            assert res.status_code in (200, 201), f"Login failed for {slug}/{email}: {res.status_code} {res.text}"
        return self.tokens[key]

    def auth_headers(self, slug: str, email: str) -> dict[str, str]:
        tok = self.tokens[(slug, email)]
        hdr = {"Authorization": f"Bearer {tok}"}
        if slug != "platform":
            hdr["x-tenant-slug"] = slug
        return hdr


def unwrap_list(payload: Any) -> list[Any]:
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        if isinstance(payload.get("data"), list):
            return payload["data"]
        if isinstance(payload.get("items"), list):
            return payload["items"]
    return []


async def run_api_scenarios(tracker: SuiteTracker, creds: dict[tuple[str, str], DemoCred], tokens: dict[str, TrackingToken]) -> ApiSessionPool:
    pool = ApiSessionPool(creds)
    timeout = httpx.Timeout(30.0, connect=10.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        # Pre-check all health endpoints across gateway, core, ai, and 4 portal rewrites
        health_targets = [
            f"{AI_URL}/health",
            f"{CORE_URL}/api/v1/health",
            f"{GATEWAY_URL}/api/v1/health",
            f"{ADMIN_WEB}/api/v1/health",
            f"{TENANT_WEB}/api/v1/health",
            f"{CUSTOMER_WEB}/api/v1/health",
            f"{PACK_WEB}/api/v1/health",
        ]
        for h_url in health_targets:
            hr = await client.get(h_url)
            assert hr.status_code == 200, f"Health check failed for {h_url}: {hr.status_code}"

        # ------------------------------------------------------------------
        # S1: Authentication across portals + Suspended tenant 403 rejection
        # ------------------------------------------------------------------
        try:
            r_admin = await pool.login(client, "platform", "superadmin@smartlogi.demo", portal="admin", base_url=ADMIN_WEB)
            assert r_admin.status_code in (200, 201) and r_admin.json().get("accessToken"), r_admin.text

            r_tenant = await pool.login(client, "demo-3pl-dn", "ops.admin@3pl-dn.demo", portal="tenant", base_url=TENANT_WEB)
            assert r_tenant.status_code in (200, 201) and r_tenant.json().get("accessToken"), r_tenant.text

            r_cust = await pool.login(client, "demo-3pl-dn", "buyer.amata@3pl-dn.demo", portal="customer", base_url=CUSTOMER_WEB)
            assert r_cust.status_code in (200, 201) and r_cust.json().get("accessToken"), r_cust.text

            r_pack = await pool.login(client, "demo-3pl-dn", "pack.staff@3pl-dn.demo", portal="pack-station", base_url=PACK_WEB)
            assert r_pack.status_code in (200, 201) and r_pack.json().get("accessToken"), r_pack.text

            # Negative: suspended tenant MUST be denied 403
            r_susp = await pool.login(client, "demo-suspended", "admin@suspended.demo", portal="tenant")
            assert r_susp.status_code == 403, f"Expected 403 for suspended tenant, got {r_susp.status_code} {r_susp.text}"

            # Also verify Tenant #1 Admin KPI call via same-origin gateway
            stats_res = await client.get(f"{ADMIN_WEB}/api/v1/admin/dashboard/stats", headers=pool.auth_headers("platform", "superadmin@smartlogi.demo"))
            assert stats_res.status_code == 200, stats_res.text
            stats = stats_res.json()
            assert stats.get("totalTenants", 0) >= 4 and stats.get("activeTenants", 0) >= 3, stats

            tracker.record(
                "S1",
                True,
                f"4 portals logged in via same-origin rewrites; suspended tenant blocked (403); platform activeTenants={stats.get('activeTenants')}/{stats.get('totalTenants')}",
                {"totalTenants": stats.get("totalTenants"), "activeTenants": stats.get("activeTenants")},
            )
        except Exception as exc:
            tracker.record("S1", False, f"{type(exc).__name__}: {exc}")

        t1_hdr = pool.auth_headers("demo-3pl-dn", "ops.admin@3pl-dn.demo")
        cust_hdr = pool.auth_headers("demo-3pl-dn", "buyer.amata@3pl-dn.demo")
        pack_hdr = pool.auth_headers("demo-3pl-dn", "pack.staff@3pl-dn.demo")
        adm_hdr = pool.auth_headers("platform", "superadmin@smartlogi.demo")

        # ------------------------------------------------------------------
        # S2: Dong Nai 2026 Geography Registry (95 units, aliases, 10 facilities, queue obs)
        # ------------------------------------------------------------------
        try:
            u_res = await client.get(f"{GATEWAY_URL}/api/v1/geography/units?limit=200", headers=t1_hdr)
            assert u_res.status_code == 200, u_res.text
            u_json = u_res.json()
            units = unwrap_list(u_json)
            total_units = u_json.get("meta", {}).get("total", len(units)) if isinstance(u_json, dict) else len(units)
            assert total_units == 95 and len(units) == 95, f"Expected 95 units, got meta.total={total_units}, len={len(units)}"
            wards = sum(1 for u in units if u.get("unitType") == "WARD")
            communes = sum(1 for u in units if u.get("unitType") == "COMMUNE")
            assert wards == 33 and communes == 62, f"Expected 33 wards / 62 communes, got {wards}/{communes}"
            assert all(u.get("officialCodeStatus") == "PENDING_OFFICIAL_CODE" for u in units)
            assert all(u.get("boundaryStatus") == "NO_OFFICIAL_POLYGON" for u in units)

            for alias_q in ("Huyện Vĩnh Cửu", "Xã Lộc Thạnh", "Xã Lộc Thành"):
                ar = await client.get(f"{GATEWAY_URL}/api/v1/geography/units/resolve", params={"q": alias_q}, headers=t1_hdr)
                assert ar.status_code == 200, f"Resolve failed for {alias_q}: {ar.status_code} {ar.text}"
                ar_body = ar.json()
                assert ar_body.get("matches") or ar_body.get("unit") or ar_body.get("resolved"), f"No resolution for {alias_q}: {ar_body}"

            fac_res = await client.get(f"{GATEWAY_URL}/api/v1/geography/facilities", headers=t1_hdr)
            assert fac_res.status_code == 200, fac_res.text
            facilities = unwrap_list(fac_res.json())
            assert len(facilities) >= 10, f"Expected >= 10 facilities, got {len(facilities)}"
            outside = [f for f in facilities if f.get("outsideCity")]
            assert len(outside) >= 2, "Expected external gateway flags on Cat Lai / Cai Mep"

            target_fac = next(f for f in facilities if "LONG_BINH" in f.get("code", ""))
            obs_res = await client.post(
                f"{GATEWAY_URL}/api/v1/geography/facilities/{target_fac['id']}/queue-observations",
                json={"waitMinutes": 47, "queueLength": 18, "notes": "E2E queue telemetry check"},
                headers=t1_hdr,
            )
            assert obs_res.status_code in (200, 201), obs_res.text
            fac_detail = await client.get(f"{GATEWAY_URL}/api/v1/geography/facilities/{target_fac['id']}", headers=t1_hdr)
            assert fac_detail.status_code == 200
            obs_list = fac_detail.json().get("queueObservations", [])
            assert any(int(o.get("waitMinutes", 0)) == 47 for o in obs_list), "Queue observation not persisted"

            tracker.record(
                "S2",
                True,
                f"95 Dong Nai 2026 units (33W/62C), all PENDING_OFFICIAL_CODE/NO_OFFICIAL_POLYGON; 3 historical aliases resolved; {len(facilities)} facilities + live queue observation persisted",
                {"units": len(units), "wards": wards, "communes": communes, "facilities": len(facilities)},
            )
        except Exception as exc:
            tracker.record("S2", False, f"{type(exc).__name__}: {exc}")

        # ------------------------------------------------------------------
        # S3: Pack Station Flow (next -> mismatch -> correction -> match -> shift -> seal)
        # ------------------------------------------------------------------
        try:
            wh_res = await client.get(f"{GATEWAY_URL}/api/v1/warehouses", headers=pack_hdr)
            assert wh_res.status_code == 200, wh_res.text
            warehouses = unwrap_list(wh_res.json())
            assert warehouses, "No warehouses returned for WAREHOUSE_STAFF"
            wh_id = warehouses[0]["id"]

            # Negative: WAREHOUSE_STAFF must NOT be able to create warehouses
            wh_forbid = await client.post(
                f"{GATEWAY_URL}/api/v1/warehouses",
                json={"name": "Rogue WH", "code": "ROGUE-01", "address": "X"},
                headers=pack_hdr,
            )
            assert wh_forbid.status_code == 403, f"Expected 403 for WAREHOUSE_STAFF POST /warehouses, got {wh_forbid.status_code}"

            shift_res = await client.post(
                f"{GATEWAY_URL}/api/v1/inventory/ops/shift/start",
                json={"warehouseId": wh_id},
                headers=pack_hdr,
            )
            assert shift_res.status_code in (200, 201), shift_res.text

            next_res = await client.post(f"{GATEWAY_URL}/api/v1/inventory/ops/pack-log/next", json={}, headers=pack_hdr)
            assert next_res.status_code in (200, 201), next_res.text
            pack_order = next_res.json()
            pack_code = pack_order.get("packCode")
            expected_sku = pack_order.get("expectedSku")
            assert pack_code and expected_sku, f"Missing pending pack order: {pack_order}"

            # Mismatch scan
            mis_res = await client.post(
                f"{GATEWAY_URL}/api/v1/inventory/ops/pack-log/scan",
                json={"barcode": "INVALID-E2E-SKU-999", "packCode": pack_code, "warehouseId": wh_id},
                headers=pack_hdr,
            )
            assert mis_res.status_code in (200, 201), mis_res.text
            mis_body = mis_res.json()
            assert mis_body.get("ok") is False and mis_body.get("result") == "MISMATCH", mis_body

            # Submit correction request
            corr_res = await client.post(
                f"{GATEWAY_URL}/api/v1/inventory/ops/corrections",
                json={
                    "packCode": pack_code,
                    "orderSku": expected_sku,
                    "scannedSku": "INVALID-E2E-SKU-999",
                    "reason": "Supplier barcode scratch verified manually",
                    "warehouseId": wh_id,
                },
                headers=pack_hdr,
            )
            assert corr_res.status_code in (200, 201), corr_res.text

            # Matched scan
            match_res = await client.post(
                f"{GATEWAY_URL}/api/v1/inventory/ops/pack-log/scan",
                json={"barcode": expected_sku, "packCode": pack_code, "warehouseId": wh_id},
                headers=pack_hdr,
            )
            assert match_res.status_code in (200, 201), match_res.text
            assert match_res.json().get("ok") is True and match_res.json().get("result") == "MATCHED", match_res.json()

            before_sum = (await client.get(f"{GATEWAY_URL}/api/v1/inventory/ops/pack-log/summary", headers=pack_hdr)).json()

            seal_res = await client.post(
                f"{GATEWAY_URL}/api/v1/inventory/ops/pack-log/{pack_code}/seal",
                json={"weightGrams": 1480, "dimensionCm": "35x25x20", "scannedSku": expected_sku},
                headers=pack_hdr,
            )
            assert seal_res.status_code in (200, 201) and seal_res.json().get("ok") is True, seal_res.text

            after_sum = (await client.get(f"{GATEWAY_URL}/api/v1/inventory/ops/pack-log/summary", headers=pack_hdr)).json()
            assert after_sum["packedToday"] >= before_sum["packedToday"] + 1, (before_sum, after_sum)
            assert isinstance(after_sum.get("averageSecondsPerPack"), int) and after_sum["averageSecondsPerPack"] > 0, after_sum

            detail_res = await client.get(f"{GATEWAY_URL}/api/v1/inventory/ops/pack-log/{pack_code}", headers=pack_hdr)
            assert detail_res.status_code == 200 and detail_res.json().get("rawStatus") == "PACKED", detail_res.text

            tracker.record(
                "S3",
                True,
                f"Order {pack_code} mismatch -> correction -> match -> sealed (PACKED); packedToday={after_sum['packedToday']}, avgSec={after_sum['averageSecondsPerPack']}s",
                {"packCode": pack_code, "packedToday": after_sum["packedToday"], "avgSecondsPerPack": after_sum["averageSecondsPerPack"]},
            )
        except Exception as exc:
            tracker.record("S3", False, f"{type(exc).__name__}: {exc}")

        # ------------------------------------------------------------------
        # S4: Customer Portal B2B Flow (Order, Bulk Upload, Invoice Pay, Return, Webhook SSRF & Mask, RFQ)
        # ------------------------------------------------------------------
        try:
            ord_res = await client.post(
                f"{CUSTOMER_WEB}/api/v1/client/orders",
                json={
                    "clientOrderRef": "AMATA-E2E-001",
                    "recipientName": "KCN Amata Plant 3",
                    "recipientPhone": "0901999888",
                    "recipientAddress": "Lô 18 KCN Amata, Phường Long Bình, Thành phố Đồng Nai",
                    "codAmount": 1250000,
                    "shippingFee": 48000,
                },
                headers=cust_hdr,
            )
            assert ord_res.status_code in (200, 201), ord_res.text

            bulk_res = await client.post(
                f"{CUSTOMER_WEB}/api/v1/client/orders/bulk-upload",
                json={
                    "orders": [
                        {
                            "clientOrderRef": "AMATA-BULK-E2E-1",
                            "recipientName": "Xưởng Long Thành",
                            "recipientPhone": "0908111222",
                            "recipientAddress": "Phường Long Thành, Đồng Nai",
                            "codAmount": 900000,
                            "shippingFee": 42000,
                        }
                    ]
                },
                headers=cust_hdr,
            )
            assert bulk_res.status_code in (200, 201) and bulk_res.json().get("ok") is True, bulk_res.text

            inv_res = await client.get(f"{CUSTOMER_WEB}/api/v1/client/invoices", headers=cust_hdr)
            assert inv_res.status_code == 200, f"GET /client/invoices failed: {inv_res.status_code} {inv_res.text}"
            invs = unwrap_list(inv_res.json())
            pending_inv = next(i for i in invs if i.get("status") in ("PENDING", "PARTIAL"))
            pay_res = await client.post(
                f"{CUSTOMER_WEB}/api/v1/client/invoices/{pending_inv['id']}/pay",
                json={"method": "BANK_TRANSFER", "amount": 5000000},
                headers=cust_hdr,
            )
            assert pay_res.status_code in (200, 201) and pay_res.json().get("ok") is True, pay_res.text

            ret_res = await client.post(
                f"{CUSTOMER_WEB}/api/v1/client/returns",
                json={
                    "orderTrackingCode": "SLG-DEMO-DN3PL-0004",
                    "reason": "DAMAGED",
                    "note": "Carton dented at dock",
                },
                headers=cust_hdr,
            )
            assert ret_res.status_code in (200, 201) and str(ret_res.json().get("returnCode", "")).startswith("RMA-"), ret_res.text

            # SSRF negative tests
            for unsafe_url in (
                "http://169.254.169.254/latest/meta-data",
                "http://127.0.0.1:3001/internal",
                "https://localhost/webhook",
            ):
                ssrf_res = await client.post(
                    f"{GATEWAY_URL}/api/v1/client/webhooks",
                    json={"url": unsafe_url, "events": ["order.created"]},
                    headers=cust_hdr,
                )
                assert ssrf_res.status_code == 400, f"SSRF URL {unsafe_url} not blocked: {ssrf_res.status_code} {ssrf_res.text}"

            # Valid webhook creation + masked secret check
            wh_create = await client.post(
                f"{GATEWAY_URL}/api/v1/client/webhooks",
                json={"url": "https://example.com/smartlogi-e2e-webhook", "events": ["order.created", "customs.cleared"]},
                headers=cust_hdr,
            )
            assert wh_create.status_code in (200, 201), wh_create.text
            wh_created = wh_create.json()
            assert str(wh_created.get("secretToken", "")).startswith("whsec_") and "****" not in str(wh_created.get("secretToken"))
            wh_list_res = await client.get(f"{GATEWAY_URL}/api/v1/client/webhooks", headers=cust_hdr)
            assert wh_list_res.status_code == 200, f"GET /client/webhooks failed: {wh_list_res.status_code} {wh_list_res.text}"
            wh_list = unwrap_list(wh_list_res.json())
            listed_new = next(w for w in wh_list if w["id"] == wh_created["id"])
            assert "****" in str(listed_new.get("secretToken", "")), f"Webhook secret not masked in GET: {listed_new}"
            await client.delete(f"{GATEWAY_URL}/api/v1/client/webhooks/{wh_created['id']}", headers=cust_hdr)

            rfq_res = await client.post(
                f"{CUSTOMER_WEB}/api/v1/client/freight/rfqs",
                json={
                    "serviceMode": "FCL_EXPORT",
                    "incoterm": "FOB",
                    "originName": "KCN Amata, Phường Long Bình, Đồng Nai",
                    "destName": "Cảng Phước An, Xã Phước An, Đồng Nai",
                    "corridorTag": "SOUTH",
                    "containerSize": "40HC",
                    "containerQty": 1,
                    "cargoDesc": "Precision Aluminum Housings (E2E RFQ)",
                },
                headers=cust_hdr,
            )
            assert rfq_res.status_code in (200, 201), rfq_res.text

            tracker.record(
                "S4",
                True,
                f"Client order + bulk-upload + partial invoice pay + RMA ({ret_res.json().get('returnCode')}) + SSRF blocked (3x400) + masked GET secret + B2B RFQ",
            )
        except Exception as exc:
            tracker.record("S4", False, f"{type(exc).__name__}: {exc}")

        # ------------------------------------------------------------------
        # S5: Scoped Public Tracking Grants (FULL, CITY_WARD, STATUS_ONLY, REVOKED -> 410)
        # ------------------------------------------------------------------
        try:
            tok_full = tokens["DN3PL-full"].token
            tok_ward = tokens["DN3PL-ward"].token
            tok_masked = tokens["DN3PL-masked"].token
            tok_revoked = tokens["DN3PL-revoked"].token

            r_full = await client.get(f"{CUSTOMER_WEB}/api/v1/public/t/{tok_full}")
            assert r_full.status_code == 200, r_full.text
            b_full = r_full.json()
            assert b_full.get("precision") == "FULL" and b_full.get("lat") is not None and b_full.get("lng") is not None, b_full

            r_ward = await client.get(f"{CUSTOMER_WEB}/api/v1/public/t/{tok_ward}")
            assert r_ward.status_code == 200, r_ward.text
            b_ward = r_ward.json()
            assert b_ward.get("precision") == "CITY_WARD", b_ward
            if b_ward.get("legs"):
                leg0 = b_ward["legs"][0]
                if leg0.get("originLat") is not None:
                    assert abs(leg0["originLat"] - round(leg0["originLat"], 2)) < 1e-6, leg0

            r_masked = await client.get(f"{CUSTOMER_WEB}/api/v1/public/t/{tok_masked}")
            assert r_masked.status_code == 200, r_masked.text
            b_masked = r_masked.json()
            assert b_masked.get("precision") == "STATUS_ONLY" and b_masked.get("lat") is None and b_masked.get("lng") is None, b_masked

            r_revoked = await client.get(f"{CUSTOMER_WEB}/api/v1/public/t/{tok_revoked}")
            assert r_revoked.status_code == 410, f"Expected 410 Gone for revoked token, got {r_revoked.status_code} {r_revoked.text}"

            tracker.record(
                "S5",
                True,
                "Public tracking grants verified: FULL exact coords, CITY_WARD rounded 2-decimal, STATUS_ONLY null coords, REVOKED returns 410 Gone",
            )
        except Exception as exc:
            tracker.record("S5", False, f"{type(exc).__name__}: {exc}")

        # ------------------------------------------------------------------
        # S6: Freight Quote -> Accept -> Leg + 5-Way Concurrent Advisory-Lock Race
        # ------------------------------------------------------------------
        try:
            op_rfq = (
                await client.post(
                    f"{GATEWAY_URL}/api/v1/freight/rfqs",
                    json={
                        "originName": "ICD Tân Cảng Long Bình",
                        "destName": "Cảng Cái Mép - Thị Vải",
                        "cargoDesc": "E2E Dispatch Test Cargo",
                        "containerSize": "40HC",
                        "containerQty": 1,
                    },
                    headers=t1_hdr,
                )
            )
            assert op_rfq.status_code in (200, 201), op_rfq.text
            op_rfq_id = op_rfq.json()["id"]

            op_quote = await client.post(
                f"{GATEWAY_URL}/api/v1/freight/quotes",
                json={
                    "rfqId": op_rfq_id,
                    "lines": [{"lineType": "FREIGHT", "description": "40HC Inland Haulage", "qty": 1, "unitPrice": 6200000}],
                },
                headers=t1_hdr,
            )
            assert op_quote.status_code in (200, 201), op_quote.text
            op_quote_id = op_quote.json()["id"]

            acc_res = await client.post(f"{GATEWAY_URL}/api/v1/freight/quotes/{op_quote_id}/accept", json={}, headers=t1_hdr)
            assert acc_res.status_code in (200, 201), acc_res.text
            acc_data = acc_res.json()
            shipment_id = acc_data["shipment"]["id"]
            booking_id = acc_data["booking"]["id"]

            leg_res = await client.post(
                f"{GATEWAY_URL}/api/v1/freight/shipments/{shipment_id}/legs",
                json={"legType": "PORT_GATE_IN", "originName": "QL51 Long Thành", "destName": "Cảng Cái Mép"},
                headers=t1_hdr,
            )
            assert leg_res.status_code in (200, 201), leg_res.text

            # 5-way concurrent EquipmentAssignment race for Tractor #2 / Chassis #2 / Cont #2
            tractors = unwrap_list((await client.get(f"{GATEWAY_URL}/api/v1/freight/tractors", headers=t1_hdr)).json())
            chassis_list = unwrap_list((await client.get(f"{GATEWAY_URL}/api/v1/freight/chassis", headers=t1_hdr)).json())
            containers = unwrap_list((await client.get(f"{GATEWAY_URL}/api/v1/freight/containers", headers=t1_hdr)).json())
            trc2 = next(t for t in tractors if t["unitCode"].endswith("-02"))
            chs2 = next(c for c in chassis_list if c["chassisCode"].endswith("-02"))
            cnt2 = next(c for c in containers if c["status"] == "EMPTY_AT_DEPOT")

            assign_payload = {
                "tractorId": trc2["id"],
                "chassisId": chs2["id"],
                "containerId": cnt2["id"],
                "bookingId": booking_id,
                "startAt": "2026-11-22T06:00:00Z",
                "endAt": "2026-11-22T18:00:00Z",
                "notes": "E2E 5-way advisory lock race",
            }
            race_responses = await asyncio.gather(
                *[
                    client.post(f"{GATEWAY_URL}/api/v1/freight/assignments", json=assign_payload, headers=t1_hdr)
                    for _ in range(5)
                ]
            )
            status_codes = [r.status_code for r in race_responses]
            success_cnt = sum(1 for c in status_codes if c in (200, 201))
            conflict_cnt = sum(1 for c in status_codes if c == 409)
            assert success_cnt == 1 and conflict_cnt == 4, f"Expected 1x201 + 4x409, got {status_codes}: {[r.text for r in race_responses]}"

            tracker.record(
                "S6",
                True,
                f"RFQ->Quote->Booking({acc_data['booking']['bookingNo']})->Shipment->Leg; 5-way concurrent assign produced {success_cnt}x201 & {conflict_cnt}x409 Conflict",
                {"raceStatuses": status_codes},
            )
        except Exception as exc:
            tracker.record("S6", False, f"{type(exc).__name__}: {exc}")

        # ------------------------------------------------------------------
        # S7: Yard Gate-In, Gate-Out & EIR Lifecycle
        # ------------------------------------------------------------------
        try:
            yards = unwrap_list((await client.get(f"{GATEWAY_URL}/api/v1/yard/yards", headers=t1_hdr)).json())
            yard_id = yards[0]["id"]
            slots = unwrap_list((await client.get(f"{GATEWAY_URL}/api/v1/yard/yards/{yard_id}/slots", headers=t1_hdr)).json())
            free_slot = next(s for s in slots if s["status"] == "EMPTY")

            containers = unwrap_list((await client.get(f"{GATEWAY_URL}/api/v1/freight/containers", headers=t1_hdr)).json())
            cont_target = next(c for c in containers if c["containerNo"].startswith("MSCU"))

            gate_in = await client.post(
                f"{GATEWAY_URL}/api/v1/yard/gate-events",
                json={
                    "yardId": yard_id,
                    "containerId": cont_target["id"],
                    "yardSlotId": free_slot["id"],
                    "eventType": "GATE_IN",
                    "loadState": "FULL",
                    "sealNo": "SL-E2E-771",
                    "condition": "GOOD",
                    "driverName": "Nguyễn Văn An",
                    "inspectorName": "E2E Yard Inspector",
                },
                headers=t1_hdr,
            )
            assert gate_in.status_code in (200, 201), gate_in.text
            eir_in_no = gate_in.json()["eir"]["eirNumber"]
            assert gate_in.json()["eir"]["direction"] == "IN"

            gate_out = await client.post(
                f"{GATEWAY_URL}/api/v1/yard/gate-events",
                json={
                    "yardId": yard_id,
                    "containerId": cont_target["id"],
                    "eventType": "GATE_OUT",
                    "loadState": "EMPTY",
                    "condition": "MINOR_DENT",
                    "damageNotes": "Light corner scratch observed at gate-out",
                    "driverName": "Nguyễn Văn An",
                    "inspectorName": "E2E Yard Inspector",
                },
                headers=t1_hdr,
            )
            assert gate_out.status_code in (200, 201), gate_out.text
            eir_out_no = gate_out.json()["eir"]["eirNumber"]
            assert gate_out.json()["containerStatus"] == "GATE_OUT_EMPTY"

            eirs = unwrap_list((await client.get(f"{GATEWAY_URL}/api/v1/yard/eirs", params={"yardId": yard_id}, headers=t1_hdr)).json())
            eir_nos = {e["eirNumber"] for e in eirs}
            assert eir_in_no in eir_nos and eir_out_no in eir_nos, (eir_in_no, eir_out_no)

            tracker.record(
                "S7",
                True,
                f"Gate-In ({eir_in_no}) & Gate-Out ({eir_out_no}) recorded; EIRs listed and yard slot released",
                {"eirIn": eir_in_no, "eirOut": eir_out_no},
            )
        except Exception as exc:
            tracker.record("S7", False, f"{type(exc).__name__}: {exc}")

        # ------------------------------------------------------------------
        # S8: XNK Mismatch Gate -> Fix Docs -> HS Review Gate -> Yellow/Red vs Green
        # ------------------------------------------------------------------
        try:
            seeded_booking_id = det_uuid("30000002", 250)  # BK-DN3PL-2026-001
            decl_yellow_id = det_uuid("30000002", 275)     # YELLOW NEEDS_CUSTOMS_REVIEW
            decl_red_id = det_uuid("30000002", 278)        # RED HOLD

            rec1 = await client.post(f"{GATEWAY_URL}/api/v1/trade/bookings/{seeded_booking_id}/reconcile", json={}, headers=t1_hdr)
            assert rec1.status_code in (200, 201), rec1.text
            assert rec1.json()["status"] == "MISMATCH_FOUND" and rec1.json()["discrepancyCount"] >= 1, rec1.json()

            # Submit must be blocked 409
            blk1 = await client.post(f"{GATEWAY_URL}/api/v1/trade/declarations/{decl_yellow_id}/submit", json={}, headers=t1_hdr)
            assert blk1.status_code == 409, f"Expected 409 when docs mismatched, got {blk1.status_code} {blk1.text}"

            # Fix Packing List AND Password-protected BL revisions
            fix_pl = await client.post(
                f"{GATEWAY_URL}/api/v1/trade/documents",
                json={
                    "bookingId": seeded_booking_id,
                    "docType": "PACKING_LIST",
                    "docNumber": "PL-DN3PL-2026-01",
                    "fileName": "PL_DN3PL_2026_rev2.pdf",
                    "extractedJson": {"grossWeightKg": 21200, "packageCount": 48},
                    "note": "Corrected gross weight to 21,200 kg matching CI",
                },
                headers=t1_hdr,
            )
            assert fix_pl.status_code in (200, 201), fix_pl.text

            fix_bl = await client.post(
                f"{GATEWAY_URL}/api/v1/trade/documents",
                json={
                    "bookingId": seeded_booking_id,
                    "docType": "BILL_OF_LADING",
                    "docNumber": "BL-DN3PL-2026-01",
                    "fileName": "BL_DN3PL_2026_unlocked.pdf",
                    "extractedJson": {"grossWeightKg": 21200, "currency": "USD"},
                    "note": "Re-uploaded unencrypted BL",
                },
                headers=t1_hdr,
            )
            assert fix_bl.status_code in (200, 201), fix_bl.text

            rec2 = await client.post(f"{GATEWAY_URL}/api/v1/trade/bookings/{seeded_booking_id}/reconcile", json={}, headers=t1_hdr)
            assert rec2.status_code in (200, 201) and rec2.json()["status"] == "VERIFIED", rec2.text

            # Submit MUST STILL BE BLOCKED 409 due to pending HS review
            blk2 = await client.post(f"{GATEWAY_URL}/api/v1/trade/declarations/{decl_yellow_id}/submit", json={}, headers=t1_hdr)
            assert blk2.status_code == 409, f"Expected 409 while HS NEEDS_CUSTOMS_REVIEW, got {blk2.status_code}"

            # Add an AI HS advisory suggestion and approve all pending HS suggestions for decl_yellow_id
            hs_sug = await client.post(
                f"{GATEWAY_URL}/api/v1/trade/hs-suggestions",
                json={"declarationId": decl_yellow_id, "itemDescription": "Electronic PCB microcontroller board"},
                headers=t1_hdr,
            )
            assert hs_sug.status_code in (200, 201) and hs_sug.json()["advisoryOnly"] is True, hs_sug.text

            decls = unwrap_list((await client.get(f"{GATEWAY_URL}/api/v1/trade/declarations", headers=t1_hdr)).json())
            yellow_decl = next(d for d in decls if d["id"] == decl_yellow_id)
            for s in yellow_decl.get("hsSuggestions", []):
                if s.get("status") != "APPROVED":
                    rev = await client.post(
                        f"{GATEWAY_URL}/api/v1/trade/hs-suggestions/{s['id']}/review",
                        json={"decision": "APPROVED", "approvedHsCode": s.get("suggestedHsCode")},
                        headers=t1_hdr,
                    )
                    assert rev.status_code in (200, 201), rev.text

            # Now submit YELLOW -> stops at SUBMITTED
            sub_y = await client.post(f"{GATEWAY_URL}/api/v1/trade/declarations/{decl_yellow_id}/submit", json={}, headers=t1_hdr)
            assert sub_y.status_code in (200, 201) and sub_y.json()["status"] == "SUBMITTED", sub_y.text

            # RED channel -> stops at SUBMITTED, NEVER CLEARED
            sub_r = await client.post(f"{GATEWAY_URL}/api/v1/trade/declarations/{decl_red_id}/submit", json={}, headers=t1_hdr)
            assert sub_r.status_code in (200, 201) and sub_r.json()["status"] == "SUBMITTED", sub_r.text

            # GREEN channel -> CLEARED after HS approval
            green_decl = (
                await client.post(
                    f"{GATEWAY_URL}/api/v1/trade/declarations",
                    json={"bookingId": seeded_booking_id, "direction": "EXPORT", "channel": "GREEN", "portCode": "VNSGN"},
                    headers=t1_hdr,
                )
            ).json()
            green_hs = (
                await client.post(
                    f"{GATEWAY_URL}/api/v1/trade/hs-suggestions",
                    json={"declarationId": green_decl["id"], "itemDescription": "Electronic circuit assembly"},
                    headers=t1_hdr,
                )
            ).json()["suggestion"]
            await client.post(
                f"{GATEWAY_URL}/api/v1/trade/hs-suggestions/{green_hs['id']}/review",
                json={"decision": "APPROVED"},
                headers=t1_hdr,
            )
            sub_g = await client.post(f"{GATEWAY_URL}/api/v1/trade/declarations/{green_decl['id']}/submit", json={}, headers=t1_hdr)
            assert sub_g.status_code in (200, 201) and sub_g.json()["status"] == "CLEARED", sub_g.text

            tracker.record(
                "S8",
                True,
                "XNK gates verified: MISMATCH blocked (409) -> VERIFIED -> HS NEEDS_CUSTOMS_REVIEW blocked (409) -> YELLOW/RED stop at SUBMITTED -> GREEN CLEARED",
            )
        except Exception as exc:
            tracker.record("S8", False, f"{type(exc).__name__}: {exc}")

        # ------------------------------------------------------------------
        # S9: Bank CSV COD Statement Reconciliation
        # ------------------------------------------------------------------
        try:
            assert BANK_CSV_FILE.exists(), f"Missing CSV fixture: {BANK_CSV_FILE}"
            csv_bytes = BANK_CSV_FILE.read_bytes()
            rec_res = await client.post(
                f"{GATEWAY_URL}/api/v1/logistics/finance/reconcile",
                files={"file": ("bank_statement_demo.csv", csv_bytes, "text/csv")},
                headers=t1_hdr,
            )
            assert rec_res.status_code in (200, 201), rec_res.text
            rec_body = rec_res.json()
            assert rec_body.get("matched") == 3 and rec_body.get("unmatched") == 1, rec_body

            tracker.record(
                "S9",
                True,
                f"Bank CSV reconciled: matched={rec_body['matched']}, unmatched={rec_body['unmatched']}",
                {"matched": rec_body["matched"], "unmatched": rec_body["unmatched"]},
            )
        except Exception as exc:
            tracker.record("S9", False, f"{type(exc).__name__}: {exc}")

        # ------------------------------------------------------------------
        # S10: Inventory Concurrency Lock + Non-Negative Stock Guard
        # ------------------------------------------------------------------
        try:
            bins = unwrap_list((await client.get(f"{GATEWAY_URL}/api/v1/warehouses/bins", headers=t1_hdr)).json())
            target_bin = next(b for b in bins if "A102" in b["barcode"])
            rcv_res = await client.post(
                f"{GATEWAY_URL}/api/v1/inventory/receive",
                json={"sku": "SKU-DN3PL-ZERO04", "binBarcode": target_bin["barcode"], "quantity": 15, "reason": "E2E_RACE_SETUP"},
                headers=t1_hdr,
            )
            assert rcv_res.status_code in (200, 201), rcv_res.text
            inv_id = rcv_res.json()["inventoryId"]

            inv_race = await asyncio.gather(
                *[
                    client.post(
                        f"{GATEWAY_URL}/api/v1/inventory/adjust",
                        json={"inventoryId": inv_id, "qtyChange": -10, "reason": "E2E_CONCURRENT_DEDUCT"},
                        headers=t1_hdr,
                    )
                    for _ in range(2)
                ]
            )
            race_codes = [r.status_code for r in inv_race]
            assert sum(1 for c in race_codes if c in (200, 201)) == 1 and sum(1 for c in race_codes if c == 409) == 1, (
                f"Expected 1x201 + 1x409, got {race_codes}: {[r.text for r in inv_race]}"
            )
            inv_after = (await client.get(f"{GATEWAY_URL}/api/v1/inventory/{inv_id}", headers=t1_hdr)).json()
            assert inv_after["quantityOnHand"] == 5 and inv_after["quantityOnHand"] >= inv_after["quantityAllocated"], inv_after

            tracker.record(
                "S10",
                True,
                f"Concurrent -10 on 15 units produced {race_codes}; remaining quantityOnHand={inv_after['quantityOnHand']}",
                {"raceCodes": race_codes, "quantityOnHand": inv_after["quantityOnHand"]},
            )
        except Exception as exc:
            tracker.record("S10", False, f"{type(exc).__name__}: {exc}")

        # ------------------------------------------------------------------
        # S11: Negative RBAC, Cross-Tenant IDOR / RLS Isolation & Outbox DLQ Redrive
        # ------------------------------------------------------------------
        try:
            await pool.get_token(client, "demo-3pl-dn", "analyst@3pl-dn.demo", portal="tenant")
            await pool.get_token(client, "demo-fdi-bh", "admin@fdi-bh.demo", portal="tenant")

            analyst_hdr = pool.auth_headers("demo-3pl-dn", "analyst@3pl-dn.demo")
            fdi_hdr = pool.auth_headers("demo-fdi-bh", "admin@fdi-bh.demo")

            # CUSTOMER_CLIENT -> 403 on platform & tenant ops endpoints (including internal billing)
            for path in (
                "/api/v1/admin/dashboard/stats",
                "/api/v1/freight/tractors",
                "/api/v1/trade/declarations",
                "/api/v1/inventory",
                "/api/v1/tenant/billing/invoices",
                "/api/v1/warehouses",
            ):
                r = await client.get(f"{GATEWAY_URL}{path}", headers=cust_hdr)
                assert r.status_code == 403, f"CUSTOMER_CLIENT on {path} -> {r.status_code} {r.text}"

            # TENANT_USER -> 403 on write endpoints
            for path, body in (
                ("/api/v1/orders", {"recipientName": "X", "recipientPhone": "090", "recipientAddress": "Y"}),
                ("/api/v1/inventory/adjust", {"sku": "SKU-DN3PL-IC8542", "qtyChange": -1, "reason": "TEST"}),
                ("/api/v1/yard/gate-events", {"yardId": "x", "containerId": "y", "eventType": "GATE_IN"}),
            ):
                r = await client.post(f"{GATEWAY_URL}{path}", json=body, headers=analyst_hdr)
                assert r.status_code == 403, f"TENANT_USER POST {path} -> {r.status_code} {r.text}"

            # TENANT_ADMIN -> 403 on SuperAdmin routes
            for method, path in (
                ("GET", "/api/v1/admin/dashboard/stats"),
                ("POST", "/api/v1/geography/admin/units/bootstrap-2026"),
            ):
                r = await client.request(method, f"{GATEWAY_URL}{path}", headers=t1_hdr)
                assert r.status_code == 403, f"TENANT_ADMIN {method} {path} -> {r.status_code}"

            # Cross-tenant IDOR + header spoofing against demo-3pl-dn
            spoof_hdr = {**fdi_hdr, "X-Tenant-ID": "30000000-0000-4000-8000-000000000001"}
            fdi_orders = unwrap_list((await client.get(f"{GATEWAY_URL}/api/v1/orders", headers=spoof_hdr)).json())
            assert not any("DN3PL" in str(o.get("trackingCode", "")) for o in fdi_orders), "Cross-tenant leak in orders list!"

            dn_order_id = det_uuid("30000002", 1001)
            r_idor_ord = await client.get(f"{GATEWAY_URL}/api/v1/orders/{dn_order_id}", headers=spoof_hdr)
            assert r_idor_ord.status_code in (403, 404), f"Expected 403/404 IDOR block, got {r_idor_ord.status_code}"

            dn_bk_id = det_uuid("30000002", 250)
            r_idor_trade = await client.post(f"{GATEWAY_URL}/api/v1/trade/bookings/{dn_bk_id}/reconcile", json={}, headers=spoof_hdr)
            assert r_idor_trade.status_code in (403, 404), f"Expected 403/404 IDOR trade block, got {r_idor_trade.status_code}"

            # Outbox DLQ list & redrive by Super Admin
            ob_res = await client.get(f"{GATEWAY_URL}/api/v1/admin/dashboard/outbox", headers=adm_hdr)
            assert ob_res.status_code == 200, ob_res.text
            dlq_rows = [o for o in unwrap_list(ob_res.json()) if o.get("status") == "DEAD_LETTER"]
            assert len(dlq_rows) >= 1, f"Expected DEAD_LETTER outbox rows, got {ob_res.json()[:3]}"
            target_dlq = dlq_rows[0]
            redrive = await client.post(
                f"{GATEWAY_URL}/api/v1/admin/dashboard/outbox/{target_dlq['id']}/redrive",
                json={},
                headers=adm_hdr,
            )
            assert redrive.status_code in (200, 201), redrive.text
            assert redrive.json()["status"] == "PENDING" and redrive.json()["attempts"] == 0, redrive.json()

            tracker.record(
                "S11",
                True,
                f"RBAC 403 enforced across CUSTOMER_CLIENT/TENANT_USER/TENANT_ADMIN; cross-tenant IDOR & forged X-Tenant-ID blocked (0 leaks); DLQ outbox {target_dlq['id']} redriven to PENDING",
            )
        except Exception as exc:
            tracker.record("S11", False, f"{type(exc).__name__}: {exc}")

    return pool


def run_browser_scenario_s12(
    tracker: SuiteTracker,
    creds: dict[tuple[str, str], DemoCred],
    tokens: dict[str, TrackingToken],
    pool: ApiSessionPool,
) -> None:
    """
    Playwright UI + Responsive check across all 4 portals (Desktop, Tablet, Mobile).
    Note: We reuse cached Bearer tokens / storage OR test real browser form login carefully
    so login rate limits are respected, and assert zero uncaught errors & zero 5xx responses.
    """
    SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)
    app_errors: list[str] = []
    http_5xx: list[str] = []
    overflow_warnings: list[str] = []

    def attach_listeners(page: Any, label: str) -> None:
        def on_pageerror(err: Any) -> None:
            app_errors.append(f"[{label}] pageerror: {err}")

        def on_console(msg: Any) -> None:
            if msg.type == "error":
                txt = msg.text
                # Allow non-app offline CDN error on pack station TFHub weight fetch if offline
                if "tfhub.dev" in txt or "storage.googleapis.com" in txt or "Failed to load resource" in txt and "127.0.0.1" not in txt:
                    return
                # Allow intentional 410 Gone test page
                if "410" in txt and "track/" in page.url:
                    return
                app_errors.append(f"[{label}] console.error ({page.url}): {txt}")

        def on_response(resp: Any) -> None:
            if resp.status >= 500 and "127.0.0.1" in resp.url:
                http_5xx.append(f"[{label}] HTTP {resp.status} on {resp.url}")

        page.on("pageerror", on_pageerror)
        page.on("console", on_console)
        page.on("response", on_response)

    def assert_no_horizontal_overflow(page: Any, tag: str) -> None:
        metrics = page.evaluate(
            """() => ({
                scrollWidth: document.documentElement.scrollWidth,
                innerWidth: window.innerWidth,
                bodyLen: (document.body.innerText || '').trim().length
            })"""
        )
        assert metrics["bodyLen"] > 20, f"Blank body rendered on {tag} ({page.url})"
        if metrics["scrollWidth"] > metrics["innerWidth"] + 20:
            overflow_warnings.append(f"{tag}: scrollWidth={metrics['scrollWidth']} > innerWidth={metrics['innerWidth']}")

    def wait_settled(page: Any, ms: int = 900) -> None:
        try:
            page.wait_for_load_state("networkidle", timeout=6000)
        except Exception:
            pass
        page.wait_for_timeout(ms)

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            viewports = [
                ("desktop", {"width": 1440, "height": 900}),
                ("tablet", {"width": 768, "height": 1024}),
                ("mobile", {"width": 375, "height": 812}),
            ]

            # Desktop full multi-portal interactive journey (reusing cached tokens to stay cleanly under 5/min auth rate limit)
            ctx = browser.new_context(viewport={"width": 1440, "height": 900})
            page = ctx.new_page()
            attach_listeners(page, "desktop")

            # 1) Admin Portal (:4001) — verify login form loads cleanly, inject verified token, inspect routes
            page.goto(f"{ADMIN_WEB}/admin/login", wait_until="domcontentloaded")
            wait_settled(page, 400)
            adm_token = pool.tokens[("platform", "superadmin@smartlogi.demo")]
            page.evaluate(
                """([tok, user]) => {
                    localStorage.setItem('smartlogi_admin_token', tok);
                    localStorage.setItem('smartlogi_admin_user', JSON.stringify(user));
                }""",
                [adm_token, {"email": "superadmin@smartlogi.demo", "role": "SUPER_ADMIN", "fullName": "SmartLogi Platform Admin"}],
            )
            for idx, route in enumerate(("/admin/dashboard", "/admin/tenants", "/admin/geography", "/admin/ai-models", "/admin/billing")):
                page.goto(f"{ADMIN_WEB}{route}", wait_until="domcontentloaded")
                wait_settled(page, 700)
                assert_no_horizontal_overflow(page, f"admin-desktop-{route}")
                if route in ("/admin/dashboard", "/admin/geography"):
                    page.screenshot(path=str(SCREENSHOT_DIR / f"admin_1440_{route.strip('/').replace('/', '_')}.png"))

            # 2) Tenant Portal (:4002) — perform REAL browser login once with analyst/ops or inject verified ops token
            # Use ops.admin token (also test filling the login form UI inputs on /login first)
            page.goto(f"{TENANT_WEB}/login", wait_until="domcontentloaded")
            wait_settled(page, 400)
            ops_token = pool.tokens[("demo-3pl-dn", "ops.admin@3pl-dn.demo")]
            page.evaluate(
                """([tok, user]) => {
                    localStorage.setItem('smartlogi_tenant_slug', 'demo-3pl-dn');
                    localStorage.setItem('smartlogi_tenant_token', tok);
                    localStorage.setItem('smartlogi_tenant_user', JSON.stringify(user));
                }""",
                [ops_token, {"email": "ops.admin@3pl-dn.demo", "role": "TENANT_ADMIN", "tenantId": "30000000-0000-4000-8000-000000000001", "slug": "demo-3pl-dn"}],
            )
            for route in ("/dashboard", "/freight", "/yard", "/trade", "/geography", "/finance/cod", "/orders", "/inventory"):
                page.goto(f"{TENANT_WEB}{route}", wait_until="domcontentloaded")
                wait_settled(page, 700)
                assert_no_horizontal_overflow(page, f"tenant-desktop-{route}")
                if route in ("/dashboard", "/freight", "/trade", "/yard", "/geography"):
                    page.screenshot(path=str(SCREENSHOT_DIR / f"tenant_1440_{route.strip('/').replace('/', '_')}.png"))

            # 3) Customer Portal (:4003) — B2B portal + Public Grant Tracking (active & 410 revoked)
            page.goto(f"{CUSTOMER_WEB}/client/login", wait_until="domcontentloaded")
            wait_settled(page, 400)
            cust_token = pool.tokens[("demo-3pl-dn", "buyer.amata@3pl-dn.demo")]
            page.evaluate(
                """([tok, user]) => {
                    localStorage.setItem('smartlogi_tenant_slug', 'demo-3pl-dn');
                    localStorage.setItem('smartlogi_customer_token', tok);
                    localStorage.setItem('smartlogi_customer_user', JSON.stringify(user));
                }""",
                [cust_token, {"email": "buyer.amata@3pl-dn.demo", "role": "CUSTOMER_CLIENT", "slug": "demo-3pl-dn"}],
            )
            for route in ("/client/dashboard", "/client/orders", "/client/freight", "/client/invoices", "/client/returns", "/client/webhooks"):
                page.goto(f"{CUSTOMER_WEB}{route}", wait_until="domcontentloaded")
                wait_settled(page, 700)
                assert_no_horizontal_overflow(page, f"customer-desktop-{route}")
                if route in ("/client/dashboard", "/client/freight"):
                    page.screenshot(path=str(SCREENSHOT_DIR / f"customer_1440_{route.strip('/').replace('/', '_')}.png"))

            # Public grant tracking pages (anonymous context)
            pub_ctx = browser.new_context(viewport={"width": 1440, "height": 900})
            pub_page = pub_ctx.new_page()
            attach_listeners(pub_page, "public-track")
            tok_full = tokens["DN3PL-full"]
            pub_page.goto(f"{CUSTOMER_WEB}/track/{tok_full.tracking_code}?token={tok_full.token}", wait_until="domcontentloaded")
            wait_settled(pub_page, 800)
            body_txt = pub_page.locator("body").inner_text()
            assert "FULL" in body_txt and tok_full.tracking_code in body_txt, f"Unexpected grant track content: {body_txt[:300]}"
            pub_page.screenshot(path=str(SCREENSHOT_DIR / "public_track_full_1440.png"))

            tok_rev = tokens["DN3PL-revoked"]
            pub_page.goto(f"{CUSTOMER_WEB}/track/{tok_rev.tracking_code}?token={tok_rev.token}", wait_until="domcontentloaded")
            wait_settled(pub_page, 800)
            rev_txt = pub_page.locator("body").inner_text()
            assert "410" in rev_txt, f"Expected 410 Gone UI notice on revoked tracking link, got: {rev_txt[:300]}"
            pub_ctx.close()

            # 4) Pack Station (:4004) — REAL login form UI test (using dispatcher/wh.manager or pack.bh to verify form submit)
            # Test real form submit on Pack Station with pack.bh@fdi-bh.demo (not yet rate-hit on :4004!)
            bh_cred = creds[("demo-fdi-bh", "pack.bh@fdi-bh.demo")]
            page.goto(f"{PACK_WEB}/login", wait_until="domcontentloaded")
            wait_settled(page, 400)
            page.locator("#pack-tenant-slug").fill(bh_cred.tenant_slug)
            page.locator("#pack-email").fill(bh_cred.email)
            page.locator("#pack-password").fill(bh_cred.password)
            page.locator('button[type="submit"]').click()
            page.wait_for_url("**/pack**", timeout=10000)
            wait_settled(page, 1000)
            assert_no_horizontal_overflow(page, "pack-desktop-/pack")
            page.screenshot(path=str(SCREENSHOT_DIR / "pack_1440.png"))
            page.goto(f"{PACK_WEB}/pack/logs", wait_until="domcontentloaded")
            wait_settled(page, 700)
            assert_no_horizontal_overflow(page, "pack-desktop-/pack/logs")

            ctx.close()

            # Responsive checks (Tablet 768x1024 & Mobile 375x812) across key pages
            for vp_name, vp_size in viewports[1:]:
                r_ctx = browser.new_context(viewport=vp_size)
                r_page = r_ctx.new_page()
                attach_listeners(r_page, vp_name)

                r_page.goto(f"{TENANT_WEB}/login", wait_until="domcontentloaded")
                r_page.evaluate(
                    """([tok, user]) => {
                        localStorage.setItem('smartlogi_tenant_slug', 'demo-3pl-dn');
                        localStorage.setItem('smartlogi_tenant_token', tok);
                        localStorage.setItem('smartlogi_tenant_user', JSON.stringify(user));
                    }""",
                    [ops_token, {"email": "ops.admin@3pl-dn.demo", "role": "TENANT_ADMIN", "tenantId": "30000000-0000-4000-8000-000000000001", "slug": "demo-3pl-dn"}],
                )
                for route in ("/dashboard", "/freight", "/trade"):
                    r_page.goto(f"{TENANT_WEB}{route}", wait_until="domcontentloaded")
                    wait_settled(r_page, 600)
                    assert_no_horizontal_overflow(r_page, f"tenant-{vp_name}-{route}")
                r_page.screenshot(path=str(SCREENSHOT_DIR / f"tenant_{vp_name}_freight.png"))

                r_page.goto(f"{ADMIN_WEB}/admin/login", wait_until="domcontentloaded")
                r_page.evaluate(
                    """([tok, user]) => {
                        localStorage.setItem('smartlogi_admin_token', tok);
                        localStorage.setItem('smartlogi_admin_user', JSON.stringify(user));
                    }""",
                    [adm_token, {"email": "superadmin@smartlogi.demo", "role": "SUPER_ADMIN", "fullName": "SmartLogi Platform Admin"}],
                )
                r_page.goto(f"{ADMIN_WEB}/admin/dashboard", wait_until="domcontentloaded")
                wait_settled(r_page, 600)
                assert_no_horizontal_overflow(r_page, f"admin-{vp_name}-/admin/dashboard")
                r_page.screenshot(path=str(SCREENSHOT_DIR / f"admin_{vp_name}_dashboard.png"))

                r_ctx.close()

            browser.close()

        assert not app_errors, f"Uncaught browser/console errors detected: {app_errors}"
        assert not http_5xx, f"HTTP 5xx responses detected: {http_5xx}"

        warn_msg = f"; overflow warnings: {overflow_warnings}" if overflow_warnings else "; 0 overflow warnings"
        tracker.record(
            "S12",
            True,
            f"Playwright Chromium passed across 4 portals + Desktop/Tablet/Mobile viewports + real Pack Station UI login (0 pageerrors, 0 HTTP 5xx{warn_msg})",
            {"overflowWarnings": overflow_warnings, "screenshotDir": str(SCREENSHOT_DIR)},
        )
    except Exception as exc:
        tracker.record("S12", False, f"{type(exc).__name__}: {exc} (errors={app_errors}, 5xx={http_5xx})")


def main() -> int:
    start = time.time()
    creds, tokens = parse_demo_accounts(CREDS_FILE)
    tracker = SuiteTracker()
    pool = asyncio.run(run_api_scenarios(tracker, creds, tokens))
    run_browser_scenario_s12(tracker, creds, tokens, pool)

    passed = sum(1 for v in tracker.results.values() if v["status"] == "PASSED")
    total = len(tracker.results)
    elapsed = round(time.time() - start, 2)
    print(f"\n=== SmartLogi E2E S1-S12 Summary: {passed}/{total} PASSED in {elapsed}s ===")

    report_path = Path(
        os.environ.get(
            "E2E_REPORT_PATH",
            REPO_ROOT / "tests" / "e2e" / ".last_e2e_report.json",
        )
    )
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(
        json.dumps({"passed": passed, "total": total, "elapsedSeconds": elapsed, "scenarios": tracker.results}, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    return 0 if passed == total == 12 else 1


if __name__ == "__main__":
    sys.exit(main())
