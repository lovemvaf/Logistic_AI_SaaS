import { Controller, Get, Query, UseGuards, InternalServerErrorException } from "@nestjs/common"
import { PrismaService } from "../../../core/prisma/prisma.service"
import { JwtAuthGuard } from "../../../core/auth/jwt-auth.guard"
import { Permissions, PermissionsGuard, RequirePermissions, RequireRoles, Roles } from "../../../core/types/shared-types"
import { ApiTags } from '@nestjs/swagger'

@ApiTags('Admin Audit Logs')
@Controller("admin/audit-logs")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequireRoles(Roles.SUPER_ADMIN)
export class AdminAuditLogsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions(Permissions.AuditLogsRead)
  async list(
    @Query("page") page: number = 1,
    @Query("limit") limit: number = 30,
    @Query("action") action?: string,
    @Query("resourceType") resourceType?: string,
    @Query("actorEmail") actorEmail?: string,
  ) {
    try {
      const safePage = Math.max(1, Number(page || 1));
      const safeLimit = Math.min(100, Math.max(1, Number(limit || 30)));
      const skip = (safePage - 1) * safeLimit;
      const take = safeLimit;

      const where: any = {};
      if (action) where.action = action;
      if (resourceType) where.resourceType = resourceType;
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
      throw new InternalServerErrorException("Failed to fetch audit logs");
    }
  }

  @Get("actions")
  @RequirePermissions(Permissions.AuditLogsRead)
  async distinctActions() {
    const results: any[] = await this.prisma.$queryRaw`
      SELECT DISTINCT action FROM system_audit_logs ORDER BY action
    `
    return results.map((r: any) => r.action)
  }
}
