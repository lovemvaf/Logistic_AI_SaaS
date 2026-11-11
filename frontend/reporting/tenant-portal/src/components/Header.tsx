'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { Topbar } from 'ui-kit';
import { data, isMockDataSource } from '@/lib/data';
import { subscribeNotificationsChanged } from '@/lib/notifications-bus';
import DemoActions from '@/components/DemoActions';

export default function Header() {
  const { user, logout } = useAuth();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!isMockDataSource) return;

    let active = true;
    const load = async () => {
      try {
        const rows = await data.notifications.list();
        if (active) setUnread(rows.filter((row) => !row.read).length);
      } catch {
        if (active) setUnread(0);
      }
    };

    load();
    const unsubscribe = subscribeNotificationsChanged(load);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return (
    <Topbar
      search={{
        placeholder: 'Tìm đơn hàng, tồn kho, vận đơn...',
        label: 'Tìm kiếm',
      }}
      user={{ name: user?.fullName, email: user?.email, role: user?.role }}
      onLogout={logout}
      logoutLabel="Đăng xuất"
      notificationsHref="/notifications"
      notificationsLabel={unread > 0 ? `Thông báo (${unread})` : 'Thông báo'}
      actions={isMockDataSource ? <DemoActions /> : undefined}
      menuLabel="Mở menu"
    />
  );
}
