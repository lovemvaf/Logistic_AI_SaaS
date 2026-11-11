import { Controller, Get, Post, Body, Param, UseGuards, Request, NotFoundException, BadRequestException, ConflictException, UnauthorizedException } from "@nestjs/common"
import { ApiTags } from "@nestjs/swagger"
import { JwtAuthGuard } from "../../../core/auth/jwt-auth.guard"
import { PermissionsGuard, RequirePermissions, ExcludeRoles, Permissions, Roles } from "shared-types"
import { PrismaService } from "../../../core/prisma/prisma.service"

@ApiTags("Tasks")
@Controller("tasks")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ExcludeRoles(Roles.CUSTOMER_CLIENT)
export class TasksController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions(Permissions.TasksRead)
  async listTasks() {
    return this.prisma.getTenantDb().task.findMany({
      include: { product: true, assignee: true },
      orderBy: { createdAt: "desc" },
    });
  }

  @Post()
  @RequirePermissions(Permissions.TasksCreate)
  async createTask(@Body() body: {
    warehouseId: string;
    productId: string;
    sourceBinId?: string;
    targetBinId?: string;
    taskType?: string;
    quantityRequested: number;
    assigneeId?: string;
    waveId?: string;
    priority?: number;
  }) {
    const qty = Number(body?.quantityRequested);
    if (!body?.warehouseId || !body?.productId || !Number.isInteger(qty) || qty < 1) {
      throw new BadRequestException("warehouseId, productId, and positive integer quantityRequested are required");
    }

    return this.prisma.getTenantDb().task.create({
      data: {
        warehouseId: body.warehouseId,
        productId: body.productId,
        sourceBinId: body.sourceBinId,
        targetBinId: body.targetBinId,
        taskType: body.taskType || "PICK",
        quantityRequested: qty,
        assigneeId: body.assigneeId,
        waveId: body.waveId,
        priority: body.priority !== undefined ? Number(body.priority) : 0,
        status: body.assigneeId ? "ASSIGNED" : "PENDING",
      },
    });
  }

  @Post(":id/assign")
  @RequirePermissions(Permissions.TasksUpdate)
  async assignTask(@Param("id") id: string, @Body() body: { assigneeId: string }) {
    if (!body?.assigneeId) {
      throw new BadRequestException("assigneeId is required");
    }
    return this.prisma.getTenantDb().task.update({
      where: { id },
      data: { assigneeId: body.assigneeId, status: "ASSIGNED" }
    });
  }

  @Get(":id")
  @RequirePermissions(Permissions.TasksRead)
  async getTask(@Param("id") id: string) {
    const task = await this.prisma.getTenantDb().task.findUnique({
      where: { id },
      include: { product: true, assignee: true },
    });
    if (!task) throw new NotFoundException(`Task ${id} not found`);
    return task;
  }

  @Post(":id/confirm")
  @RequirePermissions(Permissions.TasksUpdate)
  async confirmTask(
    @Param("id") id: string,
    @Body() body: { pickedQuantity?: number; actualQty?: number },
    @Request() req: any,
  ) {
    const qty = body?.actualQty ?? body?.pickedQuantity ?? 0;
    return this.completeTask(id, { actualQty: qty }, req);
  }

  @Post(":id/complete")
  @RequirePermissions(Permissions.TasksUpdate)
  async completeTask(@Param("id") id: string, @Body() body: { actualQty: number }, @Request() req: any) {
    const actorId = req.user?.sub;
    if (!actorId) {
      throw new UnauthorizedException("Authenticated user required");
    }

    const actualQty = Number(body?.actualQty);
    if (!Number.isInteger(actualQty) || actualQty < 0) {
      throw new BadRequestException("actualQty must be a non-negative integer");
    }

    return this.prisma.getTenantDb().$transaction(async (tx: any) => {
      // 1. Lấy thông tin Task và Inventory liên quan
      const task = await tx.task.findUnique({
        where: { id },
        include: { wave: true }
      });

      if (!task) throw new NotFoundException("Task not found");
      if (task.status === "COMPLETED") throw new BadRequestException("Task already completed");

      const invs = await tx.inventory.findMany({
        where: {
          warehouseId: task.warehouseId,
          productId: task.productId,
          binId: task.sourceBinId,
        },
      });

      if (invs.length === 0) throw new NotFoundException("Source inventory not found");
      const inv = invs[0];
      if (inv.quantityOnHand < actualQty) {
        throw new ConflictException(`Insufficient on-hand stock (available on hand: ${inv.quantityOnHand})`);
      }

      // 2. Cập nhật Task status
      await tx.task.update({
        where: { id },
        data: {
          status: "COMPLETED",
          quantityActual: actualQty,
          assigneeId: task.assigneeId || actorId
        }
      });

      // 3. Khấu trừ kho: trừ số dư thực tế và nhả phần đã cấp phát (clamp >= 0)
      const releaseAllocated = Math.min(Number(task.quantityRequested || 0), Number(inv.quantityAllocated || 0));
      const updateResult = await tx.$executeRawUnsafe(
        `UPDATE inventory
        SET quantity_on_hand = quantity_on_hand - $1,
            quantity_allocated = GREATEST(0, quantity_allocated - $2),
            version = version + 1
        WHERE id = $3
          AND version = $4
          AND quantity_on_hand >= $1`,
        actualQty, releaseAllocated, inv.id, inv.version
      );

      if (updateResult === 0) throw new ConflictException("Inventory concurrent update detected");

      // 4. Ghi nhận biến động kho (Stock Movement)
      await tx.stockMovement.create({
        data: {
          inventoryId: inv.id,
          warehouseId: task.warehouseId,
          transactionType: task.taskType,
          quantityChange: -actualQty,
          balanceAfter: inv.quantityOnHand - actualQty,
          reasonCode: `TASK_COMPLETE_${task.id}`,
          actorId: actorId
        }
      });

      return { ok: true, taskId: task.id };
    });
  }
}
