use axum::{routing::any, Router};

use crate::{auth::AuthUser, error::ApiError, state::AppState};

/// Platform administration. Only `SUPER_ADMIN` passes, matching the
/// `admin-portal` scope.
pub fn router() -> Router<AppState> {
    Router::new()
        // khách hàng doanh nghiệp
        .route("/admin/clients", any(guard))
        .route("/admin/clients/:id", any(guard))
        .route("/admin/clients/:id/credit", any(guard))
        // key
        .route("/admin/api-keys", any(guard))
        .route("/admin/api-keys/:id", any(guard))
        .route("/admin/api-keys/:id/revoke", any(guard))
        // nhật ký
        .route("/admin/audit-logs", any(guard))
        .route("/admin/audit-logs/:id", any(guard))
        // webhook
        .route("/admin/webhooks", any(guard))
        .route("/admin/webhooks/:id", any(guard))
        .route("/admin/webhooks/:id/status", any(guard))
        // khuyến nghị AI (`:id/decision` nằm ở `ai.rs`)
        .route("/admin/ai-insights", any(guard))
        .route("/admin/ai-insights/:id", any(guard))
}

async fn guard(user: AuthUser) -> ApiError {
    if user.is_super_admin() {
        ApiError::NotImplemented
    } else {
        ApiError::Forbidden
    }
}
