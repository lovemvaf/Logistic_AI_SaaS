use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;

/// Uniform error body. The frontend already reads `message`, so the shape is
/// kept identical to the NestJS gateway.
#[derive(Debug, thiserror::Error)]
pub enum ApiError {
    #[error("unauthorized")]
    Unauthorized,

    #[error("forbidden")]
    Forbidden,

    #[error("{0}")]
    BadRequest(String),

    #[error("{0}")]
    NotFound(String),

    #[error("{0}")]
    Conflict(String),

    #[error("not implemented yet")]
    NotImplemented,

    #[error(transparent)]
    Database(#[from] sqlx::Error),

    #[error("{0}")]
    Internal(String),
}

impl From<anyhow::Error> for ApiError {
    fn from(error: anyhow::Error) -> Self {
        Self::Internal(error.to_string())
    }
}

impl ApiError {
    fn code(&self) -> &'static str {
        match self {
            Self::Unauthorized => "unauthorized",
            Self::Forbidden => "forbidden",
            Self::BadRequest(_) => "bad_request",
            Self::NotFound(_) => "not_found",
            Self::Conflict(_) => "conflict",
            Self::NotImplemented => "not_implemented",
            Self::Database(_) | Self::Internal(_) => "internal_error",        }
    }

    fn status(&self) -> StatusCode {
        match self {
            Self::Unauthorized => StatusCode::UNAUTHORIZED,
            Self::Forbidden => StatusCode::FORBIDDEN,
            Self::BadRequest(_) => StatusCode::BAD_REQUEST,
            Self::NotFound(_) => StatusCode::NOT_FOUND,
            Self::Conflict(_) => StatusCode::CONFLICT,
            Self::NotImplemented => StatusCode::NOT_IMPLEMENTED,
            Self::Database(_) | Self::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let status = self.status();

        // Internal details are logged, never returned to the client.
        let message = match &self {
            Self::Database(error) => {
                tracing::error!(error = %error, "database error");
                "Lỗi máy chủ. Vui lòng thử lại sau.".to_string()
            }
            Self::Internal(error) => {
                tracing::error!(error = %error, "internal error");
                "Lỗi máy chủ. Vui lòng thử lại sau.".to_string()
            }
            Self::NotImplemented => {
                "Route đã được khai báo nhưng module này chưa chuyển sang Rust.".to_string()
            }
            other => other.to_string(),
        };

        (
            status,
            Json(json!({
                "error": self.code(),
                "message": message,
                "statusCode": status.as_u16(),
            })),
        )
            .into_response()
    }
}
