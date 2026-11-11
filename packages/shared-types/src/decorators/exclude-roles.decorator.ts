import { SetMetadata } from "@nestjs/common"
import type { Role } from "../roles"

export const ExcludeRoles = (...roles: Role[]) =>
  SetMetadata("excludeRoles", roles)
