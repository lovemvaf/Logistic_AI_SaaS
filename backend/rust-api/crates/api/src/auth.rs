use async_trait::async_trait;
use axum::{
    extract::FromRequestParts,
    http::{header::AUTHORIZATION, request::Parts},
};
use domain::{Claims, Permission};
use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};

use crate::{error::ApiError, state::AppState};

/// Authenticated caller. Extracting this type rejects the request with 401
/// before any handler body runs, which keeps unprotected routes explicit.
pub struct AuthUser(pub Claims);

impl AuthUser {
    pub fn require(&self, permission: Permission) -> Result<(), ApiError> {
        if self.0.allows(permission) {
            Ok(())
        } else {
            Err(ApiError::Forbidden)
        }
    }

    pub fn is_super_admin(&self) -> bool {
        self.0.role == "SUPER_ADMIN"
    }
}

#[async_trait]
impl FromRequestParts<AppState> for AuthUser {
    type Rejection = ApiError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let header = parts
            .headers
            .get(AUTHORIZATION)
            .and_then(|value| value.to_str().ok())
            .ok_or(ApiError::Unauthorized)?;

        let token = header
            .strip_prefix("Bearer ")
            .or_else(|| header.strip_prefix("bearer "))
            .ok_or(ApiError::Unauthorized)?;

        let mut validation = Validation::new(Algorithm::HS256);
        validation.validate_exp = true;
        validation.leeway = 5;

        let decoded = decode::<Claims>(
            token,
            &DecodingKey::from_secret(state.config.jwt_secret.as_bytes()),
            &validation,
        )
        .map_err(|error| {
            tracing::debug!(error = %error, "jwt rejected");
            ApiError::Unauthorized
        })?;

        // Tenant isolation: the schema name comes from the token, never from a
        // header or query parameter, and is validated before any SQL uses it.
        if decoded.claims.tenant_slug.is_empty() {
            return Err(ApiError::Unauthorized);
        }

        Ok(Self(decoded.claims))
    }
}
