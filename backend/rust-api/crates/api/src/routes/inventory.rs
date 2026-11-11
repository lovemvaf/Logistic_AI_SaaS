use axum::{routing::any, Router};
use domain::Permission;

use crate::{auth::AuthUser, error::ApiError, state::AppState};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/inventory", any(guard))
        .route("/inventory/:id", any(guard))
        .route("/inventory/adjust", any(guard))
        .route("/inventory/receive", any(guard))
        .route("/inventory/putaway-suggestion", any(guard))
        .route("/inventory/ledger", any(guard))
        .route("/inventory/ledger/:id", any(guard))
        .route("/inventory/cycle-counts", any(guard))
        .route("/inventory/cycle-counts/:id", any(guard))
        .route("/inventory/cycle-counts/:id/submit", any(guard))
        .route("/inventory/cycle-counts/:id/approve", any(guard))
}

async fn guard(user: AuthUser) -> ApiError {
    match user.require(Permission::InventoryRead) {
        Ok(()) => ApiError::NotImplemented,
        Err(error) => error,
    }
}
