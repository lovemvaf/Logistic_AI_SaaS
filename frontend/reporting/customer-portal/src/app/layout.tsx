import type { Metadata } from 'next';
import './globals.css';
import '../styles/layout-tokens.css';
import AppShell from '@/components/AppShell';
import { ToastHost } from 'ui-components';
import { Providers } from '@/components/Providers';

export const metadata: Metadata = {
  title: 'SmartLogi | Customer',
  description: 'Theo dõi đơn hàng, tồn kho và hóa đơn B2B',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-background text-ink antialiased">
        <ToastHost />
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
