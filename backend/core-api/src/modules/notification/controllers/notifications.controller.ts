import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Request,
  UseGuards,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
  HttpException,
} from "@nestjs/common";
import { IsString, IsArray } from "class-validator";
import { NotificationService } from "../services/notification.service";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { JwtAuthGuard } from "../../../core/auth/jwt-auth.guard";
import { PermissionsGuard, RequirePermissions, ExcludeRoles, Permissions, Roles } from "shared-types";
import { assertSafeWebhookUrl } from "../../../core/utils/webhook-url.util";
import { ApiTags } from "@nestjs/swagger";

class SendNotificationDto {
  @IsString()
  type!: string;

  payload: any;
}

class MarkAsReadDto {
  @IsArray()
  notificationIds!: string[];
}

@ApiTags('Notifications')
@Controller("notifications")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class NotificationsController {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly prisma: PrismaService
  ) {}

  @Post("send")
  @ExcludeRoles(Roles.CUSTOMER_CLIENT, Roles.DRIVER)
  @RequirePermissions(Permissions.SettingsManage)
  async sendNotification(@Body() body: SendNotificationDto) {
    try {
      if (body.type === "EMAIL") {
        return await this.notificationService.sendEmail(
          body.payload?.to,
          body.payload?.subject,
          body.payload?.body,
          body.payload?.userId,
        );
      } else if (body.type === "SMS") {
        return await this.notificationService.sendSms(
          body.payload?.phone,
          body.payload?.message,
          body.payload?.userId,
        );
      } else if (body.type === "PUSH") {
        return await this.notificationService.sendPush(
          body.payload?.userId,
          body.payload?.title,
          body.payload?.body,
        );
      } else if (body.type === "WEBHOOK") {
        await assertSafeWebhookUrl(String(body.payload?.url || ""));
        const webhookUrl = process.env.WEBHOOK_SERVICE_URL || "http://webhook-service:8092";
        const authToken = process.env.WEBHOOK_AUTH_TOKEN || "";
        const response = await fetch(`${webhookUrl}/deliver`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          },
          body: JSON.stringify(body.payload),
        });
        if (response.ok) {
          return { ok: true, message: "Webhook delegated" };
        }
        return { ok: false, message: "Failed to delegate webhook" };
      }

      throw new BadRequestException("Unsupported notification type");
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException("Failed to send notification");
    }
  }

  @Get()
  async getMyNotifications(@Request() req: any) {
    const userId = req.user?.sub;
    if (!userId) {
      throw new BadRequestException("Missing userId context");
    }

    try {
      const notifications = await this.prisma.getTenantDb().notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });

      return { ok: true, data: notifications };
    } catch {
      throw new InternalServerErrorException("Failed to fetch notifications");
    }
  }

  @Get("unread-count")
  async getUnreadCount(@Request() req: any) {
    const userId = req.user?.sub;
    if (!userId) {
      throw new BadRequestException("Missing userId context");
    }

    try {
      const count = await this.prisma.getTenantDb().notification.count({
        where: { userId, isRead: false },
      });

      return { ok: true, count };
    } catch {
      throw new InternalServerErrorException("Failed to fetch unread count");
    }
  }

  @Put("read")
  async markAsRead(@Body() body: MarkAsReadDto, @Request() req: any) {
    const userId = req.user?.sub;
    if (!userId) {
      throw new BadRequestException("Missing userId context");
    }

    if (!body.notificationIds || body.notificationIds.length === 0) {
      throw new BadRequestException("notificationIds array is required");
    }

    try {
      const result = await this.prisma.getTenantDb().notification.updateMany({
        where: {
          id: { in: body.notificationIds },
          userId,
        },
        data: {
          isRead: true,
          readAt: new Date(),
        },
      });

      return { ok: true, message: `Marked ${result.count} notifications as read` };
    } catch {
      throw new InternalServerErrorException("Failed to mark notifications as read");
    }
  }

  @Put("read-all")
  async markAllAsReadPut(@Request() req: any) {
    return this.markAllNotificationsRead(req);
  }

  @Post("read-all")
  async markAllAsReadPost(@Request() req: any) {
    return this.markAllNotificationsRead(req);
  }

  @Get("events")
  async listNotificationEvents(@Request() req: any) {
    const userId = req.user?.sub;
    if (!userId) {
      throw new BadRequestException("Missing userId context");
    }

    try {
      const notifications = await this.prisma.getTenantDb().notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      return { ok: true, data: notifications };
    } catch {
      throw new InternalServerErrorException("Failed to fetch notification events");
    }
  }

  @Delete(":id")
  async removeNotification(@Param("id") id: string, @Request() req: any) {
    const userId = req.user?.sub;
    if (!userId) {
      throw new BadRequestException("Missing userId context");
    }

    try {
      const deleted = await this.prisma.getTenantDb().notification.deleteMany({
        where: { id, userId },
      });
      if (deleted.count === 0) {
        throw new NotFoundException(`Notification ${id} not found`);
      }
      return { ok: true };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException("Failed to delete notification");
    }
  }

  private async markAllNotificationsRead(req: any) {
    const userId = req.user?.sub;
    if (!userId) {
      throw new BadRequestException("Missing userId context");
    }

    try {
      const result = await this.prisma.getTenantDb().notification.updateMany({
        where: { userId, isRead: false },
        data: {
          isRead: true,
          readAt: new Date(),
        },
      });

      return { ok: true, message: `Marked ${result.count} notifications as read` };
    } catch {
      throw new InternalServerErrorException("Failed to mark all notifications as read");
    }
  }
}
