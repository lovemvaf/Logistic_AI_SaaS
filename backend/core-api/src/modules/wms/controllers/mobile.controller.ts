import { Controller, Get, Post, Body, UseGuards, Request, UnauthorizedException, ConflictException, BadRequestException } from "@nestjs/common"
import { ApiTags } from "@nestjs/swagger"
import { JwtAuthGuard } from "../../../core/auth/jwt-auth.guard"
import { PermissionsGuard, RequirePermissions, ExcludeRoles, Permissions, Roles } from "shared-types"
import { PrismaService } from "../../../core/prisma/prisma.service"

@ApiTags("Mobile")
@Controller("mobile")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ExcludeRoles(Roles.CUSTOMER_CLIENT)
export class MobileController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("sync")
  @RequirePermissions(Permissions.MobileSyncPull)
  async syncTasks(@Request() req: any) {
    const userId = req.user?.sub;
    if (!userId) throw new UnauthorizedException("User ID not found in token");
    
    return this.prisma.getTenantDb().task.findMany({
      where: { assigneeId: userId, status: { in: ["ASSIGNED", "IN_PROGRESS"] } },
      include: { product: true }
    });
  }

  @Post("scan-logs")
  @RequirePermissions(Permissions.MobileSyncPush)
  async submitScanLogs(@Body() body: { logs: any[] }, @Request() req: any) {
    const actorId = req.user?.sub;
    if (!actorId) throw new UnauthorizedException("User ID not found in token");
    if (!Array.isArray(body?.logs) || body.logs.length === 0) {
      throw new BadRequestException("logs must be a non-empty array");
    }

    return this.prisma.getTenantDb().$transaction(async (tx: any) => {
      let processedCount = 0;

      for (const log of body.logs) {
        // 1. Insert the scan log
        await tx.scanLog.create({
          data: {
            warehouseId: log.warehouseId,
            taskId: log.taskId,
            barcode: log.barcode,
            result: log.result,
            deviceId: log.deviceId,
            actorId,
          }
        });

        // 2. Phase 2.2: Apply Optimistic Locking if action is PACK or OUT
        if (log.result === "PACK" || log.result === "OUT") {
          // Product.barcode is non-unique per schema; lookup via findFirst.
          const product = await tx.product.findFirst({
            where: {
              OR: [{ barcode: log.barcode }, { sku: log.barcode }],
            },
          });

          if (product) {
            const candidates = await tx.inventory.findMany({
              where: {
                productId: product.id,
                warehouseId: log.warehouseId,
                quantityOnHand: { gt: 0 },
              },
              orderBy: { createdAt: 'asc' },
            });
            const inv = candidates.find(
              (c: any) => Number(c.quantityOnHand) - Number(c.quantityAllocated || 0) >= 1,
            );

            if (!inv) {
              throw new ConflictException(`Insufficient available stock for barcode ${log.barcode}.`);
            }

            // Optimistic locking + available guard (id is TEXT, no ::uuid cast).
            const updatedRows = await tx.$executeRaw`
              UPDATE inventory
              SET quantity_on_hand = quantity_on_hand - 1,
                  version = version + 1
              WHERE id = ${inv.id}
                AND version = ${inv.version}
                AND (quantity_on_hand - quantity_allocated) >= 1
            `;

            if (updatedRows === 0) {
              throw new ConflictException(`Conflict updating inventory for barcode ${log.barcode}. Please sync and try again.`);
            }
          }
        }
        processedCount++;
      }

      return { ok: true, processedCount };
    });
  }
}
