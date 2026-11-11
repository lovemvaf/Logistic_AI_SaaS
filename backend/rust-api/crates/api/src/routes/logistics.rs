use axum::{routing::any, Router};
use domain::Permission;

use crate::{auth::AuthUser, error::ApiError, state::AppState};

/// Logistics: trips, drivers, vehicles, geofences, SOS, returns. Hai path
/// `_optimize`-thứ (optimal) và `fuel/predict` đã có sẵn ở `ai.rs`, nên không
/// đăng lại ở đây, kẻo matchit báo xung đột node wildcard.
pub fn router() -> Router<AppState> {
    Router::new()
        // chuyến
        .route("/logistics/trips", any(guard))
        .route("/logistics/trips/:id", any(guard))
        .route("/logistics/trips/assign", any(guard))
        .route("/logistics/trips/pod", any(guard))
        .route("/logistics/trips/:id/pod", any(guard))
        .route("/logistics/trips/:id/start", any(guard))
        .route("/logistics/trips/:id/complete", any(guard))
        // tài xế
        .route("/logistics/drivers", any(guard))
        .route("/logistics/drivers/:id", any(guard))
        .route("/logistics/drivers/:id/trip-log", any(guard))
        // phương tiện
        .route("/logistics/vehicles", any(guard))
        .route("/logistics/vehicles/:id", any(guard))
        .route("/logistics/vehicles/fuel", any(guard))
        .route("/logistics/vehicles/maintenance", any(guard))
        // geofence
        .route("/logistics/geofences", any(guard))
        .route("/logistics/geofences/:id", any(guard))
        // SOS
        .route("/logistics/sos", any(guard))
        .route("/logistics/sos/:id", any(guard))
        .route("/logistics/sos/:id/acknowledge", any(guard))
        .route("/logistics/sos/:id/resolve", any(guard))
        // trả hàng
        .route("/logistics/returns", any(guard))
        .route("/logistics/returns/:id", any(guard))
        .route("/logistics/returns/:id/inspect", any(guard))
        .route("/logistics/returns/:id/refund", any(guard))
}

async fn guard(user: AuthUser) -> ApiError {
    // Drivers mang `trip:self`; các endpoint danh sách mở cho họ, handler sẽ
    // thu hẹp theo chuyến của mình khi được chuyển.
    let allowed = user.require(Permission::TripRead).is_ok()
        || user.0.permissions.iter().any(|value| value == "trip:self");

    if allowed {
        ApiError::NotImplemented
    } else {
        ApiError::Forbidden
    }
}
