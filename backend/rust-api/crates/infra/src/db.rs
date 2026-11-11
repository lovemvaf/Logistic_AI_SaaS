use std::time::Duration;

use sqlx::postgres::{PgPool, PgPoolOptions};

/// Open the shared PostgreSQL pool.
///
/// Tenant data is isolated with row-level security; the connection role must
/// not be a superuser (same `APP_DB_USER` rule as `backend/core-api`).
pub async fn connect(database_url: &str, max_connections: u32) -> anyhow::Result<PgPool> {
    let pool = PgPoolOptions::new()
        .max_connections(max_connections.max(1))
        .min_connections(1)
        .acquire_timeout(Duration::from_secs(10))
        .idle_timeout(Some(Duration::from_secs(300)))
        .connect(database_url)
        .await?;

    tracing::info!(max_connections, "postgres pool ready");
    Ok(pool)
}

/// Cheap readiness probe used by `/api/v1/health`.
pub async fn ping(pool: &PgPool) -> bool {
    sqlx::query_scalar::<_, i32>("SELECT 1")
        .fetch_one(pool)
        .await
        .is_ok()
}
