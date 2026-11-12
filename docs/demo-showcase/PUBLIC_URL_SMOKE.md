# Gate 0 — Public URL Smoke & Responsive Crawl Baseline

- **Executed Against Live Production Deployment**: Commit `e87e4fb3c1d92de6ea291dbf89636bb7be806c1b`
- **Viewports Tested**: Desktop `1440x900`, Tablet `768x1024`, Mobile `390x844` & `360x780`
- **Artifacts**: `rest_baseline.json` (46 targeted multi-portal & responsive runs + prior full admin/tenant/customer/pack sweep)

## 1. Live Failure Summary (Pre-Fix Baseline)

| Portal | Route | Viewport | Status / Result | Observed Error / Defect |
|---|---|---|---|---|
| Tenant | `/logistics/dispatch` | `1440x900` | HTTP 200 · **FAIL** | Console `Error: Invalid LatLng object: (undefined, undefined)` in Leaflet marker initialization |
| Pack | `/pack/logs` | `1440x900` | HTTP 200 · **FAIL** | HTTP `404 /api/v1/inventory/ops/pack-log/undefined` + UI error banner `Endpoint không tồn tại` |
| Customer | `/client/demo-handoff` | `1440x900` | HTTP 200 · **DEGRADED** | Page remained on `"Đang đồng bộ phiên làm việc..."` with `net::ERR_ABORTED` on initial dashboard fetches |
| Customer | `/track/SLG-DEMO-DN3PL-0001` & `0003` | `1440x900`, `360`, `390`, `768` | HTTP 200 · **INCOMPLETE** | No interactive Đồng Nai corridor map, no route playback (`1x/4x`), only 1 seeded tracking event, swapped demo descriptions on `/` |

## 2. Live Baseline Pass Metrics (To Be Re-Verified at Gate 7 Across All 102 Routes)

- Horizontal overflow (`scrollWidth <= innerWidth`) across all 46 sampled routes (`360px`, `390px`, `768px`, `1440px`): **`0` overflow incidents**.
- `/build-info` parity on Customer (`e87e4fb3c1d92de6ea291dbf89636bb7be806c1b`) and Pack (`e87e4fb3c1d92de6ea291dbf89636bb7be806c1b`): `ok · demo-cloud-api`.
- Next Full Crawl Target (Gate 7): All **102** routes at desktop `1440x900` plus key showcase routes at `360x780`, `390x844`, and `768x1024` with **0 console errors, 0 page errors, 0 HTTP >= 400 unexpected responses, and 0 overflow**, plus full `40/40` `verify_public_e01_e40.py` pass.
