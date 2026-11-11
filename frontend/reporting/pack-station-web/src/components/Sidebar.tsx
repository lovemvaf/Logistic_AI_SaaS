'use client';

import { Sidebar as SharedSidebar, type NavSection } from 'ui-kit';

const sections: NavSection[] = [
  {
    title: 'Vận hành',
    items: [
      { label: 'Đóng gói', href: '/pack', exact: true },
      { label: 'Nhật ký', href: '/pack/logs' },
    ],
  },
];

export default function Sidebar() {
  return (
    <SharedSidebar
      brand={{
        name: 'SmartLogi',
        tagline: 'Pack Station',
        href: '/pack',
      }}
      sections={sections}
      labels={{
        closeMenu: 'Đóng menu',
        navigation: 'Điều hướng chính',
      }}
    />
  );
}
