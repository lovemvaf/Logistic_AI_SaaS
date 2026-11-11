//! Pure domain types shared by the HTTP layer and the persistence layer.
//!
//! No database or framework dependency lives here. The NestJS implementation
//! remains the source of truth until each module is migrated.

pub mod auth;
pub mod models;

pub use auth::{Claims, Permission, Role};
pub use models::*;
