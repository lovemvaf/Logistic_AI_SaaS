use axum::{routing::any, Router};
use domain::Permission;

use crate::{auth::AuthUser, error::ApiError, state::AppState};

/// Đơn hàng. Mỗi path được khai báo cụ thể; không dùng `*rest` vì matchit
/// không cho một node có `:id` vừa có wildcard `*rest`.
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/orders", any(guard))
        .route("/orders/:id", any(guard))
        .route("/orders/track/:code", any(guard))
        .route("/orders/assign-trip", any(guard))
        .route("/orders/:id/status", any(guard))
        .route("/orders/:id/partial", any(guard))
        .route("/orders/:id/reschedule", any(guard))
        .route("/orders/:id/live", any(guard))
        .route("/orders/:id/sla", any(guard))
}

/// Gate: yêu cầu quyền read bất kỳ path nào trong nhóm.
async fn guard(user: AuthUser) -> ApiError {
    match user.require(Permission::OrderRead) {
        Ok(()) => ApiError::NotImplemented,
        Err(error) => error,
    }
}
