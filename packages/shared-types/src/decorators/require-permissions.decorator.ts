import { SetMetadata } from "@nestjs/common"
import type { Permission } from "../permissions"

export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata("permissions", permissions)
