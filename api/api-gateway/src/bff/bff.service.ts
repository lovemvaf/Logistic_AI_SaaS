import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import {
  ActiveTripDto,
  AdminDashboardDto,
  InventorySummaryDto,
  RecentOrderDto,
  TenantDashboardDto,
  TenantDashboardStatsDto,
} from './dto';

interface FetchResult<T> {
  data: T | null;
  failed: boolean;
}

/**
 * BFF: gom nhiều call xuống core-api thành một response, và chuẩn hoá DTO.
 *
 * Nguyên tắc: một nguồn lỗi không được làm sập cả trang. Mỗi nguồn được gọi
 * độc lập, nguồn lỗi trả về `null` và được ghi vào `degraded` để portal biết
 * mà hiển thị cảnh báo thay vì màn hình trắng.
 */
@Injectable()
export class BffService {
  private readonly logger = new Logger(BffService.name);
  private readonly timeoutMs = 15000;

  constructor(private readonly http: HttpService) {}

  private get baseUrl(): string {
    return process.env.CORE_API_URL || 'http://core-api:8081';
  }

  private async fetch<T>(
    path: string,
    authorization?: string,
  ): Promise<FetchResult<T>> {
    try {
      const { data } = await firstValueFrom(
        this.http.get<T>(`${this.baseUrl}/api/v1${path}`, {
          headers: authorization ? { Authorization: authorization } : {},
          timeout: this.timeoutMs,
        }),
      );
      return { data, failed: false };
    } catch (error: any) {
      this.logger.warn(
        `BFF call failed: ${path} (${error?.response?.status || error?.message})`,
      );
      return { data: null, failed: true };
    }
  }

  async tenantDashboard(authorization?: string): Promise<TenantDashboardDto> {
    const [stats, inventory, orders, trips] = await Promise.all([
      this.fetch<any>('/tenant/dashboard/stats', authorization),
      this.fetch<any>('/inventory/summary', authorization),
      this.fetch<any>('/orders?limit=5&page=1', authorization),
      this.fetch<any>('/trips?limit=5&page=1', authorization),
    ]);

    const degraded: string[] = [];
    if (stats.failed) degraded.push('stats');
    if (inventory.failed) degraded.push('inventory');
    if (orders.failed) degraded.push('recentOrders');
    if (trips.failed) degraded.push('activeTrips');

    return {
      stats: this.mapStats(stats.data),
      inventory: this.mapInventory(inventory.data),
      recentOrders: this.mapOrders(orders.data),
      activeTrips: this.mapTrips(trips.data),
      degraded,
      generatedAt: new Date().toISOString(),
    };
  }

  async adminDashboard(authorization?: string): Promise<AdminDashboardDto> {
    const [stats] = await Promise.all([
      this.fetch<any>('/admin/dashboard/stats', authorization),
    ]);

    return {
      mrr: Number(stats.data?.mrr ?? stats.data?.totalMrr ?? 0),
      totalTenants: Number(stats.data?.totalTenants ?? 0),
      activeTenants: Number(stats.data?.activeTenants ?? 0),
      totalUsers: Number(stats.data?.totalUsers ?? 0),
      alerts: Number(stats.data?.alerts ?? 0),
      growthData: Array.isArray(stats.data?.growthData) ? stats.data.growthData : [],
      revenueData: Array.isArray(stats.data?.revenueData) ? stats.data.revenueData : [],
      degraded: stats.failed ? ['stats'] : [],
      generatedAt: new Date().toISOString(),
    };
  }

  // --- Ánh xạ response của core-api sang DTO chuẩn ---

  private mapStats(raw: any): TenantDashboardStatsDto {
    return {
      totalDeliveries: Number(raw?.totalDeliveries ?? 0),
      activeVehicles: Number(raw?.activeVehicles ?? 0),
      delayedTrips: Number(raw?.delayedTrips ?? 0),
      avgOptimization: String(raw?.avgOptimization ?? '—'),
    };
  }

  private mapInventory(raw: any): InventorySummaryDto {
    return {
      totalSkus: Number(raw?.totalSkus ?? 0),
      outOfStockSkus: Number(raw?.outOfStockSkus ?? 0),
      inventoryRecords: Number(raw?.inventoryRecords ?? 0),
      warehouses: Number(raw?.warehouses ?? 0),
    };
  }

  private mapOrders(raw: any): RecentOrderDto[] {
    const rows = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
    return rows.map((order: any) => ({
      id: String(order.id ?? ''),
      trackingCode: String(order.trackingCode ?? ''),
      status: String(order.status ?? 'UNKNOWN'),
      recipientName: String(order.recipientName ?? ''),
      shippingFee: Number(order.shippingFee ?? 0),
      createdAt: order.createdAt ? new Date(order.createdAt).toISOString() : new Date().toISOString(),
    }));
  }

  private mapTrips(raw: any): ActiveTripDto[] {
    const rows = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
    return rows.map((trip: any) => ({
      id: String(trip.id ?? ''),
      tripCode: String(trip.tripCode ?? ''),
      status: String(trip.status ?? 'UNKNOWN'),
      driverName: trip.driver?.fullName ?? null,
      vehiclePlate: trip.vehicle?.plateNumber ?? null,
      plannedStartAt: trip.plannedStartAt
        ? new Date(trip.plannedStartAt).toISOString()
        : null,
    }));
  }
}
