//! Persistence primitives. The schema remains owned by `packages/prisma-schemas`
//! until the migration is complete; this crate only opens the pool and guards
//! tenant schema names.

pub mod db;
pub mod tenancy;

pub use db::{connect, ping};
pub use tenancy::safe_schema_name;
