import { SetMetadata } from "@nestjs/common"
import type { Role } from "../roles"

export const RequireRoles = (...roles: Role[]) => SetMetadata("roles", roles)
