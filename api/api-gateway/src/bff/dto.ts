/**
 * DTO chuẩn hoá của BFF.
 *
 * Portal chỉ phụ thuộc vào các shape ở đây, không phụ thuộc vào shape nội bộ
 * của core-api. Khi core-api đổi response, chỉ BFF phải sửa.
 */

export interface TenantDashboardStatsDto {
  totalDeliveries: number;
  activeVehicles: number;
  delayedTrips: number;
  avgOptimization: string;
}

export interface InventorySummaryDto {
  totalSkus: number;
  outOfStockSkus: number;
  inventoryRecords: number;
  warehouses: number;
}

export interface RecentOrderDto {
  id: string;
  trackingCode: string;
  status: string;
  recipientName: string;
  shippingFee: number;
  createdAt: string;
}

export interface ActiveTripDto {
  id: string;
  tripCode: string;
  status: string;
  driverName: string | null;
  vehiclePlate: string | null;
  plannedStartAt: string | null;
}

export interface TenantDashboardDto {
  stats: TenantDashboardStatsDto;
  inventory: InventorySummaryDto;
  recentOrders: RecentOrderDto[];
  activeTrips: ActiveTripDto[];
  /** Nguồn dữ liệu nào đã lỗi (partial failure) để portal hiển thị cảnh báo. */
  degraded: string[];
  generatedAt: string;
}

export interface AdminDashboardDto {
  mrr: number;
  totalTenants: number;
  activeTenants: number;
  totalUsers: number;
  alerts: number;
  growthData: { month: string; tenants: number }[];
  revenueData: { month: string; amount: number }[];
  degraded: string[];
  generatedAt: string;
}
