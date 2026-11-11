use axum::{routing::any, Router};
use domain::Permission;

use crate::{auth::AuthUser, error::ApiError, state::AppState};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/wms/products", any(guard))
        .route("/wms/products/:id", any(guard))
        .route("/wms/waves", any(guard))
        .route("/wms/waves/:id", any(guard))
        .route("/wms/waves/allocate", any(guard))
        .route("/wms/tasks", any(guard))
        .route("/wms/tasks/:id", any(guard))
        .route("/wms/tasks/:id/confirm", any(guard))
        .route("/wms/equipment", any(guard))
        .route("/wms/equipment/:id", any(guard))
        .route("/wms/packing-sessions", any(guard))
        .route("/wms/packing-sessions/:id", any(guard))
        .route("/wms/packing-sessions/:id/seal", any(guard))
}

/// Module WMS: wave + tasks + packing là trung tâm của `BatchRead/WaveRead`.
async fn guard(user: AuthUser) -> ApiError {
    match user.require(Permission::WaveRead) {
        Ok(()) => ApiError::NotImplemented,
        Err(error) => error,
    }
}
