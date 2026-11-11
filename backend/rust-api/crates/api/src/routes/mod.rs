pub mod admin;
pub mod ai;
pub mod auth;
pub mod dashboard;
pub mod finance;
pub mod health;
pub mod inventory;
pub mod logistics;
pub mod meta;
pub mod orders;
pub mod reports;
pub mod tenant;
pub mod wms;

use axum::Router;

use crate::state::AppState;

/// Every path is served under `/api/v1`, exactly like the NestJS gateway.
/// Modules that have not been ported yet answer `501 not_implemented` after the
/// JWT extractor has already rejected unauthenticated calls.
pub fn router() -> Router<AppState> {
    Router::new()
        .merge(health::router())
        .merge(meta::router())
        .merge(auth::router())
        .merge(dashboard::router())
        .merge(ai::router())
        .merge(orders::router())
        .merge(inventory::router())
        .merge(wms::router())
        .merge(logistics::router())
        .merge(finance::router())
        .merge(reports::router())
        .merge(tenant::router())
        .merge(admin::router())
}
