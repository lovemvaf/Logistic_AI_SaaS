use std::time::Duration;

use axum::{
    http::{
        header::{ACCEPT, AUTHORIZATION, CONTENT_TYPE},
        HeaderName, HeaderValue, Method,
    },
    Router,
};
use tower_http::{
    cors::{AllowOrigin, Any, CorsLayer},
    request_id::{MakeRequestUuid, PropagateRequestIdLayer, SetRequestIdLayer},
    timeout::TimeoutLayer,
    trace::TraceLayer,
};

use crate::{routes, state::AppState};

fn cors_layer(state: &AppState) -> CorsLayer {
    let request_id = HeaderName::from_static("x-request-id");
    let tenant_slug = HeaderName::from_static("x-tenant-slug");
    let portal = HeaderName::from_static("x-portal");

    let headers = [
        AUTHORIZATION,
        CONTENT_TYPE,
        ACCEPT,
        request_id,
        tenant_slug,
        portal,
    ];

    if state.config.allowed_origins.is_empty() {
        // Development default. Production must set ALLOWED_ORIGINS.
        CorsLayer::new()
            .allow_origin(AllowOrigin::any())
            .allow_methods(Any)
            .allow_headers(headers)
    } else {
        let origins: Vec<HeaderValue> = state
            .config
            .allowed_origins
            .iter()
            .filter_map(|origin| HeaderValue::from_str(origin).ok())
            .collect();

        CorsLayer::new()
            .allow_origin(AllowOrigin::list(origins))
            .allow_methods([
                Method::GET,
                Method::POST,
                Method::PATCH,
                Method::PUT,
                Method::DELETE,
                Method::OPTIONS,
            ])
            .allow_headers(headers)
            .allow_credentials(true)
    }
}

pub fn router(state: AppState) -> Router {
    let timeout = Duration::from_secs(state.config.request_timeout_secs.max(5));
    let cors = cors_layer(&state);

    Router::new()
        .nest("/api/v1", routes::router())
        .layer(PropagateRequestIdLayer::new(HeaderName::from_static(
            "x-request-id",
        )))
        .layer(SetRequestIdLayer::new(
            HeaderName::from_static("x-request-id"),
            MakeRequestUuid,
        ))
        .layer(TraceLayer::new_for_http())
        .layer(TimeoutLayer::new(timeout))
        .layer(cors)
        .with_state(state)
}
