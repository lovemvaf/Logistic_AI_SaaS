use axum::{routing::post, Json, Router};
use domain::{AuthTokens, Envelope};
use serde::Deserialize;

use crate::{error::ApiError, state::AppState};

#[derive(Debug, Deserialize)]
struct LoginRequest {
    email: String,
    #[serde(default)]
    password: String,
    #[serde(default)]
    tenant_slug: Option<String>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/auth/login", post(login))
        .route("/tenant/auth/login", post(login))
}

/// Passwords are verified by the IAM module. Until it is ported, this endpoint
/// refuses to mint tokens rather than accepting unverified credentials.
async fn login(Json(_payload): Json<LoginRequest>) -> Result<Json<Envelope<AuthTokens>>, ApiError> {
    Err(ApiError::NotImplemented)
}
