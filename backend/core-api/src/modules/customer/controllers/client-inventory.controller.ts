import { Controller, Get, Request, UseGuards, NotFoundException } from "@nestjs/common"
import { Permissions, PermissionsGuard, RequirePermissions } from "shared-types"
import { PrismaService } from "../../../core/prisma/prisma.service"
import { JwtAuthGuard } from "../../../core/auth/jwt-auth.guard"
import { ApiTags } from "@nestjs/swagger"

@ApiTags('Client Inventory')
@Controller("client/inventory")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ClientInventoryController {
  constructor(private readonly prisma: PrismaService) {}

  private async getClientId(req: any): Promise<string> {
    const email = req.user?.email;
    if (!email) throw new NotFoundException("User email not found in token");
    
    const clientUser = await this.prisma.getTenantDb().clientUser.findFirst({
      where: { email },
    });

    if (!clientUser) {
      throw new NotFoundException("Client account not found for this user");
    }

    return clientUser.clientId;
  }

  @Get()
  @RequirePermissions(Permissions.InventoryRead)
  async list(@Request() req: any) {
    const clientId = await this.getClientId(req);

    const clientOrders = await this.prisma.getTenantDb().order.findMany({
      where: { clientId },
      select: { items: { select: { productId: true } } },
    });

    const productIds = [...new Set(
      clientOrders.flatMap((order: any) => order.items.map((item: any) => item.productId))
    )];

    if (productIds.length === 0) {
      return [];
    }

    const inventories = await this.prisma.getTenantDb().inventory.findMany({
      where: { productId: { in: productIds } },
      include: {
        product: true,
        warehouse: true,
        bin: { include: { rack: { include: { zone: true } } } }
      },
      take: 50
    });

    return inventories.map((inv: any) => ({
      id: inv.id,
      productName: inv.product?.name,
      sku: inv.product?.sku,
      quantity: inv.quantityOnHand,
      allocated: inv.quantityAllocated,
      available: inv.quantityOnHand - inv.quantityAllocated,
      warehouse: inv.warehouse?.name,
      location: inv.bin ? `${inv.bin.rack?.zone?.code}-${inv.bin.barcode}` : null,
      status: inv.status
    }));
  }
}
