/// Validate a PostgreSQL schema name before it is interpolated into `SET
/// search_path` or DDL. Only lowercase letters, digits and underscores are
/// accepted; the name must start with a letter and be at most 63 bytes.
///
/// Returns the name unchanged when valid so it can be used directly:
/// `let schema = safe_schema_name(&claims.tenant_slug)?;`
pub fn safe_schema_name(value: &str) -> anyhow::Result<String> {
    let valid = !value.is_empty()
        && value.len() <= 63
        && value.starts_with(|character: char| character.is_ascii_lowercase())
        && value
            .chars()
            .all(|character| character.is_ascii_lowercase() || character.is_ascii_digit() || character == '_');

    if valid {
        Ok(value.to_string())
    } else {
        anyhow::bail!("invalid tenant schema name")
    }
}

#[cfg(test)]
mod tests {
    use super::safe_schema_name;

    #[test]
    fn accepts_tenant_schemas() {
        assert!(safe_schema_name("tenant_abc123").is_ok());
        assert!(safe_schema_name("demo_logistics_vn").is_ok());
    }

    #[test]
    fn rejects_injection_attempts() {
        assert!(safe_schema_name("tenant\"; DROP SCHEMA public; --").is_err());
        assert!(safe_schema_name("Tenant_ABC").is_err());
        assert!(safe_schema_name("1tenant").is_err());
        assert!(safe_schema_name("").is_err());
    }
}
