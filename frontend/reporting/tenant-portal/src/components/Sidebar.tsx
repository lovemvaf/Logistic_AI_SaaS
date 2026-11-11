'use client';

import { useMemo } from 'react';
import { Sidebar as SharedSidebar, type NavSection } from 'ui-kit';
import { canAccessRoute } from '@/lib/permissions';
import { useRole } from '@/lib/use-role';

const SECTIONS: NavSection[] = [
  {
    title: 'Vận hành',
    items: [
      { label: 'Tổng quan', href: '/dashboard' },
      { label: 'Đơn hàng', href: '/orders' },
      { label: 'Dự báo nhu cầu', href: '/orders/forecast' },
      { label: 'Định giá vận chuyển', href: '/orders/rate-estimation' },
      { label: 'Tồn kho', href: '/inventory' },
      { label: 'Cất hàng thông minh', href: '/inventory/putaway' },
      { label: 'Cảnh báo tồn kho', href: '/inventory/stock-alerts' },
      { label: 'Kho bãi', href: '/warehouses' },
      { label: 'WMS', href: '/wms', match: '/wms' },
    ],
  },
  {
    title: 'Vận tải',
    items: [
      { label: 'Điều phối', href: '/logistics/dispatch' },
      { label: 'Tài xế', href: '/drivers' },
      { label: 'Phương tiện', href: '/logistics/vehicles' },
      { label: 'Geofence', href: '/logistics/geofences' },
      { label: 'Cảnh báo SOS', href: '/logistics/sos' },
      { label: 'Trả hàng', href: '/logistics/returns' },
      { label: 'Chi phí chuyến', href: '/logistics/expenses' },
      { label: 'Báo cáo vận tải', href: '/logistics/reports' },
    ],
  },
  {
    title: 'Doanh nghiệp & XNK',
    items: [
      { label: 'Địa giới Đồng Nai', href: '/geography' },
      { label: 'Container & Booking', href: '/freight' },
      { label: 'Bãi Cont & EIR', href: '/yard' },
      { label: 'Chứng từ XNK & HS', href: '/trade' },
      { label: 'Giá cước, DEM/DET & DLQ', href: '/finance/freight' },
    ],
  },
  {
    title: 'Tài chính',
    items: [
      { label: 'Đối soát COD', href: '/finance/cod' },
      { label: 'Hoá đơn', href: '/admin/billing' },
      { label: 'Báo cáo doanh nghiệp', href: '/finance/reports' },
    ],
  },
  {
    title: 'Quản trị',
    items: [
      { label: 'Khách hàng', href: '/admin/clients' },
      { label: 'AI Insights', href: '/admin/ai-insights' },
      { label: 'Người dùng', href: '/users' },
      { label: 'Phân quyền', href: '/roles' },
      { label: 'API key', href: '/admin/api-keys' },
      { label: 'Audit log', href: '/admin/audit-logs' },
      { label: 'Chi nhánh', href: '/branches' },
      { label: 'Cài đặt', href: '/settings' },
    ],
  },
  {
    title: 'Cá nhân',
    items: [{ label: 'Hồ sơ', href: '/profile' }],
  },
];

export default function Sidebar() {
  const { role } = useRole();

  // Items stay declared once; visibility is derived so a role never sees a
  // route it would be bounced from. Driver keeps a direct link to its own trips.
  const sections = useMemo<NavSection[]>(() => {
    const filtered = SECTIONS.map((section) => ({
      ...section,
      items: section.items.filter((item) => canAccessRoute(role, item.href)),
    })).filter((section) => section.items.length > 0);

    if (role === 'DRIVER') {
      return [
        {
          title: 'Ca của tôi',
          items: [{ label: 'Chuyến của tôi', href: '/drivers/my-trips' }],
        },
        ...filtered,
      ];
    }

    return filtered;
  }, [role]);

  return (
    <SharedSidebar
      brand={{
        name: 'SmartLogi',
        tagline: 'Bàn giao ca',
        href: '/dashboard',
      }}
      sections={sections}
      labels={{
        closeMenu: 'Đóng menu',
        navigation: 'Điều hướng chính',
      }}
    />
  );
}
