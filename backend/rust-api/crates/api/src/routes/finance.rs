use axum::{routing::any, Router};
use domain::Permission;

use crate::{auth::AuthUser, error::ApiError, state::AppState};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/finance/cod-remittances", any(guard))
        .route("/finance/cod-remittances/:id", any(guard))
        .route("/finance/cod-remittances/:id/submit", any(guard))
        .route("/finance/cod-remittances/:id/reconcile", any(guard))
        .route("/finance/bank-transactions", any(guard))
        .route("/finance/bank-transactions/:id", any(guard))
        .route("/finance/expenses", any(guard))
        .route("/finance/expenses/:id", any(guard))
        .route("/finance/expenses/:id/decision", any(guard))
        .route("/finance/invoices", any(guard))
        .route("/finance/invoices/:id", any(guard))
        .route("/finance/invoices/:id/payments", any(guard))
}

async fn guard(user: AuthUser) -> ApiError {
    match user.require(Permission::CodRead) {
        Ok(()) => ApiError::NotImplemented,
        Err(error) => error,
    }
}
