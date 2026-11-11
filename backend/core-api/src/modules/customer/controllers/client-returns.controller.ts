import { Body, Controller, Get, Param, Post, Request, UseGuards, Logger, InternalServerErrorException, NotFoundException, BadRequestException } from "@nestjs/common"
import { Permissions, PermissionsGuard, RequirePermissions } from "shared-types"
import { JwtAuthGuard } from "../../../core/auth/jwt-auth.guard"
import { PrismaService } from "../../../core/prisma/prisma.service"
import { ApiTags } from "@nestjs/swagger"

@ApiTags('Client Returns')
@Controller("client/returns")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ClientReturnsController {
  private readonly logger = new Logger("ClientReturnsController")

  constructor(private readonly prisma: PrismaService) {}

  private async getClientId(req: any): Promise<string> {
    const email = req.user?.email
    if (!email) throw new NotFoundException("User email not found in token")

    const clientUser = await this.prisma.getTenantDb().clientUser.findFirst({
      where: { email },
    })
    if (!clientUser) throw new NotFoundException("Client account not found for this user")
    return clientUser.clientId
  }

  @Get()
  @RequirePermissions(Permissions.ReturnsRead)
  async listMyReturns(@Request() req: any) {
    try {
      const clientId = await this.getClientId(req)
      return this.prisma.getTenantDb().returnRequest.findMany({
        where: { clientId },
        include: {
          order: { select: { trackingCode: true, recipientName: true } },
          items: true,
          reason: true,
          refunds: true,
        },
        orderBy: { createdAt: "desc" }
      })
    } catch (error) {
      if (error instanceof NotFoundException) throw error
      this.logger.error(`Failed to list returns: ${error instanceof Error ? error.message : "Unknown"}`)
      throw new InternalServerErrorException("Failed to fetch return requests")
    }
  }

  @Get(":id")
  @RequirePermissions(Permissions.ReturnsRead)
  async getMyReturn(@Param("id") id: string, @Request() req: any) {
    try {
      const clientId = await this.getClientId(req)
      const request = await this.prisma.getTenantDb().returnRequest.findFirst({
        where: { id, clientId },
        include: {
          order: true,
          items: { include: { orderItem: { include: { product: true } } } },
          inspections: true,
          refunds: true,
          reason: true,
        }
      })
      if (!request) throw new NotFoundException("Return request not found")
      return request
    } catch (error) {
      if (error instanceof NotFoundException) throw error
      throw new InternalServerErrorException("Failed to fetch return request")
    }
  }

  @Post()
  @RequirePermissions(Permissions.ReturnsCreate)
  async createReturnRequest(@Body() body: { orderId: string; reasonId?: string; reasonNote?: string; items: { productId: string; quantity: number }[] }, @Request() req: any) {
    try {
      const clientId = await this.getClientId(req)

      const order = await this.prisma.getTenantDb().order.findFirst({
        where: { id: body.orderId, clientId },
        include: { items: true }
      })
      if (!order) throw new NotFoundException("Order not found")
      if (order.status === "CANCELLED" || order.status === "RETURNED") {
        throw new BadRequestException(`Cannot create return for order with status ${order.status}`)
      }

      if (!body.items || body.items.length === 0) {
        throw new BadRequestException("Return request must have at least one item")
      }

      const orderedByProduct = new Map<string, number>();
      for (const oi of order.items || []) {
        orderedByProduct.set(oi.productId, (orderedByProduct.get(oi.productId) || 0) + Number(oi.quantity || 0));
      }
      for (const item of body.items) {
        const qty = Number(item.quantity);
        if (!Number.isInteger(qty) || qty < 1) {
          throw new BadRequestException("Return item quantity must be a positive integer");
        }
        const maxQty = orderedByProduct.get(item.productId) || 0;
        if (maxQty > 0 && qty > maxQty) {
          throw new BadRequestException(`Return quantity exceeds ordered quantity for product ${item.productId}`);
        }
      }

      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "")
      const randomSuffix = Math.floor(Math.random() * 100000).toString().padStart(5, "0")
      const returnCode = `RMA-${dateStr}-${randomSuffix}`

      return await this.prisma.getTenantDb().$transaction(async (tx: any) => {
        const returnRequest = await tx.returnRequest.create({
          data: {
            returnCode,
            orderId: body.orderId,
            clientId,
            reasonId: body.reasonId,
            reasonNote: body.reasonNote,
            status: "PENDING",
            returnType: "REFUND",
            items: {
              create: body.items.map((item: any) => ({
                productId: item.productId,
                quantityRequested: item.quantity,
              }))
            }
          },
          include: { items: true }
        })

        await tx.orderTrackingEvent.create({
          data: {
            orderId: body.orderId,
            status: "RETURN_REQUESTED",
            description: `Return request ${returnCode} created by client`
          }
        })

        return returnRequest
      })
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) throw error
      this.logger.error(`Failed to create return: ${error instanceof Error ? error.message : "Unknown"}`)
      throw new InternalServerErrorException("Failed to create return request")
    }
  }
}
