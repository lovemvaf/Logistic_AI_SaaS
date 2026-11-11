'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Topbar } from 'ui-kit';

export default function Header() {
  const router = useRouter();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    router.replace('/login');
  };

  return (
    <Topbar
      title="Trạm đóng gói"
      search={{
        placeholder: 'Tìm mã kiện, mã đơn, vận đơn...',
        label: 'Tìm kiếm',
      }}
      user={{ name: user?.fullName ?? user?.name, email: user?.email, role: user?.role }}
      onLogout={handleLogout}
      logoutLabel="Đăng xuất"
      showNotifications
      notificationsLabel="Thông báo"
      menuLabel="Mở menu"
    />
  );
}
