/**
 * Local re-exports from the shared-types package.
 * The iam-service uses a local copy because it also needs auth-specific types.
 * All permissions, guards, and decorators come from the shared package.
 */
export { Permissions, type Permission } from "shared-types"
export { PermissionsGuard } from "shared-types"
export { RequirePermissions } from "shared-types"
export { RequireRoles } from "shared-types"
export { ExcludeRoles } from "shared-types"
export { Roles, type Role } from "shared-types"

export interface LoginResponse {
  ok?: boolean;
  accessToken?: string;
  message?: string;
  [key: string]: any;
}

export interface JwtPayload {
  sub?: string;
  email?: string;
  role?: string;
  tenant_id?: string;
  schema_name?: string;
  permissions?: string[];
  [key: string]: any;
}
