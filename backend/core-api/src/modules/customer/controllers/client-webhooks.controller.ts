import { Body, Controller, Get, Post, Patch, Request, UseGuards, NotFoundException, BadRequestException, Delete, Param } from "@nestjs/common"
import { IsBoolean, IsOptional } from "class-validator"
import { Permissions, PermissionsGuard, RequirePermissions } from "shared-types"
import { WebhookCreateDto } from "../dtos/webhook-create.dto"
import { PrismaService } from "../../../core/prisma/prisma.service"
import { JwtAuthGuard } from "../../../core/auth/jwt-auth.guard"
import { assertSafeWebhookUrl } from "../../../core/utils/webhook-url.util"
import * as crypto from "crypto"
import { ApiTags } from "@nestjs/swagger"

class UpdateWebhookStatusDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean
}

function maskSecret(secret?: string | null): string | null {
  if (!secret) return null
  if (secret.length <= 10) return "whsec_****"
  return `${secret.slice(0, 6)}****${secret.slice(-4)}`
}

@ApiTags('Client Webhooks')
@Controller("client/webhooks")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ClientWebhooksController {
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
  @RequirePermissions(Permissions.OrdersRead)
  async list(@Request() req: any) {
    const clientId = await this.getClientId(req);
    const hooks = await this.prisma.getTenantDb().clientWebhook.findMany({
      where: { clientId },
      orderBy: { createdAt: 'desc' }
    });
    return hooks.map((w) => ({
      ...w,
      secretToken: maskSecret(w.secretToken),
    }));
  }

  @Post()
  @RequirePermissions(Permissions.OrdersCreate)
  async create(@Body() body: WebhookCreateDto, @Request() req: any) {
    const clientId = await this.getClientId(req);

    await assertSafeWebhookUrl(body.url);

    if (!body.events || !Array.isArray(body.events) || body.events.length === 0) {
      throw new BadRequestException("At least one event must be subscribed to");
    }

    // Kiểm tra giới hạn số lượng webhook (max 10 webhooks per client)
    const count = await this.prisma.getTenantDb().clientWebhook.count({ where: { clientId } });
    if (count >= 10) {
      throw new BadRequestException("Maximum webhook limit reached (10)");
    }

    return this.prisma.getTenantDb().clientWebhook.create({
      data: {
        clientId,
        url: body.url.trim(),
        secretToken: `whsec_${crypto.randomBytes(24).toString('hex')}`,
        events: JSON.stringify(body.events),
        isActive: true,
      }
    });
  }

  @Patch(":id/status")
  @RequirePermissions(Permissions.OrdersCreate)
  async updateStatus(@Param("id") id: string, @Body() body: UpdateWebhookStatusDto | undefined, @Request() req: any) {
    const clientId = await this.getClientId(req);
    const webhook = await this.prisma.getTenantDb().clientWebhook.findFirst({
      where: { id, clientId },
    });
    if (!webhook) {
      throw new NotFoundException("Webhook not found");
    }

    const nextActive = body?.isActive !== undefined ? Boolean(body.isActive) : !webhook.isActive;
    const updated = await this.prisma.getTenantDb().clientWebhook.update({
      where: { id },
      data: { isActive: nextActive },
    });
    return {
      ...updated,
      secretToken: maskSecret(updated.secretToken),
    };
  }

  @Delete(":id")
  @RequirePermissions(Permissions.OrdersCreate)
  async remove(@Param("id") id: string, @Request() req: any) {
    const clientId = await this.getClientId(req);

    const webhook = await this.prisma.getTenantDb().clientWebhook.findFirst({
      where: { id, clientId }
    });

    if (!webhook) {
      throw new NotFoundException("Webhook not found");
    }

    await this.prisma.getTenantDb().clientWebhook.delete({
      where: { id }
    });

    return { ok: true, message: "Webhook deleted successfully" };
  }
}
