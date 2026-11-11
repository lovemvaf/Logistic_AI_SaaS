'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import api from '@/lib/api';
import { data, isMockDataSource } from '@/lib/data';
import { roleLabel } from '@/lib/labels';
import {
  EditorialPageHeader,
  EditorialSection,
  EmptyNote,
  MetricBand,
  StatusLabel,
  type EditorialMetric,
  type StatusTone,
} from 'ui-kit';

type HealthState = 'unknown' | 'operational' | 'degraded';

type DashboardStats = {
  activeUsers: number;
  pendingInvites: number;
  totalOrders: number;
  openOrders: number;
  totalSkus: number;
  outOfStockSkus: number;
  warehouseCount: number;
  activeWaves: number;
  activeTrips: number;
  unassignedOrders: number;
  lateOrders: number;
  sosOpen: number;
  disputedCod: number;
  cycleCountDue: number;
  fleetUtilization: string;
  onTimeDelivery: string;
  inventoryAccuracy: string;
  health: HealthState;
};

const INITIAL_STATS: DashboardStats = {
  activeUsers: 0,
  pendingInvites: 0,
  totalOrders: 0,
  openOrders: 0,
  totalSkus: 0,
  outOfStockSkus: 0,
  warehouseCount: 0,
  activeWaves: 0,
  activeTrips: 0,
  unassignedOrders: 0,
  lateOrders: 0,
  sosOpen: 0,
  disputedCod: 0,
  cycleCountDue: 0,
  fleetUtilization: '—',
  onTimeDelivery: '—',
  inventoryAccuracy: '—',
  health: 'unknown',
};

const PERMISSION_LABELS: Record<string, string> = {
  TENANT_ADMIN: 'Quản trị',
  WAREHOUSE_MANAGER: 'Vận hành kho',
  WAREHOUSE_STAFF: 'Vận hành kho',
  LOGISTICS_MANAGER: 'Điều phối',
  DRIVER: 'Tài xế',
  TENANT_USER: 'Chỉ xem',
};

function permissionLabel(role: string) {
  return PERMISSION_LABELS[role] ?? 'Theo vai trò';
}

function displayCount(value: number) {
  return Number.isFinite(value) ? new Intl.NumberFormat('vi-VN').format(value) : '—';
}

function displayMetric(value: string) {
  return value && value !== '—' ? value : '—';
}

function readList(payload: any): any[] {
  const root = payload?.data ?? payload;
  if (Array.isArray(root)) return root;
  if (Array.isArray(root?.data)) return root.data;
  if (Array.isArray(root?.items)) return root.items;
  if (Array.isArray(root?.users)) return root.users;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.users)) return payload.users;
  return [];
}

function readTotal(payload: any): number {
  const root = payload?.data ?? payload;
  const nested = root?.data;
  const candidates = [
    root?.meta?.total,
    root?.total,
    payload?.meta?.total,
    payload?.total,
    nested?.meta?.total,
  ];
  const total = candidates.find((value) => typeof value === 'number');
  if (typeof total === 'number') return total;
  const list = readList(payload);
  return list.length;
}

function readPercent(payload: any, keys: string[]): string {
  const root = payload?.data ?? payload;
  const nested = root?.data ?? root;
  for (const key of keys) {
    const raw = nested?.[key] ?? root?.[key] ?? payload?.[key];
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      return `${Math.round(raw <= 1 ? raw * 100 : raw)}%`;
    }
    if (typeof raw === 'string' && raw.trim()) return raw;
  }
  return '—';
}

export default function DashboardPage() {
  const { user } = useAuth();
  const role = user?.role || 'TENANT_USER';
  const [stats, setStats] = useState<DashboardStats>(INITIAL_STATS);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState('');
  const [today, setToday] = useState('');

  useEffect(() => {
    setToday(
      new Intl.DateTimeFormat('vi-VN', {
        weekday: 'long',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(new Date()),
    );
  }, []);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError('');

    if (isMockDataSource) {
      try {
        const [summary, orderRows, userRows, productRows, warehouseRows, alerts, remittances, counts] =
          await Promise.all([
            data.dashboard(),
            data.orders.list(),
            data.users.list(),
            data.products.list(),
            data.warehouses.list(),
            data.sosAlerts.list(),
            data.remittances.list(),
            data.cycleCounts.list(),
          ]);
        setStats({
          ...INITIAL_STATS,
          activeUsers: userRows.filter((row) => row.status === 'ACTIVE').length,
          pendingInvites: userRows.filter((row) => row.status === 'INVITED').length,
          totalOrders: orderRows.length,
          openOrders: summary.openOrders,
          totalSkus: productRows.length,
          outOfStockSkus: summary.outOfStockSkus,
          warehouseCount: warehouseRows.length,
          activeWaves: summary.activeWaves,
          activeTrips: summary.activeTrips,
          unassignedOrders: summary.unassignedOrders,
          lateOrders: summary.lateOrders,
          sosOpen: alerts.filter((alert) => alert.status !== 'RESOLVED').length,
          disputedCod: remittances.filter((row) => row.status === 'DISPUTED').length,
          cycleCountDue: counts.filter((row) => ['COUNTING', 'REVIEW'].includes(row.status)).length,
          fleetUtilization: `${summary.fleetUtilization}%`,
          onTimeDelivery: `${summary.onTimeRate}%`,
          inventoryAccuracy: `${summary.inventoryAccuracy}%`,
          health: 'operational',
        });
        setHasLoaded(true);
        setLastUpdated(
          new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' }).format(
            new Date(),
          ),
        );
      } catch (err: any) {
        setError(err?.message || 'Không tải được dữ liệu mẫu.');
        setStats(INITIAL_STATS);
      } finally {
        setLoading(false);
      }
      return;
    }

    const requests: Array<{ key: string; request: Promise<any>; optional?: boolean }> = [];
    const add = (key: string, request: Promise<any>, optional = false) =>
      requests.push({ key, request, optional });

    try {
      if (role === 'TENANT_ADMIN') {
        add('users', api.get('/tenant/users'));
        add('health', api.get('/health'));
        add('orders', api.get('/orders', { params: { limit: 1 } }));
        add('openOrders', api.get('/orders', { params: { status: 'NEW', limit: 1 } }));
        add('summary', api.get('/inventory/summary'));
      } else if (role === 'WAREHOUSE_MANAGER' || role === 'WAREHOUSE_STAFF') {
        add('openOrders', api.get('/orders', { params: { status: 'NEW', limit: 1 } }));
        add('orders', api.get('/orders', { params: { limit: 1 } }));
        add('summary', api.get('/inventory/summary'));
        add('waves', api.get('/wms/waves', { params: { status: 'ACTIVE' } }), true);
      } else if (role === 'LOGISTICS_MANAGER') {
        add('trips', api.get('/logistics/trips', { params: { status: 'ACTIVE' } }));
        add('fleet', api.get('/logistics/vehicles/fleet'), true);
        add('unassigned', api.get('/orders', { params: { status: 'UNASSIGNED', limit: 1 } }));
        add('orders', api.get('/orders', { params: { limit: 1 } }));
      } else {
        add('orders', api.get('/orders', { params: { limit: 1 } }));
        add('summary', api.get('/inventory/summary'));
      }

      const results = await Promise.allSettled(requests.map((item) => item.request));
      const next: DashboardStats = { ...INITIAL_STATS };
      let failed = 0;

      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          if (!requests[index].optional) failed += 1;
          return;
        }

        const key = requests[index].key;
        const payload = result.value?.data;

        switch (key) {
          case 'users': {
            const list = readList(payload);
            next.activeUsers = readTotal(payload);
            next.pendingInvites = list.filter(
              (item: any) => item?.status === 'INVITED' || item?.status === 'PENDING',
            ).length;
            break;
          }
          case 'health':
            next.health = 'operational';
            break;
          case 'orders':
            next.totalOrders = readTotal(payload);
            break;
          case 'openOrders':
            next.openOrders = readTotal(payload);
            break;
          case 'summary': {
            const summary = payload?.data ?? payload;
            next.totalSkus = Number(summary?.totalSkus ?? 0) || 0;
            next.outOfStockSkus = Number(summary?.outOfStockSkus ?? 0) || 0;
            next.warehouseCount =
              Number(summary?.warehouses ?? summary?.warehouseCount ?? 0) || 0;
            break;
          }
          case 'waves':
            next.activeWaves = readTotal(payload);
            break;
          case 'trips':
            next.activeTrips = readTotal(payload);
            break;
          case 'unassigned':
            next.unassignedOrders = readTotal(payload);
            break;
          case 'fleet':
            next.fleetUtilization = readPercent(payload, [
              'utilization',
              'utilizationRate',
              'fleetUtilization',
            ]);
            next.onTimeDelivery = readPercent(payload, [
              'onTimeDelivery',
              'onTimeRate',
              'onTimeDeliveryRate',
            ]);
            break;
          default:
            break;
        }
      });

      setStats(next);
      setHasLoaded(true);
      setLastUpdated(
        new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' }).format(new Date()),
      );
      if (failed > 0) {
        setError('Một số chỉ số chưa tải được. Các số còn lại vẫn được cập nhật từ API.');
      }
    } catch {
      setError('Không tải được số liệu vận hành. Vui lòng thử lại.');
      setStats(INITIAL_STATS);
    } finally {
      setLoading(false);
    }
  }, [role]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const firstName = user?.fullName?.trim().split(/\s+/).filter(Boolean).pop() || 'bạn';
  const roleName = roleLabel(role);
  const permission = permissionLabel(role);
  const show = (value: string | number) => (hasLoaded ? value : '—');

  const metrics: EditorialMetric[] =
    role === 'TENANT_ADMIN'
      ? [
          {
            label: 'Người dùng',
            value: show(displayCount(stats.activeUsers)),
            meta: 'Tài khoản trong tenant',
          },
          {
            label: 'Lời mời chờ',
            value: show(displayCount(stats.pendingInvites)),
            meta: stats.pendingInvites > 0 ? 'Cần xử lý' : 'Không có lời mời',
            tone: stats.pendingInvites > 0 ? 'warning' : 'default',
          },
          {
            label: 'Tổng đơn hàng',
            value: show(displayCount(stats.totalOrders)),
            meta: `${displayCount(stats.openOrders)} đơn mới`,
          },
          {
            label: 'SKU hết hàng',
            value: show(displayCount(stats.outOfStockSkus)),
            meta: stats.outOfStockSkus > 0 ? 'Cần nhập thêm' : 'Đã có tồn',
            tone: stats.outOfStockSkus > 0 ? 'danger' : 'success',
          },
        ]
      : role === 'WAREHOUSE_MANAGER' || role === 'WAREHOUSE_STAFF'
        ? [
            {
              label: 'Đơn chờ xử lý',
              value: show(displayCount(stats.openOrders)),
              meta: 'Trạng thái mới',
              tone: stats.openOrders > 0 ? 'warning' : 'default',
            },
            {
              label: 'SKU hết hàng',
              value: show(displayCount(stats.outOfStockSkus)),
              meta: 'Cần nhập thêm',
              tone: stats.outOfStockSkus > 0 ? 'danger' : 'success',
            },
            {
              label: 'Wave đang chạy',
              value: show(displayCount(stats.activeWaves)),
              meta: 'WMS đang xử lý',
            },
            {
              label: 'Độ chính xác tồn',
              value: show(displayMetric(stats.inventoryAccuracy)),
              meta: 'Chưa có dữ liệu kiểm kê',
            },
          ]
        : role === 'LOGISTICS_MANAGER'
          ? [
              {
                label: 'Chuyến đang chạy',
                value: show(displayCount(stats.activeTrips)),
                meta: 'Đội xe đang di chuyển',
              },
              {
                label: 'Đơn chưa gán',
                value: show(displayCount(stats.unassignedOrders)),
                meta: 'Cần điều phối',
                tone: stats.unassignedOrders > 0 ? 'warning' : 'default',
              },
              {
                label: 'Hiệu suất đội xe',
                value: show(displayMetric(stats.fleetUtilization)),
                meta: stats.fleetUtilization === '—' ? 'Chưa có dữ liệu' : 'Tỷ lệ sử dụng',
              },
              {
                label: 'Giao đúng hạn',
                value: show(displayMetric(stats.onTimeDelivery)),
                meta: stats.onTimeDelivery === '—' ? 'Chưa có dữ liệu' : 'Theo kỳ hiện tại',
              },
            ]
          : [
              {
                label: 'Tổng đơn hàng',
                value: show(displayCount(stats.totalOrders)),
                meta: 'Toàn bộ đơn trong tenant',
              },
              {
                label: 'SKU đang quản lý',
                value: show(displayCount(stats.totalSkus)),
                meta: 'Sản phẩm trong tenant',
              },
              {
                label: 'Quyền truy cập',
                value: permission,
                meta: 'Theo vai trò được cấp',
              },
              {
                label: isMockDataSource ? 'Nguồn dữ liệu' : 'Trạng thái API',
                value: isMockDataSource
                  ? 'Dữ liệu mẫu'
                  : stats.health === 'operational'
                    ? 'Ổn định'
                    : 'Chưa rõ',
                meta: isMockDataSource ? 'Lưu trên trình duyệt' : 'Kết nối dịch vụ',
                tone: isMockDataSource || stats.health === 'operational' ? 'success' : 'default',
              },
            ];

  const queueRows: Array<{
    label: string;
    value: string | number;
    status: string;
    tone: StatusTone;
    href: string;
    action: string;
  }> =
    role === 'TENANT_ADMIN'
      ? [
          {
            label: 'Người dùng trong tenant',
            value: show(displayCount(stats.activeUsers)),
            status: 'Đang hoạt động',
            tone: 'info',
            href: '/settings',
            action: 'Quản lý',
          },
          {
            label: 'Kho đang quản lý',
            value: show(displayCount(stats.warehouseCount)),
            status: stats.warehouseCount > 0 ? 'Đang hoạt động' : 'Chưa có kho',
            tone: stats.warehouseCount > 0 ? 'info' : 'neutral',
            href: '/warehouses',
            action: 'Xem kho',
          },
          {
            label: 'Lời mời đang chờ',
            value: show(displayCount(stats.pendingInvites)),
            status: stats.pendingInvites > 0 ? 'Cần xử lý' : 'Đã xử lý',
            tone: stats.pendingInvites > 0 ? 'warning' : 'success',
            href: '/settings',
            action: 'Xem lời mời',
          },
          {
            label: 'Đơn hàng mới',
            value: show(displayCount(stats.openOrders)),
            status: stats.openOrders > 0 ? 'Chờ xử lý' : 'Trong ngưỡng',
            tone: stats.openOrders > 0 ? 'warning' : 'success',
            href: '/orders?status=NEW',
            action: 'Mở đơn hàng',
          },
          {
            label: 'SKU hết hàng',
            value: show(displayCount(stats.outOfStockSkus)),
            status: stats.outOfStockSkus > 0 ? 'Cần nhập thêm' : 'Đã có tồn',
            tone: stats.outOfStockSkus > 0 ? 'danger' : 'success',
            href: '/inventory?lowStock=true',
            action: 'Xem tồn kho',
          },
        ]
      : role === 'WAREHOUSE_MANAGER' || role === 'WAREHOUSE_STAFF'
        ? [
            {
              label: 'Đơn mới chờ xử lý',
              value: show(displayCount(stats.openOrders)),
              status: stats.openOrders > 0 ? 'Chờ xử lý' : 'Đã xử lý',
              tone: stats.openOrders > 0 ? 'warning' : 'success',
              href: '/orders?status=NEW',
              action: 'Mở đơn hàng',
            },
            {
              label: 'SKU hết hàng',
              value: show(displayCount(stats.outOfStockSkus)),
              status: stats.outOfStockSkus > 0 ? 'Cần nhập thêm' : 'Đã có tồn',
              tone: stats.outOfStockSkus > 0 ? 'danger' : 'success',
              href: '/inventory?lowStock=true',
              action: 'Xem tồn kho',
            },
            {
              label: 'Wave đang chạy',
              value: show(displayCount(stats.activeWaves)),
              status: stats.activeWaves > 0 ? 'Đang chạy' : 'Chưa bắt đầu',
              tone: stats.activeWaves > 0 ? 'info' : 'neutral',
              href: '/wms',
              action: 'Mở WMS',
            },
            {
              label: 'Tổng đơn hàng',
              value: show(displayCount(stats.totalOrders)),
              status: 'Theo dõi',
              tone: 'neutral',
              href: '/orders',
              action: 'Xem tất cả',
            },
          ]
        : role === 'LOGISTICS_MANAGER'
          ? [
              {
                label: 'Chuyến đang chạy',
                value: show(displayCount(stats.activeTrips)),
                status: stats.activeTrips > 0 ? 'Đang di chuyển' : 'Chưa có chuyến',
                tone: stats.activeTrips > 0 ? 'info' : 'neutral',
                href: '/logistics/dispatch',
                action: 'Mở điều phối',
              },
              {
                label: 'Đơn chưa gán',
                value: show(displayCount(stats.unassignedOrders)),
                status: stats.unassignedOrders > 0 ? 'Cần điều phối' : 'Đã gán',
                tone: stats.unassignedOrders > 0 ? 'warning' : 'success',
                href: '/orders?status=UNASSIGNED',
                action: 'Xem đơn',
              },
              {
                label: 'Hiệu suất đội xe',
                value: show(displayMetric(stats.fleetUtilization)),
                status: stats.fleetUtilization === '—' ? 'Chưa có dữ liệu' : 'Theo dõi',
                tone: stats.fleetUtilization === '—' ? 'neutral' : 'info',
                href: '/logistics/dispatch',
                action: 'Mở đội xe',
              },
              {
                label: 'Giao đúng hạn',
                value: show(displayMetric(stats.onTimeDelivery)),
                status: stats.onTimeDelivery === '—' ? 'Chưa có dữ liệu' : 'Theo dõi',
                tone: stats.onTimeDelivery === '—' ? 'neutral' : 'success',
                href: '/logistics/dispatch',
                action: 'Xem chuyến',
              },
            ]
          : [
              {
                label: 'Tổng đơn hàng',
                value: show(displayCount(stats.totalOrders)),
                status: 'Chỉ xem',
                tone: 'neutral',
                href: '/orders',
                action: 'Mở đơn hàng',
              },
              {
                label: 'SKU đang quản lý',
                value: show(displayCount(stats.totalSkus)),
                status: 'Chỉ xem',
                tone: 'neutral',
                href: '/inventory',
                action: 'Xem tồn kho',
              },
              {
                label: 'Quyền truy cập',
                value: permission,
                status: 'Theo vai trò',
                tone: 'info',
                href: '/settings',
                action: 'Xem cài đặt',
              },
            ];

  const quickLinks =
    role === 'TENANT_ADMIN'
      ? [
          { label: 'Đơn hàng', caption: 'Theo dõi đơn mới và trạng thái xử lý', href: '/orders' },
          { label: 'Tồn kho', caption: 'Kiểm tra SKU dưới định mức', href: '/inventory' },
          { label: 'Cài đặt tenant', caption: 'Người dùng, lời mời và quyền', href: '/settings' },
        ]
      : role === 'LOGISTICS_MANAGER'
        ? [
            { label: 'Điều phối', caption: 'Chuyến đang chạy và đơn chưa gán', href: '/logistics/dispatch' },
            { label: 'Đơn hàng', caption: 'Danh sách đơn cần điều phối', href: '/orders' },
            { label: 'WMS', caption: 'Trạng thái wave và xuất kho', href: '/wms' },
          ]
        : [
            { label: 'Đơn hàng', caption: 'Danh sách đơn và trạng thái', href: '/orders' },
            { label: 'Tồn kho', caption: 'Mức tồn và SKU dưới định mức', href: '/inventory' },
            { label: 'Kho', caption: 'Danh sách kho và vị trí', href: '/warehouses' },
          ];

  const urgentRows = [
    {
      label: 'Cảnh báo SOS chưa đóng',
      value: stats.sosOpen,
      tone: 'danger' as StatusTone,
      href: '/logistics/sos',
      action: 'Mở SOS',
    },
    {
      label: 'Phiếu COD đang lệch',
      value: stats.disputedCod,
      tone: 'warning' as StatusTone,
      href: '/finance/cod',
      action: 'Đối soát',
    },
    {
      label: 'Đơn quá hạn giao',
      value: stats.lateOrders,
      tone: 'warning' as StatusTone,
      href: '/orders',
      action: 'Xem đơn',
    },
    {
      label: 'Phiếu kiểm kê chờ duyệt',
      value: stats.cycleCountDue,
      tone: 'info' as StatusTone,
      href: '/inventory/cycle-count',
      action: 'Duyệt phiếu',
    },
  ].filter((row) => row.value > 0);

  const roleNote =
    role === 'TENANT_ADMIN'
      ? 'Kiểm tra lời mời và quyền truy cập trước khi bàn giao ca. Chỉ cấp quyền theo vai trò đã được phê duyệt.'
      : role === 'WAREHOUSE_MANAGER' || role === 'WAREHOUSE_STAFF'
        ? 'Ưu tiên đơn mới và SKU dưới định mức. Xác nhận wave đang chạy trước khi kết thúc ca.'
        : role === 'LOGISTICS_MANAGER'
          ? 'Đối chiếu chuyến đang chạy và đơn chưa gán. Xác nhận với tài xế trước khi điều phối lại.'
          : 'Tài khoản của bạn có quyền xem. Liên hệ quản trị tenant nếu cần cập nhật đơn hàng hoặc tồn kho.';

  return (
    <div className="space-y-4">
      <EditorialPageHeader
        eyebrow={
          <>
            <span>{today || 'Bàn giao ca'}</span>
            <span className="text-line-strong" aria-hidden="true">
              /
            </span>
            <span>{roleName}</span>
          </>
        }
        title="Bàn giao ca"
        description={`Chào ${firstName}. Đây là các chỉ số cần nắm trước khi bắt đầu ca, ${
          isMockDataSource
            ? 'lấy từ bộ dữ liệu mẫu lưu trên trình duyệt'
            : 'lấy trực tiếp từ API vận hành của tenant'
        }.`}
        meta={
          <>
            <p>{lastUpdated ? `Cập nhật lúc ${lastUpdated}` : 'Đang đồng bộ số liệu'}</p>
            <p className="mt-0.5">
              <StatusLabel
                tone={
                  isMockDataSource || stats.health === 'operational' ? 'success' : 'neutral'
                }
              >
                {isMockDataSource
                  ? 'Dữ liệu mẫu sẵn sàng'
                  : stats.health === 'operational'
                    ? 'API ổn định'
                    : 'Chưa xác định trạng thái API'}
              </StatusLabel>
            </p>
          </>
        }
        actions={
          <button
            type="button"
            onClick={fetchDashboard}
            disabled={loading}
            className="h-9 rounded-md border border-line px-3 text-[12px] font-medium text-ink-soft transition-colors hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 disabled:cursor-wait disabled:opacity-60"
          >
            {loading ? 'Đang tải…' : 'Làm mới số liệu'}
          </button>
        }
      />

      {error ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-l-2 border-warning bg-surface px-3 py-2 text-[12px] text-ink-soft">
          <span>{error}</span>
          <button
            type="button"
            onClick={fetchDashboard}
            className="font-medium text-accent underline decoration-accent/30 underline-offset-4 hover:decoration-accent"
          >
            Thử lại
          </button>
        </div>
      ) : null}

      <MetricBand metrics={metrics} />

      {isMockDataSource && hasLoaded ? (
        <EditorialSection
          eyebrow="Ưu tiên"
          title="Cần xử lý ngay"
          action={
            <span className="text-[11px] text-ink-faint">
              {urgentRows.length === 0 ? 'Không có việc khẩn' : `${urgentRows.length} nhóm việc`}
            </span>
          }
        >
          {urgentRows.length === 0 ? (
            <EmptyNote>Không có cảnh báo SOS, lệch COD, đơn trễ hạn hay phiếu kiểm kê tồn.</EmptyNote>
          ) : (
            <div className="divide-y divide-line border-y border-line">
              {urgentRows.map((row) => (
                <div
                  key={row.label}
                  className="flex min-h-[42px] flex-wrap items-center justify-between gap-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <StatusLabel tone={row.tone}>{row.label}</StatusLabel>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-[13px] font-semibold tabular-nums text-ink">
                      {row.value}
                    </span>
                    <Link
                      href={row.href}
                      className="text-[12px] font-medium text-accent underline decoration-accent/30 underline-offset-4 hover:decoration-accent"
                    >
                      {row.action}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </EditorialSection>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <EditorialSection
          eyebrow="Hàng đợi"
          title="Việc cần xử lý trong ca"
          action={
            <Link
              href={role === 'LOGISTICS_MANAGER' ? '/logistics/dispatch' : '/orders'}
              className="text-[12px] font-medium text-accent underline decoration-accent/30 underline-offset-4 hover:decoration-accent"
            >
              Mở bảng điều khiển
            </Link>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-left">
              <caption className="sr-only">
                Các việc cần xử lý trong ca hiện tại, số lượng và trạng thái
              </caption>
              <thead>
                <tr className="border-b border-line">
                  <th
                    scope="col"
                    className="h-8 pr-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint"
                  >
                    Hạng mục
                  </th>
                  <th
                    scope="col"
                    className="h-8 px-3 text-right text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint"
                  >
                    Số lượng
                  </th>
                  <th
                    scope="col"
                    className="h-8 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint"
                  >
                    Trạng thái
                  </th>
                  <th
                    scope="col"
                    className="h-8 pl-3 text-right text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint"
                  >
                    Thao tác
                  </th>
                </tr>
              </thead>
              <tbody>
                {queueRows.map((row) => (
                  <tr
                    key={row.label}
                    className="h-[42px] border-b border-line/80 transition-colors hover:bg-surface-alt/60"
                  >
                    <td className="pr-3 text-[13px] font-medium text-ink">{row.label}</td>
                    <td className="px-3 text-right text-[13px] font-semibold tabular-nums text-ink">
                      {row.value}
                    </td>
                    <td className="px-3">
                      <StatusLabel tone={row.tone}>{row.status}</StatusLabel>
                    </td>
                    <td className="pl-3 text-right">
                      <Link
                        href={row.href}
                        className="text-[12px] font-medium text-accent underline decoration-accent/30 underline-offset-4 hover:decoration-accent"
                      >
                        {row.action}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!hasLoaded && loading ? (
            <p className="mt-3 text-[12px] text-ink-faint">Đang tải hàng đợi…</p>
          ) : null}
        </EditorialSection>

        <aside className="space-y-5 border-t border-line pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
              Ghi chú ca
            </p>
            <p className="mt-2 border-l-2 border-accent pl-3 text-[13px] leading-6 text-ink-soft">
              {roleNote}
            </p>
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
              Thao tác nhanh
            </p>
            <div className="mt-2 divide-y divide-line border-y border-line">
              {quickLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="group flex min-h-[42px] items-center justify-between gap-3 py-2 transition-colors hover:text-accent"
                >
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-ink group-hover:text-accent">
                      {link.label}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-ink-faint">
                      {link.caption}
                    </span>
                  </span>
                  <span className="shrink-0 text-[11px] font-medium text-ink-faint group-hover:text-accent">
                    Mở
                  </span>
                </Link>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
              Trạng thái phiên
            </p>
            <dl className="mt-2 space-y-2 text-[12px]">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-ink-faint">Vai trò</dt>
                <dd className="max-w-[150px] truncate text-right font-medium text-ink">{roleName}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-ink-faint">Quyền hiện tại</dt>
                <dd className="text-right font-medium text-ink">{permission}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-ink-faint">Đồng bộ gần nhất</dt>
                <dd className="text-right font-medium tabular-nums text-ink">
                  {lastUpdated || 'Đang đồng bộ'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-ink-faint">
                  {isMockDataSource ? 'Nguồn dữ liệu' : 'Kết nối API'}
                </dt>
                <dd>
                  <StatusLabel
                    tone={
                      isMockDataSource || stats.health === 'operational' ? 'success' : 'neutral'
                    }
                  >
                    {isMockDataSource
                      ? 'Dữ liệu mẫu'
                      : stats.health === 'operational'
                        ? 'Ổn định'
                        : 'Chưa xác định'}
                  </StatusLabel>
                </dd>
              </div>
            </dl>
          </div>

          <EmptyNote>
            {isMockDataSource
              ? 'Số liệu lấy từ bộ dữ liệu mẫu trong trình duyệt. Dùng nút Đặt lại ở thanh trên để trả về trạng thái ban đầu.'
              : 'Số liệu được lấy trực tiếp từ API vận hành. Độ trễ đồng bộ có thể khác nhau giữa đơn hàng, tồn kho và vận chuyển.'}
          </EmptyNote>
        </aside>
      </div>
    </div>
  );
}
