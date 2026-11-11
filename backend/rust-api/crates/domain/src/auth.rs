use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Role {
    SuperAdmin,
    TenantAdmin,
    WarehouseManager,
    WarehouseStaff,
    LogisticsManager,
    Driver,
    CustomerClient,
    TenantUser,
}

impl Role {
    pub fn from_claim(value: &str) -> Option<Self> {
        match value {
            "SUPER_ADMIN" => Some(Self::SuperAdmin),
            "TENANT_ADMIN" => Some(Self::TenantAdmin),
            "WAREHOUSE_MANAGER" => Some(Self::WarehouseManager),
            "WAREHOUSE_STAFF" => Some(Self::WarehouseStaff),
            "LOGISTICS_MANAGER" => Some(Self::LogisticsManager),
            "DRIVER" => Some(Self::Driver),
            "CUSTOMER_CLIENT" => Some(Self::CustomerClient),
            "TENANT_USER" => Some(Self::TenantUser),
            _ => None,
        }
    }

    /// Permissions are also embedded in the JWT by the IAM module. This mapping
    /// is only the fallback used when a token was issued before scopes existed.
    pub fn default_permissions(self) -> &'static [&'static str] {
        match self {
            Self::SuperAdmin | Self::TenantAdmin => &["*"],
            Self::WarehouseManager => &[
                "inventory:read",
                "inventory:write",
                "wave:read",
                "wave:write",
                "cycle_count:write",
                "product:write",
                "pack:write",
                "ai:read",
                "ai:write",
            ],
            Self::WarehouseStaff => &[
                "inventory:read",
                "wave:read",
                "pack:write",
                "cycle_count:read",
            ],
            Self::LogisticsManager => &[
                "trip:read",
                "trip:write",
                "driver:write",
                "gps:read",
                "sos:write",
                "cod:read",
                "ai:read",
                "ai:write",
            ],
            Self::Driver => &["trip:self", "gps:write", "cod:submit"],
            Self::CustomerClient => &["order:self", "invoice:self"],
            Self::TenantUser => &["order:read", "inventory:read"],
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Permission {
    OrderRead,
    OrderWrite,
    InventoryRead,
    InventoryWrite,
    WaveRead,
    WaveWrite,
    TripRead,
    TripWrite,
    SosWrite,
    CodRead,
    CodWrite,
    UserWrite,
    ApiKeyWrite,
    SettingsWrite,
    AiRead,
    AiWrite,
}

impl Permission {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::OrderRead => "order:read",
            Self::OrderWrite => "order:write",
            Self::InventoryRead => "inventory:read",
            Self::InventoryWrite => "inventory:write",
            Self::WaveRead => "wave:read",
            Self::WaveWrite => "wave:write",
            Self::TripRead => "trip:read",
            Self::TripWrite => "trip:write",
            Self::SosWrite => "sos:write",
            Self::CodRead => "cod:read",
            Self::CodWrite => "cod:write",
            Self::UserWrite => "user:write",
            Self::ApiKeyWrite => "apikey:write",
            Self::SettingsWrite => "settings:write",
            Self::AiRead => "ai:read",
            Self::AiWrite => "ai:write",
        }
    }
}

/// JWT payload. `tenant_slug` selects the PostgreSQL schema for tenant data;
/// `tenant_id` is used for row-level security and audit logs.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub email: String,
    pub role: String,
    pub tenant_id: String,
    pub tenant_slug: String,
    #[serde(default)]
    pub permissions: Vec<String>,
    pub iat: usize,
    pub exp: usize,
}

impl Claims {
    pub fn allows(&self, permission: Permission) -> bool {
        if self.role == "SUPER_ADMIN" || self.role == "TENANT_ADMIN" {
            return true;
        }
        if self.permissions.iter().any(|value| value == "*") {
            return true;
        }
        if self.permissions.iter().any(|value| value == permission.as_str()) {
            return true;
        }
        Role::from_claim(&self.role)
            .map(|role| {
                role.default_permissions()
                    .iter()
                    .any(|value| *value == permission.as_str())
            })
            .unwrap_or(false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn claims(role: &str, permissions: Vec<&str>) -> Claims {
        Claims {
            sub: "someone".into(),
            email: "someone@example.com".into(),
            role: role.into(),
            tenant_id: "1".into(),
            tenant_slug: "demo".into(),
            permissions: permissions.into_iter().map(ToString::to_string).collect(),
            iat: 0,
            exp: 0,
        }
    }

    /// Super-administered roles pass every permission directly.
    #[test]
    fn admin_roles_bypass_all_scopes() {
        assert!(claims("SUPER_ADMIN", vec![]).allows(Permission::OrderRead));
        assert!(claims("SUPER_ADMIN", vec![]).allows(Permission::AiWrite));
        assert!(claims("TENANT_ADMIN", vec![]).allows(Permission::OrderRead));
        assert!(claims("TENANT_ADMIN", vec![]).allows(Permission::SettingsWrite));
    }

    /// A `*` scope grants everything, before the role fallback runs.
    #[test]
    fn wildcard_scope_grants_everything() {
        assert!(claims("WAREHOUSE_STAFF", vec!["*"]).allows(Permission::OrderRead));
        assert!(claims("WAREHOUSE_STAFF", vec!["*"]).allows(Permission::TripWrite));
    }

    /// Explicit scopes grant only what they name; roles do not inherit.
    #[test]
    fn explicit_scope_only_allows_itself() {
        let user = claims("TENANT_USER", vec!["order:read"]);
        assert!(user.allows(Permission::OrderRead));
        assert!(!user.allows(Permission::OrderWrite));
        assert!(!user.allows(Permission::InventoryRead));
        assert!(!user.allows(Permission::AiRead));
    }

    /// Fallback roles map to their default permission set.
    #[test]
    fn role_default_permissions_apply() {
        let logistics = claims("LOGISTICS_MANAGER", vec![]);
        assert!(logistics.allows(Permission::TripRead));
        assert!(logistics.allows(Permission::SosWrite));
        assert!(!logistics.allows(Permission::OrderRead));
        assert!(!logistics.allows(Permission::OrderWrite));

        let staff = claims("WAREHOUSE_STAFF", vec![]);
        assert!(staff.allows(Permission::WaveRead));
        assert!(!staff.allows(Permission::WaveWrite));
        assert!(!staff.allows(Permission::AiRead));
        assert!(!staff.allows(Permission::InventoryWrite));
    }

    /// A driver only sees its own trips.
    #[test]
    fn driver_outside_read_scope() {
        let driver = claims("DRIVER", vec![]);
        assert!(!driver.allows(Permission::TripRead));
        assert!(!driver.allows(Permission::CodRead));
        assert!(!driver.allows(Permission::InventoryRead));
    }
}
