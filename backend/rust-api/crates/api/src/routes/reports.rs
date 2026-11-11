use axum::{routing::any, Router};

use crate::{auth::AuthUser, error::ApiError, state::AppState};

/// Báo cáo tenant: tổng hợp, đúng hạn, chi phí, đội xe. Chỉ yêu cầu người gọi
/// đã xác thực, không cần quyền cụ thể vì dữ liệu bó tenant.
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/reports/summary", any(guard))
        .route("/reports/on-time", any(guard))
        .route("/reports/costs", any(guard))
        .route("/reports/fleet", any(guard))
}

async fn guard(_user: AuthUser) -> ApiError {
    ApiError::NotImplemented
}
