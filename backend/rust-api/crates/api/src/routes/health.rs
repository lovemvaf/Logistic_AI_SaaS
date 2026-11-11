use axum::{
    extract::State,
    http::StatusCode,
    routing::get,
    Json, Router,
};
use domain::Envelope;
use serde::Serialize;

use crate::state::AppState;

#[derive(Serialize)]
struct HealthBody {
    status: &'static str,
    service: &'static str,
    version: &'static str,
    environment: String,
    database: bool,
}

pub fn router() -> Router<AppState> {
    Router::new().route("/health", get(health))
}

async fn health(State(state): State<AppState>) -> (StatusCode, Json<Envelope<HealthBody>>) {
    let database = infra::ping(&state.db).await;
    let status = if database {
        StatusCode::OK
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    };

    (
        status,
        Json(Envelope::new(HealthBody {
            status: if database { "ok" } else { "degraded" },
            service: "smartlogi-rust-api",
            version: env!("CARGO_PKG_VERSION"),
            environment: state.config.app_env.clone(),
            database,
        })),
    )
}
