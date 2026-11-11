import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common"
import type { Permission } from "../permissions"
import type { Role } from "../roles"

@Injectable()
export class PermissionsGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest()
    const userRole: string | undefined = request?.user?.role

    // Explicit role allow/deny decorators are always evaluated BEFORE any
    // SUPER_ADMIN bypass or permission-string matching. This guarantees that
    // TENANT_ADMIN cannot reach platform-only routes via shared permission
    // strings, and CUSTOMER_CLIENT cannot reach internal tenant routes.
    const excludedRoles =
      (Reflect.getMetadata("excludeRoles", context.getHandler()) as
        | Role[]
        | undefined) ??
      (Reflect.getMetadata("excludeRoles", context.getClass()) as
        | Role[]
        | undefined)

    if (excludedRoles && excludedRoles.length > 0) {
      if (!userRole || excludedRoles.includes(userRole as Role)) {
        return false
      }
    }

    const requiredRoles =
      (Reflect.getMetadata("roles", context.getHandler()) as
        | Role[]
        | undefined) ??
      (Reflect.getMetadata("roles", context.getClass()) as
        | Role[]
        | undefined)

    if (requiredRoles && requiredRoles.length > 0) {
      if (!userRole || !requiredRoles.includes(userRole as Role)) {
        return false
      }
    }

    // Read metadata directly from reflect-metadata instead of injecting Nest's
    // Reflector. This avoids DI token mismatches when this package resolves a
    // different copy of @nestjs/core than the host application (pnpm deploy).
    const required =
      (Reflect.getMetadata("permissions", context.getHandler()) as
        | Permission[]
        | undefined) ??
      (Reflect.getMetadata("permissions", context.getClass()) as
        | Permission[]
        | undefined)

    if (!required || required.length === 0) {
      return true
    }

    // Super admins are platform-level operators and bypass tenant permission
    // matrices after passing explicit @RequireRoles/@ExcludeRoles constraints.
    if (userRole === "SUPER_ADMIN") {
      return true
    }

    const permissions: string[] | undefined = request?.user?.permissions

    if (!permissions) {
      return false
    }

    return required.every((perm: string) => permissions.includes(perm))
  }
}
