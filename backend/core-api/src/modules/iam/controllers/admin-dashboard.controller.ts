import { Controller, Get, UseGuards, InternalServerErrorException } from "@nestjs/common"
import { PrismaService } from "../../../core/prisma/prisma.service"
import { JwtAuthGuard } from "../../../core/auth/jwt-auth.guard"
import { Permissions, PermissionsGuard, RequirePermissions, RequireRoles, Roles } from "shared-types";
import { ApiTags } from '@nestjs/swagger'

@ApiTags('Admin Dashboard')
@Controller("admin/dashboard")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequireRoles(Roles.SUPER_ADMIN)
export class AdminDashboardController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("stats")
  @RequirePermissions(Permissions.BillingRead)
  async stats() {
    try {
      const [allTenants, plans, usersCount] = await Promise.all([
        this.prisma.tenant.findMany({ select: { id: true, status: true, createdAt: true } }),
        this.prisma.subscriptionPlan.findMany({
          include: {
            tenants: { select: { id: true, status: true, createdAt: true } },
          },
        }),
        // Cross-tenant aggregate: only the platform path may read the user
        // table of every tenant, so row-level security is lifted explicitly.
        this.prisma.runAsPlatform((db) => db.tenantUser.count()),
      ]);

      const activeTenants = allTenants.filter(t => t.status === "ACTIVE").length;
      const totalTenants = allTenants.length;
      const pendingTenants = allTenants.filter(t => t.status === "PENDING").length;

      const totalMrr = plans.reduce((sum: number, plan: any) => {
        const activeCount = plan.tenants.filter((t: any) => t.status === "ACTIVE").length;
        return sum + activeCount * Number(plan.priceMonthly || 0);
      }, 0);

      const growthData: any[] = [];
      const revenueData: any[] = [];
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      
      for (let i = 5; i >= 0; i--) {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        const monthStr = monthNames[date.getMonth()];
        
        const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0);
        const activeUpToMonth = allTenants.filter(t => t.createdAt <= endOfMonth && t.status === "ACTIVE").length;
        growthData.push({ month: monthStr, tenants: activeUpToMonth });

        let mrrMonth = 0;
        plans.forEach((plan: any) => {
          const activeTForPlan = plan.tenants.filter((t: any) => t.createdAt <= endOfMonth && t.status === "ACTIVE").length;
          mrrMonth += activeTForPlan * Number(plan.priceMonthly || 0);
        });
        revenueData.push({ month: monthStr, amount: mrrMonth });
      }

      return {
        mrr: totalMrr,
        totalMrr,
        activeTenants,
        totalTenants,
        totalUsers: usersCount,
        apiCalls: 0,
        alerts: pendingTenants,
        growthData,
        revenueData,
      };
    } catch (error) {
      throw new InternalServerErrorException("Failed to fetch dashboard stats");
    }
  }

  @Get("logistics")
  @RequirePermissions(Permissions.BillingRead)
  async logistics() {
    try {
      return await this.prisma.runAsPlatform(async (db) => {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const activeStatuses = ["IN_PROGRESS", "IN_TRANSIT", "OUT_FOR_DELIVERY", "PICKUP"];

        const [
          totalOrders,
          deliveredOrders,
          activeShipments,
          inTransit,
          deliveredToday,
          delayedShipments,
          activeVehicles,
          activeDrivers,
          inventoryAlerts,
        ] = await Promise.all([
          db.order.count(),
          db.order.count({ where: { status: "DELIVERED" } }),
          db.order.count({ where: { status: { in: activeStatuses } } }),
          db.order.count({ where: { status: "IN_TRANSIT" } }),
          db.order.count({
            where: { status: "DELIVERED", updatedAt: { gte: startOfDay } },
          }),
          db.trip.count({ where: { status: "DELAYED" } }),
          db.vehicle.count({ where: { status: "ACTIVE" } }),
          db.driver.count({ where: { status: "ACTIVE" } }),
          db.inventory.count({ where: { quantityOnHand: { lt: 10 } } }),
        ]);

        const fulfillmentRate = totalOrders > 0
          ? `${((deliveredOrders / totalOrders) * 100).toFixed(1)}%`
          : "N/A";

        return {
          totalOrders,
          activeShipments,
          inTransit,
          deliveredToday,
          delayedShipments,
          activeVehicles,
          activeDrivers,
          inventoryAlerts,
          avgOptimization: fulfillmentRate,
          onTimeDelivery: fulfillmentRate,
          predictedShipments: [],
        };
      });
    } catch (error) {
      throw new InternalServerErrorException(
        "Failed to fetch logistics dashboard stats",
      );
    }
  }
}
