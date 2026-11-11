use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Money is always integer VND. Never use floats for currency.
pub type Vnd = i64;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PageMeta {
    pub total: i64,
    pub page: u32,
    pub limit: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Page<T> {
    pub data: Vec<T>,
    pub meta: PageMeta,
}

impl<T> Page<T> {
    pub fn new(data: Vec<T>, total: i64, page: u32, limit: u32) -> Self {
        Self {
            data,
            meta: PageMeta { total, page, limit },
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Envelope<T> {
    pub data: T,
}

impl<T> Envelope<T> {
    pub fn new(data: T) -> Self {
        Self { data }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum OrderStatus {
    New,
    Unassigned,
    PendingPickup,
    Picking,
    Packed,
    InTransit,
    OutForDelivery,
    Delivered,
    Failed,
    ReturnRequested,
    Returned,
    Cancelled,
}

/// Order statuses interleaved in delivery progression order. A status only moves
/// along this list, so the position of a status encodes the allowed direction:
/// no move backward, no move out of a terminal state. `Cancelled` is the only
/// terminal state reachable from any state because it is the last entry.
const STATUS_ORDER: [OrderStatus; 12] = [
    OrderStatus::New,
    OrderStatus::Unassigned,
    OrderStatus::PendingPickup,
    OrderStatus::Picking,
    OrderStatus::Packed,
    OrderStatus::InTransit,
    OrderStatus::OutForDelivery,
    OrderStatus::Delivered,
    OrderStatus::Failed,
    OrderStatus::ReturnRequested,
    OrderStatus::Returned,
    OrderStatus::Cancelled,
];

impl OrderStatus {
    /// Terminal states cannot be moved forward; only `Cancelled` is reachable
    /// from a non-terminal state.
    pub fn is_terminal(self) -> bool {
        matches!(
            self,
            Self::Delivered | Self::Returned | Self::Cancelled | Self::Failed
        )
    }

    /// Progression order of the delivery statuses. A status only moves along
    /// this list, so the list encodes what the domain allows: no move backward,
    /// no move out of a terminal state. `Cancelled` is the only terminal state
    /// reachable from every other state.
    pub fn can_move_to(self, target: OrderStatus) -> bool {
        if self.is_terminal() || target == self {
            return false;
        }
        if target == OrderStatus::Cancelled {
            return true;
        }
        target.order_index() > self.order_index()
    }

    /// Position inside `STATUS_ORDER`. The fallback is `usize::MAX` because the
    /// array contains every variant of the enum anyway.
    fn order_index(self) -> usize {
        STATUS_ORDER
            .iter()
            .position(|value| *value == self)
            .unwrap_or(usize::MAX)
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TripStatus {
    Planned,
    Dispatched,
    InProgress,
    Completed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrderSummary {
    pub id: uuid::Uuid,
    pub tracking_code: String,
    pub client_name: String,
    pub recipient_name: String,
    pub province: String,
    pub status: OrderStatus,
    pub cod_amount: Vnd,
    pub weight_kg: f64,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InventoryRow {
    pub id: uuid::Uuid,
    pub sku: String,
    pub product_name: String,
    pub warehouse_code: String,
    pub bin_code: String,
    pub lot_no: String,
    pub quantity: i32,
    pub reserved: i32,
    pub available: i32,
    pub expiry_date: Option<chrono::NaiveDate>,
    pub version: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TripSummary {
    pub id: uuid::Uuid,
    pub code: String,
    pub driver_name: String,
    pub vehicle_plate: String,
    pub status: TripStatus,
    pub planned_distance_km: f64,
    pub cod_expected: Vnd,
    pub started_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodRemittance {
    pub id: uuid::Uuid,
    pub code: String,
    pub driver_name: String,
    pub trip_code: String,
    pub expected_amount: Vnd,
    pub submitted_amount: Vnd,
    pub variance: Vnd,
    pub status: String,
    pub bank_ref: Option<String>,
    pub reconciled_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DashboardSummary {
    pub open_orders: i64,
    pub orders_today: i64,
    pub late_orders: i64,
    pub active_waves: i64,
    pub active_trips: i64,
    pub unassigned_orders: i64,
    pub cod_pending: Vnd,
    pub inventory_accuracy: f64,
    pub out_of_stock_skus: i64,
    pub sos_open: i64,
    pub returns_open: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TenantSummary {
    pub id: uuid::Uuid,
    pub slug: String,
    pub name: String,
    pub plan: String,
    pub status: String,
    pub user_count: i64,
    pub monthly_revenue: Vnd,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthTokens {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_in: i64,
}

// ---------------------------------------------------------------------------
// AI features (forecasting, optimisation, anomaly detection, scoring).
// ---------------------------------------------------------------------------

/// Re-ordered delivery plan produced by the route optimisation agent.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RouteOptimization {
    pub trip_id: String,
    pub originally_planned_distance_km: f64,
    pub optimized_distance_km: f64,
    pub estimated_saved_distance_km: f64,
    pub estimated_saved_minutes: f64,
    pub improvement_pct: f64,
    pub stops: Vec<OptimizedStop>,
    pub confidence: f64,
    pub generated_at: DateTime<Utc>,
}

/// A stop of the optimised route, in the order the agent recommends.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptimizedStop {
    pub sequence: u32,
    pub address: String,
    pub eta: DateTime<Utc>,
}

/// One row of the driver ranking table produced by the AI agent.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DriverRankingRow {
    pub driver_id: String,
    pub driver_name: String,
    pub total_trips: i64,
    pub on_time_rate: f64,
    pub eco_score: i32,
    pub rating: f64,
    pub incidents: i64,
    pub rank: i64,
}

/// Demand forecast produced by the forecasting agent.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DemandForecast {
    pub period: String,
    pub predictions: Vec<DemandPrediction>,
    pub total_demand: i64,
    pub confidence: f64,
}

/// One day of the demand forecast.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DemandPrediction {
    pub date: DateTime<Utc>,
    pub expected_orders: i64,
    pub lower_bound: i64,
    pub upper_bound: i64,
}

/// Fuel consumption prediction for a vehicle.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FuelPrediction {
    pub vehicle_plate: String,
    pub predicted_liters: f64,
    pub predicted_cost: Vnd,
    pub predicted_co2_kg: f64,
    pub confidence: f64,
    pub period: String,
}

/// Credit score for a B2B customer.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomerCreditScore {
    pub customer_id: String,
    pub score: i64,
    pub tier: String,
    pub risk_level: String,
    pub factors: Vec<CreditFactor>,
}

/// One factor that makes up a credit score.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreditFactor {
    pub label: String,
    pub value: f64,
    pub weight: f64,
}

/// One detected anomaly in the forecasts backtest or in live telemetry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Anomaly {
    pub id: String,
    pub kind: AnomalyKind,
    pub entity_type: String,
    pub entity_ref: String,
    pub severity: String,
    pub detected_at: DateTime<Utc>,
    pub description: String,
    pub pattern: Vec<f64>,
}

/// The class of an anomaly detected by the anomaly detection agent.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AnomalyKind {
    DemandSpike,
    DemandDrop,
    CostSpike,
    FuelSpike,
    Delay,
    Inventory,
}

/// Confirmation that the agent's recommendation was accepted or rejected.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiDecision {
    pub decision_id: String,
    pub decision: String,
    pub confidence: f64,
    pub decided_at: DateTime<Utc>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn forward_transitions_only() {
        // A status only moves along the delivery order.
        assert!(OrderStatus::New.can_move_to(OrderStatus::Unassigned));
        assert!(OrderStatus::Unassigned.can_move_to(OrderStatus::Delivered));
        assert!(OrderStatus::Picking.can_move_to(OrderStatus::Cancelled));
        assert!(!OrderStatus::Failed.can_move_to(OrderStatus::ReturnRequested));

        // Nothing comes after `Cancelled`, and a terminal state never moves.
        assert!(!OrderStatus::Cancelled.can_move_to(OrderStatus::New));
        assert!(!OrderStatus::Cancelled.can_move_to(OrderStatus::Cancelled));
        assert!(!OrderStatus::Delivered.can_move_to(OrderStatus::Picking));
        assert!(!OrderStatus::Packed.can_move_to(OrderStatus::Picking));
        assert!(!OrderStatus::Picking.can_move_to(OrderStatus::Unassigned));
        assert!(!OrderStatus::New.can_move_to(OrderStatus::New));
    }
}
