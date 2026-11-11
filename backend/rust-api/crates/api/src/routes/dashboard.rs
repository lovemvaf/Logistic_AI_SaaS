use axum::{routing::get, Router};

use crate::{auth::AuthUser, error::ApiError, state::AppState};

pub fn router() -> Router<AppState> {
    Router::new().route("/dashboard/summary", get(summary))
}

async fn summary(_user: AuthUser) -> ApiError {
    ApiError::NotImplemented
}
