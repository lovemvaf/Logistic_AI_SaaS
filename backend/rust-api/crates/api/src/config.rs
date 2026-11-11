use std::{
    env,
    net::SocketAddr,
    str::FromStr,
};

use anyhow::{Context, Result};

#[derive(Debug, Clone)]
pub struct Config {
    pub app_env: String,
    pub port: u16,
    pub database_url: String,
    pub db_max_connections: u32,
    pub jwt_secret: String,
    pub allowed_origins: Vec<String>,
    pub request_timeout_secs: u64,
}

fn parse_or<T>(key: &str, default: T) -> Result<T>
where
    T: FromStr,
    T::Err: std::fmt::Display,
{
    match env::var(key) {
        Ok(raw) if !raw.trim().is_empty() => raw
            .trim()
            .parse::<T>()
            .map_err(|error| anyhow::anyhow!("{key} is invalid: {error}")),
        _ => Ok(default),
    }
}

impl Config {
    pub fn from_env() -> Result<Self> {
        let app_env = env::var("APP_ENV").unwrap_or_else(|_| "development".to_string());

        let database_url = env::var("DATABASE_URL")
            .context("DATABASE_URL is required (same value as backend/core-api)")?;

        let jwt_secret = env::var("JWT_SECRET").unwrap_or_else(|_| {
            "dev-only-change-me-smartlogi-secret-please-rotate".to_string()
        });

        if app_env == "production" && jwt_secret.len() < 32 {
            anyhow::bail!("JWT_SECRET must be at least 32 characters in production");
        }

        let allowed_origins = env::var("ALLOWED_ORIGINS")
            .unwrap_or_default()
            .split(',')
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToString::to_string)
            .collect();

        Ok(Self {
            app_env,
            port: parse_or("PORT", 8080u16)?,
            database_url,
            db_max_connections: parse_or("DB_MAX_CONNECTIONS", 10u32)?,
            jwt_secret,
            allowed_origins,
            request_timeout_secs: parse_or("REQUEST_TIMEOUT_SECS", 30u64)?,
        })
    }

    pub fn is_production(&self) -> bool {
        self.app_env == "production"
    }

    pub fn socket_addr(&self) -> SocketAddr {
        SocketAddr::from(([0, 0, 0, 0], self.port))
    }
}
