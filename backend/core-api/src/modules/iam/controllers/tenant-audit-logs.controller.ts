import {
  Controller,
  Get,
  Query,
  Req,
  UseGuards,
  ForbiddenException,
  InternalServerErrorException,
} from "@nestjs/common";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { JwtAuthGuard } from "../../../core/auth/jwt-auth.guard";
import {
  ExcludeRoles,
  Permissions,
  PermissionsGuard,
  RequirePermissions,
  Roles,
} from "../../../core/types/shared-types";
import { ApiTags } from "@nestjs/swagger";

@ApiTags("Tenant Audit Logs")
@Controller("tenant/audit-logs")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ExcludeRoles(Roles.CUSTOMER_CLIENT)
export class TenantAuditLogsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions(Permissions.AuditLogsRead)
  async list(
    @Req() req: any,
    @Query("page") page: number = 1,
    @Query("limit") limit: number = 20,
    @Query("action") action?: string,
    @Query("actorEmail") actorEmail?: string,
  ) {
    const tenantId: string | undefined = req?.user?.tenant_id || req?.tenantId;
    if (!tenantId) {
      throw new ForbiddenException("Tenant context is required for tenant audit logs");
    }

    try {
      const safePage = Math.max(1, Number(page || 1));
      const safeLimit = Math.min(100, Math.max(1, Number(limit || 20)));
      const skip = (safePage - 1) * safeLimit;
      const take = safeLimit;

      const where: any = { tenantId };
      if (action) where.action = action;
      if (actorEmail) where.actorEmail = { contains: actorEmail, mode: "insensitive" };

      const [data, total] = await Promise.all([
        this.prisma.systemAuditLog.findMany({
          where,
          skip,
          take,
          orderBy: { createdAt: "desc" },
        }),
        this.prisma.systemAuditLog.count({ where }),
      ]);

      return {
        data,
        meta: {
          total,
          page: safePage,
          limit: take,
          totalPages: Math.max(1, Math.ceil(total / take)),
        },
      };
    } catch (error) {
      if (error instanceof ForbiddenException) throw error;
      throw new InternalServerErrorException("Failed to fetch audit logs");
    }
  }

  @Get("actions")
  @RequirePermissions(Permissions.AuditLogsRead)
  async distinctActions(@Req() req: any) {
    const tenantId: string | undefined = req?.user?.tenant_id || req?.tenantId;
    if (!tenantId) {
      throw new ForbiddenException("Tenant context is required for tenant audit logs");
    }

    const results: any[] = await this.prisma.$queryRaw`
      SELECT DISTINCT action
      FROM system_audit_logs
      WHERE tenant_id = ${tenantId}
      ORDER BY action
    `;
    return results.map((r: any) => r.action);
  }
}
