import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, Logger } from '@nestjs/common';
import { Request } from 'express';
import { getJwtSecret } from '../config/services.config';
import { Permissions } from 'shared-types';
import { isPublicPath, verifyBearerToken } from '../auth/token-verifier';

const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  WAREHOUSE_MANAGER: [
    Permissions.InventoryRead,
    Permissions.InventoryAdjust,
    Permissions.WarehousesManage,
    Permissions.TasksRead,
    Permissions.TasksCreate,
    Permissions.TasksUpdate,
    Permissions.OrdersRead,
    Permissions.VehiclesRead,
    Permissions.UsersRead,
    Permissions.NotificationsRead,
    Permissions.PackStationScan,
  ],
  WAREHOUSE_STAFF: [
    Permissions.InventoryRead,
    Permissions.TasksRead,
    Permissions.TasksUpdate,
    Permissions.MobileSyncPull,
    Permissions.MobileSyncPush,
    Permissions.PackStationScan,
  ],
  LOGISTICS_MANAGER: [
    Permissions.OrdersRead,
    Permissions.OrdersCreate,
    Permissions.TripsRead,
    Permissions.TripsDispatch,
    Permissions.VehiclesRead,
    Permissions.VehiclesManage,
    Permissions.DriversManage,
    Permissions.UsersRead,
    Permissions.NotificationsRead,
    Permissions.ReturnsRead,
    Permissions.ReturnsCreate,
    Permissions.ReturnsApprove,
  ],
  TENANT_ADMIN: [
    Permissions.OrdersRead,
    Permissions.OrdersCreate,
    Permissions.InventoryRead,
    Permissions.InventoryAdjust,
    Permissions.WarehousesManage,
    Permissions.TasksRead,
    Permissions.TasksCreate,
    Permissions.TasksUpdate,
    Permissions.TripsRead,
    Permissions.TripsDispatch,
    Permissions.VehiclesRead,
    Permissions.VehiclesManage,
    Permissions.DriversManage,
    Permissions.UsersRead,
    Permissions.UsersInvite,
    Permissions.RolesManage,
    Permissions.SettingsManage,
    Permissions.AuditLogsRead,
    Permissions.BillingRead,
    Permissions.ApiKeysManage,
    Permissions.NotificationsRead,
    Permissions.MobileSyncPull,
    Permissions.MobileSyncPush,
    Permissions.MobileUploads,
    Permissions.MobileGpsBatch,
    Permissions.MobileSos,
    Permissions.PackStationScan,
    Permissions.ReturnsRead,
    Permissions.ReturnsCreate,
    Permissions.ReturnsApprove,
    Permissions.ReturnsInspect,
    Permissions.ReturnsRefund,
  ],
  TENANT_USER: [
    Permissions.InventoryRead,
    Permissions.OrdersRead,
    Permissions.TasksRead,
    Permissions.TripsRead,
  ],
  SUPER_ADMIN: [],
  DRIVER: [
    Permissions.TripsRead,
    Permissions.MobileSyncPull,
    Permissions.MobileSyncPush,
    Permissions.MobileUploads,
    Permissions.MobileGpsBatch,
    Permissions.MobileSos,
  ],
  CUSTOMER_CLIENT: [
    Permissions.OrdersRead,
    Permissions.OrdersCreate,
    Permissions.InventoryRead,
    Permissions.NotificationsRead,
    Permissions.ReturnsRead,
    Permissions.ReturnsCreate,
    Permissions.BillingRead,
  ],
};

@Injectable()
export class JwtGatewayGuard implements CanActivate {
  private readonly logger = new Logger(JwtGatewayGuard.name);
  private readonly jwtSecret: string;

  constructor() {
    try {
      this.jwtSecret = getJwtSecret();
    } catch (error) {
      this.logger.error('JWT_SECRET is not configured. Set JWT_SECRET environment variable.');
      throw error;
    }
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const path = request.originalUrl;

    if (isPublicPath(path)) {
      return true;
    }

    const result = verifyBearerToken(request);
    if (!result.ok) {
      throw new UnauthorizedException(
        result.reason === 'missing'
          ? 'Missing or invalid authorization header'
          : 'Invalid or expired token',
      );
    }

    (request as any).user = result.user;
    return true;
  }
}
