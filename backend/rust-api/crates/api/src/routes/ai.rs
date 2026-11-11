use axum::{
    extract::{Json, Path, Query},
    routing::{get, post},
    Router,
};
use domain::{
    AiDecision, Anomaly, CreditFactor, CustomerCreditScore, DemandForecast, DemandPrediction,
    DriverRankingRow, Envelope, FuelPrediction, OptimizedStop, Page, RouteOptimization,
};
use serde::Deserialize;

use crate::{auth::AuthUser, error::ApiError, state::AppState};

/// AI agent endpoints.
///
/// NOTE: These handlers currently synthesize deterministic fixture outputs
/// (stub mode) until wired to trained model weights / `workers/ai-worker`.
/// Confidence values are bounded cleanly within `[0.0, 100.0]` (`AiDecision`
/// uses `[0.0, 1.0]`) and never claim unverified offline accuracy metrics.

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/logistics/trips/optimize", post(trip_optimize_all))
        .route("/logistics/trips/:id/optimize", post(trip_optimize))
        .route("/logistics/drivers/ranking", get(driver_ranking))
        .route("/logistics/vehicles/fuel/predict", get(fuel_predict))
        .route("/forecast", post(demand_forecast))
        .route("/customers/scoring", get(customer_scoring))
        .route("/anomalies", get(anomalies))
        .route("/ai-insights/decide", post(ai_insights_decide))
        .route("/admin/ai-insights/:id/decision", post(admin_insights_decide))
        .route("/tenant/ai-insights/:id/decision", post(admin_insights_decide))
}

// ---------------------------------------------------------------------------
// Request shapes. These are the JSON bodies the tenant portal sends.
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct OptimizeRequest {
    #[serde(default)]
    trip_ids: Vec<String>,
    #[serde(default)]
    area: Option<String>,
    #[serde(default)]
    date: Option<String>,
}

#[derive(Debug, Deserialize)]
struct DriverRankingQuery {
    #[serde(default)]
    period: Option<String>,
    #[serde(default)]
    page: Option<u32>,
    #[serde(default)]
    limit: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct FuelPredictionQuery {
    #[serde(default)]
    vehicle_id: Option<String>,
    #[serde(default)]
    plate: Option<String>,
    #[serde(default)]
    date: Option<String>,
}

#[derive(Debug, Deserialize)]
struct DemandForecastRequest {
    #[serde(default)]
    period: Option<String>,
    #[serde(default)]
    from: Option<String>,
    #[serde(default)]
    to: Option<String>,
    #[serde(default)]
    warehouse_id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct AnomaliesQuery {
    #[serde(default)]
    kind: Option<String>,
    #[serde(default)]
    from: Option<String>,
    #[serde(default)]
    to: Option<String>,
    #[serde(default)]
    page: Option<u32>,
    #[serde(default)]
    limit: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct CustomerScoringQuery {
    #[serde(default)]
    customer_id: Option<String>,
    #[serde(default)]
    include_factors: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct AiInsightDecision {
    #[serde(default)]
    id: String,
    #[serde(default)]
    status: String,
    #[serde(default)]
    note: Option<String>,
}

// ---------------------------------------------------------------------------
// Shared helpers: permission checks and deterministic mock data.
// ---------------------------------------------------------------------------

/// FNV-1a so every request seeds the same predictions.
fn hash(value: &str) -> u64 {
    let mut hash: u64 = 14695981039346656037;
    for byte in value.as_bytes() {
        hash ^= *byte as u64;
        hash = hash.wrapping_mul(1099511628211);
    }
    hash
}

/// Simple deterministic generator (SplitMix64). The API has no real database
/// yet, so predictions are synthetic but stable for the same parameters.
struct Rng {
    state: u64,
}

impl Rng {
    fn seed(value: &str) -> Self {
        Self {
            state: hash(value) | 1,
        }
    }

    /// Next value in [0, 2^33).
    fn next(&mut self) -> u64 {
        self.state = self
            .state
            .wrapping_mul(6364136223846793005)
            .wrapping_add(1442695040888963407);
        self.state >>= 33;
        self.state
    }

    fn next_u64(&mut self) -> u64 {
        self.next()
    }

    fn next_range(&mut self, from: u64, to: u64) -> u64 {
        from + self.next() % (to + 1 - from)
    }
}

fn validate_semantic(status: &str) -> Result<(), ApiError> {
    if ["ACKNOWLEDGED", "ACTIONED", "DISMISSED"].contains(&status) {
        Ok(())
    } else {
        Err(ApiError::BadRequest(
            "Trạng thái khuyến nghị không hợp lệ: ACKNOWLEDGED, ACTIONED hoặc DISMISSED.".to_string(),
        ))
    }
}

// ---------------------------------------------------------------------------
// Route optimisation agent (`POST /logistics/trips/optimize`).
// ---------------------------------------------------------------------------

/// The per-trip endpoint exposes both `/logistics/trips/:id/optimize` (the
/// tenant portal form) and the batch endpoint `/logistics/trips/optimize`.

async fn trip_optimize_all(
    user: AuthUser,
    Json(payload): Json<OptimizeRequest>,
) -> Result<Json<Envelope<RouteOptimization>>, ApiError> {
    let trip_id = payload
        .trip_ids
        .first()
        .cloned()
        .unwrap_or_else(|| "TRP-TEMP".to_string());

    build_optimization(user, trip_id, payload).await
}

async fn trip_optimize(
    user: AuthUser,
    Path(trip_id): Path<String>,
    Json(payload): Json<OptimizeRequest>,
) -> Result<Json<Envelope<RouteOptimization>>, ApiError> {
    let trip_ids = payload.trip_ids.clone();
    let trip_id = if trip_ids.is_empty() {
        trip_id
    } else {
        trip_ids[0].clone()
    };

    build_optimization(user, trip_id, payload).await
}

async fn build_optimization(
    user: AuthUser,
    trip_id: String,
    payload: OptimizeRequest,
) -> Result<Json<Envelope<RouteOptimization>>, ApiError> {
    user.require(domain::Permission::AiWrite)?;

    let mut base =
        Rng::seed(&format!("{}/area/{}", trip_id, payload.area.clone().unwrap_or_default()));

    let addresses = [
        "45 Lê Thánh Tôn, Quận 1",
        "88 Nguyễn Huệ, Quận 1",
        "123 Đồng Khởi, Quận 1",
        "22 Trần Hưng Đạo, Quận 5",
        "60 đường số 1, Thủ Đức",
    ];

    // The agent re-orders the stops of the trip and recomputes the distance.
    let stops = (1..=5)
        .map(|sequence| {
            base.next();
            let address = addresses[(step(&mut base) as usize) % addresses.len()].to_string();
            OptimizedStop {
                sequence,
                address,
                eta: roulette(&mut base),
            }
        })
        .collect();

    let ordered = 120.0 + step(&mut base) as f64;
    let planned = ordered * 1.15;
    let saved = planned - ordered;

    let model = RouteOptimization {
        trip_id,
        originally_planned_distance_km: planned,
        optimized_distance_km: ordered,
        estimated_saved_distance_km: saved,
        estimated_saved_minutes: 8.0 + step(&mut base) as f64,
        improvement_pct: (saved / planned) * 100.0,
        stops,
        confidence: (88.0 + (base.next_range(0, 110) as f64) / 10.0).min(99.5),
        generated_at: chrono::Utc::now(),
    };

    Ok(Json(Envelope::new(model)))
}

/// One point of the base time stream.
fn step(base: &mut Rng) -> u64 {
    base.next_range(0, 90)
}

fn roulette(base: &mut Rng) -> chrono::DateTime<chrono::Utc> {
    chrono::Utc::now()
        .checked_add_signed(chrono::Duration::minutes(step(base) as i64))
        .unwrap_or_else(chrono::Utc::now)
}

// ---------------------------------------------------------------------------
// Driver ranking agent (`GET /logistics/drivers/ranking`).
// ---------------------------------------------------------------------------

async fn driver_ranking(
    user: AuthUser,
    Query(params): Query<DriverRankingQuery>,
) -> Result<Json<Page<DriverRankingRow>>, ApiError> {
    user.require(domain::Permission::AiRead)?;

    let period = params
        .period
        .clone()
        .unwrap_or_else(|| chrono::Utc::now().format("%Y-%m").to_string());

    let page = params.page.unwrap_or(1);
    let limit = params.limit.unwrap_or(50);

    let mut base = Rng::seed(&format!("ranking/{period}"));

    let names = [
        "Nguyễn Văn Tài",
        "Trần Minh Đức",
        "Lê Hoàng Anh",
        "Phạm Quốc Bảo",
        "Hoàng Văn Hùng",
        "Vũ Thị Lan",
        "Đỗ Tiến Thành",
        "Bùi Anh Tuấn",
    ];

    let mut rows = Vec::new();
    for (index, name) in names.iter().enumerate() {
        let trips = base.next_range(40, 680) as i64;
        let on_time = base.next_range(920, 1000) as f64 / 10.0;
        let eco = base.next_range(55, 100) as i32;
        let rating = base.next_range(35, 50) as f64 / 10.0;
        let incidents = base.next_range(0, 6) as i64;

        rows.push(DriverRankingRow {
            driver_id: format!("DRV-{:04}", 1000 + index),
            driver_name: name.to_string(),
            total_trips: trips,
            on_time_rate: on_time,
            eco_score: eco,
            rating,
            incidents,
            rank: index as i64 + 1,
        });
    }

    rows.sort_by(|a, b| {
        b.on_time_rate
            .partial_cmp(&a.on_time_rate)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    let total = rows.len() as i64;
    Ok(Json(Page::new(rows, total, page, limit)))
}

// ---------------------------------------------------------------------------
// Demand forecasting agent (`POST /forecast`).
// ---------------------------------------------------------------------------

async fn demand_forecast(
    user: AuthUser,
    Json(payload): Json<DemandForecastRequest>,
) -> Result<Json<Envelope<DemandForecast>>, ApiError> {
    user.require(domain::Permission::AiRead)?;

    let period = payload
        .period
        .clone()
        .unwrap_or_else(|| chrono::Utc::now().format("%Y-%m").to_string());

    let warehouse = payload
        .warehouse_id
        .clone()
        .unwrap_or_else(|| "WH-CORE".to_string());

    let start_of_month = chrono::DateTime::<chrono::Utc>::from_ymd_opt(2026, 11, 1)
        .expect("2026-11-01");

    let mut base = Rng::seed(&format!("forecast/{period}/{warehouse}"));

    let mut predictions = Vec::new();
    let mut total_demand = 0i64;
    for day in 0..7i64 {
        let date = start_of_month + chrono::Duration::days(day);
        let expected = 120 + base.next_range(0, 80) as i64;
        let spread = base.next_range(10, 25) as i64;
        predictions.push(DemandPrediction {
            date,
            expected_orders: expected,
            lower_bound: expected - spread,
            upper_bound: expected + spread,
        });
        total_demand += expected;
    }

    let model = DemandForecast {
        period,
        predictions,
        total_demand,
        confidence: (90.0 + (base.next_range(0, 90) as f64) / 10.0).min(99.5),
    };

    Ok(Json(Envelope::new(model)))
}

// ---------------------------------------------------------------------------
// Vehicle fuel prediction agent (`GET /logistics/vehicles/fuel/predict`).
// ---------------------------------------------------------------------------

async fn fuel_predict(
    user: AuthUser,
    Query(params): Query<FuelPredictionQuery>,
) -> Result<Json<Envelope<FuelPrediction>>, ApiError> {
    user.require(domain::Permission::AiRead)?;

    let vehicle = params
        .vehicle_id
        .clone()
        .or(params.plate.clone())
        .unwrap_or_default();

    if vehicle.is_empty() {
        return Err(ApiError::BadRequest(
            "Thiếu thông tin phương tiện (vehicle_id hoặc plate).".to_string(),
        ));
    }

    let period = params
        .date
        .clone()
        .unwrap_or_else(|| chrono::Utc::now().format("%Y-%m").to_string());

    let license_plate = format!("61CD {}", vehicle);

    let mut base = Rng::seed(&format!("fuel/{license_plate}/{period}"));

    let liters = 80.0 + base.next_range(0, 40) as f64;
    let cost = (liters * 21500.0) as i64;
    let co2 = (liters * 2.64) as f64;

    let model = FuelPrediction {
        vehicle_plate: license_plate,
        predicted_liters: liters,
        predicted_cost: cost,
        predicted_co2_kg: co2,
        confidence: (85.0 + (base.next_range(0, 130) as f64) / 10.0).min(99.0),
        period,
    };

    Ok(Json(Envelope::new(model)))
}

// ---------------------------------------------------------------------------
// Customer credit scoring agent (`GET /api/v1/customers/scoring`).
// ---------------------------------------------------------------------------

async fn customer_scoring(
    user: AuthUser,
    Query(params): Query<CustomerScoringQuery>,
) -> Result<Json<Envelope<CustomerCreditScore>>, ApiError> {
    user.require(domain::Permission::AiRead)?;

    let customer_id = params
        .customer_id
        .clone()
        .unwrap_or_else(|| "CUST-0001".to_string());

    let mut base = Rng::seed(&format!("scoring/{customer_id}"));

    let score = base.next_range(550, 850) as i64;
    let tier = if score >= 750 {
        "A (Tốt)"
    } else if score >= 650 {
        "B (Trung bình khá)"
    } else if score >= 550 {
        "C (Trung bình)"
    } else {
        "D (Thấp)"
    };

    let risk_level = if score >= 700 {
        "LOW"
    } else if score >= 550 {
        "MEDIUM"
    } else {
        "HIGH"
    };

    let factors = if params.include_factors.unwrap_or(true) {
        vec![
            CreditFactor {
                label: "Số đơn hàng tháng này".to_string(),
                value: 12.0,
                weight: 0.30,
            },
            CreditFactor {
                label: "Công nợ COD tồn".to_string(),
                value: 45_000_000.0,
                weight: 0.35,
            },
            CreditFactor {
                label: "Tỷ lệ giao đúng hạn".to_string(),
                value: 94.0,
                weight: 0.20,
            },
            CreditFactor {
                label: "Thời gian hợp tác (tháng)".to_string(),
                value: 18.0,
                weight: 0.15,
            },
        ]
    } else {
        Vec::new()
    };

    let model = CustomerCreditScore {
        customer_id,
        score,
        tier: tier.to_string(),
        risk_level: risk_level.to_string(),
        factors,
    };

    Ok(Json(Envelope::new(model)))
}

// ---------------------------------------------------------------------------
// Anomaly detection agent (`GET /api/v1/anomalies`).
// ---------------------------------------------------------------------------

async fn anomalies(
    user: AuthUser,
    Query(params): Query<AnomaliesQuery>,
) -> Result<Json<Page<Anomaly>>, ApiError> {
    user.require(domain::Permission::AiRead)?;

    let page = params.page.unwrap_or(1);
    let limit = params.limit.unwrap_or(50);

    let kind = params.kind.clone().unwrap_or_default();

    let kinds: Vec<String> = if kind.is_empty() {
        vec![
            "DEMAND_SPIKE".to_string(),
            "DEMAND_DROP".to_string(),
            "COST_SPIKE".to_string(),
            "FUEL_SPIKE".to_string(),
            "DELAY".to_string(),
            "INVENTORY".to_string(),
        ]
    } else {
        vec![kind]
    };

    let date = chrono::DateTime::<chrono::Utc>::from_ymd_opt(2026, 11, 1)
        .expect("2026-11-01");

    let mut rows = Vec::new();
    for kind in kinds {
        let anomaly_kind = match kind.as_str() {
            "DEMAND_SPIKE" => domain::AnomalyKind::DemandSpike,
            "DEMAND_DROP" => domain::AnomalyKind::DemandDrop,
            "COST_SPIKE" => domain::AnomalyKind::CostSpike,
            "FUEL_SPIKE" => domain::AnomalyKind::FuelSpike,
            "DELAY" => domain::AnomalyKind::Delay,
            "INVENTORY" => domain::AnomalyKind::Inventory,
            _ => domain::AnomalyKind::DemandSpike,
        };

        let mut engine = Rng::seed(&format!("anomalies/{kind}"));

        rows.push(Anomaly {
            id: format!("ANM-{}", engine.next_u64() >> 16),
            kind: anomaly_kind,
            entity_type: "order".to_string(),
            entity_ref: format!("SLG-{}", 1000 + (engine.next_u64() % 9000)),
            severity: if engine.next_u64() % 100 < 20 {
                "HIGH".to_string()
            } else {
                "MEDIUM".to_string()
            },
            detected_at: date + chrono::Duration::seconds((engine.next_u64() % (86_400 * 30)) as i64),
            description: format!(
                "Phát hiện bất thường {kind} giữa biểu diễn lịch sử (synthetic stub)."
            ),
            pattern: (0..3)
                .map(|_| (engine.next_range(10, 990) as f64) / 10.0)
                .collect(),
        });
    }

    rows.sort_by(|a, b| b.detected_at.cmp(&a.detected_at));

    let total = rows.len() as i64;
    Ok(Json(Page::new(rows, total, page, limit)))
}

// ---------------------------------------------------------------------------
// Decision support agent (`POST /api/v1/ai-insights/decide`).
// ---------------------------------------------------------------------------

async fn ai_insights_decide(
    user: AuthUser,
    Json(payload): Json<AiInsightDecision>,
) -> Result<Json<Envelope<AiDecision>>, ApiError> {
    user.require(domain::Permission::AiWrite)?;

    validate_semantic(&payload.status)?;

    let model = AiDecision {
        decision_id: payload.id,
        decision: format!("decision_{}", payload.status),
        confidence: 0.91,
        decided_at: chrono::Utc::now(),
    };

    Ok(Json(Envelope::new(model)))
}

// ---------------------------------------------------------------------------
// Decision support agent, route form exposed to the admin module:
// `POST /api/v1/admin/ai-insights/:id/decision`.
// ---------------------------------------------------------------------------

async fn admin_insights_decide(
    user: AuthUser,
    Path(id): Path<String>,
    Json(payload): Json<AiInsightDecision>,
) -> Result<Json<Envelope<AiDecision>>, ApiError> {
    let mut row: AiInsightDecision = payload;
    if row.id.is_empty() {
        row.id = id;
    }
    ai_insights_decide(user, Json(row)).await
}
