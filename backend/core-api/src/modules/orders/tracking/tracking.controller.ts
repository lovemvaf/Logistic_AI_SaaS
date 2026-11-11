import { Controller, Post, Body, UseGuards, Logger, NotFoundException, BadRequestException, Optional } from "@nestjs/common";
import { JwtAuthGuard } from "../../../core/auth/jwt-auth.guard";
import { PermissionsGuard, RequirePermissions, ExcludeRoles, Permissions, Roles } from "shared-types";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { OutboxService } from "../../../core/outbox/outbox.service";
import { assertSafeWebhookUrl } from "../../../core/utils/webhook-url.util";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import * as crypto from "crypto";
import { ApiTags } from "@nestjs/swagger";

@ApiTags("Tracking")
@Controller("tracking")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ExcludeRoles(Roles.CUSTOMER_CLIENT)
export class TrackingController {
  private readonly logger = new Logger(TrackingController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
    @Optional() private readonly outbox?: OutboxService,
  ) {}

  @Post("events")
  @RequirePermissions(Permissions.OrdersCreate)
  async addEvent(@Body() body: { orderId: string, status: string, location?: string, description?: string }) {
    if (!body?.orderId || !body?.status) {
      throw new BadRequestException("orderId and status are required");
    }

    const { event, order } = await this.prisma.getTenantDb().$transaction(async (tx: any) => {
      const existingOrder = await tx.order.findUnique({ where: { id: body.orderId } });
      if (!existingOrder) {
        throw new NotFoundException(`Order ${body.orderId} not found`);
      }

      // 1. Tạo sự kiện tracking
      const createdEvent = await tx.orderTrackingEvent.create({
        data: {
          orderId: body.orderId,
          status: body.status,
          location: body.location || 'System',
          description: body.description || `Status updated to ${body.status}`,
        },
      });

      // 2. Cập nhật trạng thái đơn hàng
      const updatedOrder = await tx.order.update({
        where: { id: body.orderId },
        data: { status: body.status },
      });

      return { event: createdEvent, order: updatedOrder };
    });

    // 3. Dispatch Webhooks safely via validated HTTPS + HMAC / Outbox
    if (order.clientId) {
      this.dispatchWebhooks(order.clientId, order.trackingCode, event).catch((err) =>
        this.logger.warn(`Async webhook dispatch skipped: ${err?.message || err}`),
      );
    }

    return event;
  }

  private async dispatchWebhooks(clientId: string, trackingCode: string, event: any) {
    if (!clientId) return;

    const webhooks = await this.prisma.getTenantDb().clientWebhook.findMany({
      where: { clientId, isActive: true }
    });

    for (const webhook of webhooks) {
      if (webhook.events.includes(event.status) || webhook.events.includes('*')) {
        try {
          await assertSafeWebhookUrl(webhook.url);

          const payload = {
            trackingCode: trackingCode || event.orderId,
            orderId: event.orderId,
            status: event.status,
            location: event.location,
            description: event.description,
            timestamp: event.timestamp,
          };

          if (this.outbox) {
            await this.outbox.enqueue({
              channel: 'WEBHOOK',
              topic: `tracking.${String(event.status).toLowerCase()}`,
              payload: {
                url: webhook.url,
                event: event.status,
                secretToken: webhook.secretToken,
                body: payload,
              },
            });
            continue;
          }

          const rawBody = JSON.stringify(payload);
          const signature = webhook.secretToken
            ? `sha256=${crypto.createHmac('sha256', webhook.secretToken).update(rawBody).digest('hex')}`
            : 'unsigned';

          await firstValueFrom(
            this.httpService.post(webhook.url, payload, {
              timeout: 5000,
              maxRedirects: 0,
              headers: {
                'Content-Type': 'application/json',
                'X-SLG-Signature': signature,
              },
            }),
          );
        } catch (error: any) {
          this.logger.error(`Webhook dispatch failed for ${webhook.url}: ${error.message}`);
        }
      }
    }
  }
}
