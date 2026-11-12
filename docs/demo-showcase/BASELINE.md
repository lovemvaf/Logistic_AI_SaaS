# SmartLogi AI SaaS — Gate 0 Baseline Audit

- **Audit Timestamp**: 2026-11-12T11:05:00+07:00
- **Repository Root**: `Logistic_AI_SaaS-main` (`main` branch at commit `e87e4fb3c1d92de6ea291dbf89636bb7be806c1b`)
- **Static Quality Gate (`python -X utf8 scripts/static-verify.py`)**: `8/8 check group(s), 0 error(s)`

## 1. Deployed Portals (Vercel Team `visionary19` · `team_T6s3oJUmrj5hwTjwgDszZMP2`)

| Portal | Production URL | Vercel Project ID | Root Directory | Next.js `page.tsx` Count |
|---|---|---|---|---:|
| Customer Portal | https://smartlogi-customer.vercel.app | `prj_eSQvpGluaOMQZhioj6dLFVY5jSMq` | `frontend/reporting/customer-portal` | 18 |
| Tenant Portal | https://smartlogi-tenant.vercel.app | `prj_fvHuOLZqucpjnVzRVhsCDw78uzyS` | `frontend/reporting/tenant-portal` | 56 |
| Pack Station | https://smartlogi-pack.vercel.app | `prj_DkRnjpLl146dbdt3Gmf7rZvtrxl9` | `frontend/reporting/pack-station-web` | 8 |
| Admin Portal | https://smartlogi-admin.vercel.app | `prj_wbGhEWOdUz0khF8S0cqWIeFKZfhi` | `frontend/feature-test/admin-portal` | 20 |
| **Total** | **4 Portals** | — | — | **102** |

> Scope Guard: `visionary-platform` (`prj_1RYie8YpvZSUGdN7u0C3uYEzEun6`) is out of scope and MUST NOT be modified, deployed, or deleted.

## 2. Architecture & Data Backend Verified

- **Demo Cloud API**: `packages/demo-cloud-api` serves unified `/api/v1/*` handlers backed by **Neon PostgreSQL + PostGIS** with PostgreSQL **RLS (`smartlogi_app`)** and fail-closed `401` / `403` enforcement.
- **Seed Script**: `packages/prisma-schemas/prisma/seeds/demo-enterprise.ts` seeds 4 tenants (`demo-3pl-dn`, `demo-fdi-bh`, `demo-lm-lk`, `demo-suspended`), 15 personas, 95 Dong Nai 2026 administrative units (`PENDING_OFFICIAL_CODE`, `NO_OFFICIAL_POLYGON`, `33W / 62C`), facilities (ICD Long Binh, KCN Amata, KCN Nhon Trach, Cang Phuoc An, and external gateways Cat Lai / Cai Mep), freight RFQs/quotes/bookings/shipments, customs declarations, WMS bins/SKUs/waves/pack sessions, trips, deliveries, and finance records.
- **Pre-existing Local Dirty Files (Observed at Gate 0 Start)**:
  - `docs/deployment/ENV_MATRIX.md`
  - `docs/deployment/VERCEL_VISIONARY19.md`
  - `docs/demo/PERSONA_GUIDE.md`

## 3. Preserved Security & E01–E40 Contracts

- `POST /api/v1/ai/v1/train/:type` returns honest HTTP `501 TRAINING_NOT_IMPLEMENTED`.
- `CV_CONFIDENCE_THRESHOLD = 0.6` on Pack Station predictions.
- `STATUS_ONLY` public tracking share grants mask `lat: null, lng: null` and omit `codAmount` and sensitive PII; `FULL` grants continue hiding `codAmount` while revoked/expired shares return HTTP `410`.
- CSV exports preserve CWE-1236 formula neutralization.
- Zero decorative emojis across `frontend/**/*.ts*` and `packages/ui-kit`.
- All 40 assertions and selectors in `tests/e2e/verify_public_e01_e40.py` remain intact.

See `docs/demo-showcase/ROUTE_ACTION_MATRIX.csv` for all 102 mapped routes, `docs/demo-showcase/BUGS_P0_P1.md` for verified P0/P1 defects, and `docs/demo-showcase/PUBLIC_URL_SMOKE.md` for live baseline crawl telemetry.
