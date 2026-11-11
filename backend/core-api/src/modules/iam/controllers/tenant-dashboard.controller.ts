import { Controller, Get, Req, UseGuards, InternalServerErrorException } from "@nestjs/common"
import { PrismaService } from "../../../core/prisma/prisma.service"
import { JwtAuthGuard } from "../../../core/auth/jwt-auth.guard"
import { Permissions, PermissionsGuard, RequirePermissions, ExcludeRoles, Roles } from "../../../core/types/shared-types"
import { ApiTags } from '@nestjs/swagger'

@ApiTags('Tenant Dashboard')
@Controller("tenant/dashboard")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ExcludeRoles(Roles.CUSTOMER_CLIENT)
export class TenantDashboardController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("stats")
  @RequirePermissions(Permissions.TenantDashboardRead)
  async stats(@Req() req: any) {
    try {
      const client = this.prisma.getTenantDb();
      
      const [
        totalOrders,
        deliveredOrders,
        activeVehicles,
        totalTrips,
        delayedTrips
      ] = await Promise.all([
        client.order.count(),
        client.order.count({ where: { status: "DELIVERED" } }),
        client.vehicle.count({ where: { status: "ACTIVE" } }),
        client.trip.count(),
        client.trip.count({ where: { status: { not: "COMPLETED" } } }),
      ]);

      const avgOptimization = totalTrips > 0
        ? Math.round((deliveredOrders / Math.max(totalOrders, 1)) * 100) + "%"
        : "—"

      return {
        totalDeliveries: totalOrders,
        activeVehicles,
        delayedTrips,
        avgOptimization,
      };
    } catch (error) {
      throw new InternalServerErrorException("Failed to fetch tenant dashboard stats: " + error.message);
    }
  }
}
