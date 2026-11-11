import { redirect } from 'next/navigation';

export default function TenantLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>;
}
