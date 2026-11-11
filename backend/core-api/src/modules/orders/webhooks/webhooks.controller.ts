import { Controller, Get, Post, Patch, Body, Param, Delete, UseGuards, Request, NotFoundException, BadRequestException } from "@nestjs/common";
import { JwtAuthGuard } from "../../../core/auth/jwt-auth.guard";
import { PermissionsGuard, RequirePermissions, ExcludeRoles, Permissions, Roles } from "shared-types";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { assertSafeWebhookUrl } from "../../../core/utils/webhook-url.util";
import * as crypto from "crypto";
import { ApiTags } from "@nestjs/swagger";

function maskSecretToken(secret?: string | null): string | null {
  if (!secret) return null;
  if (secret.length <= 10) return "whsec_****";
  return `${secret.slice(0, 6)}****${secret.slice(-4)}`;
}

@ApiTags("Webhooks")
@Controller("webhooks")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ExcludeRoles(Roles.CUSTOMER_CLIENT)
export class WebhooksController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("outbox")
  @RequirePermissions(Permissions.SettingsManage)
  async listOutboxEvents() {
    return this.prisma.getTenantDb().outboxEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  @Post("outbox/:id/redrive")
  @RequirePermissions(Permissions.SettingsManage)
  async redriveOutboxEvent(@Param("id") id: string) {
    const db = this.prisma.getTenantDb();
    const existing = await db.outboxEvent.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("Outbox event not found");
    }
    return db.outboxEvent.update({
      where: { id },
      data: {
        status: "PENDING",
        attempts: 0,
        lastError: null,
        deadLetterReason: null,
        lockedBy: null,
        leaseUntil: null,
        availableAt: new Date(),
      },
    });
  }

  @Get()
  @RequirePermissions(Permissions.SettingsManage)
  async listWebhooks(@Request() req: any) {
    const clientId = req.user?.client_id;
    const rows = await this.prisma.getTenantDb().clientWebhook.findMany({
      ...(clientId ? { where: { clientId } } : {}),
      orderBy: { id: 'desc' },
      take: 50,
    });
    return rows.map((w) => ({
      ...w,
      secretToken: maskSecretToken(w.secretToken),
    }));
  }

  @Post()
  @RequirePermissions(Permissions.SettingsManage)
  async registerWebhook(@Body() body: { clientId: string, url: string, events: string[] }) {
    await assertSafeWebhookUrl(body.url);

    if (!body.clientId) {
      throw new BadRequestException("clientId is required");
    }
    const client = await this.prisma.getTenantDb().client.findUnique({ where: { id: body.clientId } });
    if (!client) {
      throw new NotFoundException("Client not found");
    }
    if (!Array.isArray(body.events) || body.events.length === 0) {
      throw new BadRequestException("At least one event must be subscribed to");
    }

    const secretToken = `whsec_${crypto.randomBytes(24).toString("hex")}`;
    return this.prisma.getTenantDb().clientWebhook.create({
      data: {
        clientId: body.clientId,
        url: body.url.trim(),
        events: JSON.stringify(body.events),
        secretToken,
        isActive: true,
      }
    });
  }

  @Patch(":id/status")
  @RequirePermissions(Permissions.SettingsManage)
  async setWebhookStatus(
    @Param("id") id: string,
    @Body() body: { status?: string; isActive?: boolean } | undefined,
  ) {
    const webhook = await this.prisma.getTenantDb().clientWebhook.findUnique({ where: { id } });
    if (!webhook) {
      throw new NotFoundException("Webhook not found");
    }
    const nextActive =
      body?.isActive !== undefined
        ? Boolean(body.isActive)
        : body?.status !== undefined
          ? String(body.status).toUpperCase() === "ACTIVE"
          : !webhook.isActive;

    const updated = await this.prisma.getTenantDb().clientWebhook.update({
      where: { id },
      data: { isActive: nextActive },
    });
    return {
      ...updated,
      secretToken: maskSecretToken(updated.secretToken),
    };
  }

  @Delete(":id")
  @RequirePermissions(Permissions.SettingsManage)
  async removeWebhook(@Param("id") id: string) {
    const webhook = await this.prisma.getTenantDb().clientWebhook.findUnique({ where: { id } });
    if (!webhook) {
      throw new NotFoundException("Webhook not found");
    }
    await this.prisma.getTenantDb().clientWebhook.delete({ where: { id } });
    return { ok: true, message: "Webhook deleted" };
  }
}
