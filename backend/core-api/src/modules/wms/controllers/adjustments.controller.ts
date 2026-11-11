import { Controller, Get, UseGuards, Query } from "@nestjs/common"
import { ApiTags } from "@nestjs/swagger"
import { JwtAuthGuard } from "../../../core/auth/jwt-auth.guard"
import { PermissionsGuard, RequirePermissions, ExcludeRoles, Permissions, Roles } from "shared-types"
import { InventoryService } from "../services/inventory.service"

@ApiTags("Adjustments")
@Controller("inventory/adjustments")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ExcludeRoles(Roles.CUSTOMER_CLIENT)
export class AdjustmentsController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  @RequirePermissions(Permissions.InventoryRead)
  async getAdjustments(@Query("page") page: number, @Query("limit") limit: number) {
    return this.inventoryService.getAdjustments({ page: Number(page || 1), limit: Number(limit || 20) })
  }
}
