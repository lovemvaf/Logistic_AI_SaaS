'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Trang gốc của pack station không có nội dung riêng; tất cả hoạt động
 * đóng gói bắt đầu từ `/pack`. Trang này chuyển hướng tương đương với
 * `/pack/login` ở trong `AuthGate` của `AppShell` (chuyển về `/login` nếu
 * chưa đăng nhập, về `/pack` nếu đã đăng nhập).
 */

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/pack');
  }, [router]);

  return null;
}
