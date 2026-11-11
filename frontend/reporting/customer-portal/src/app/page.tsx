'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Input, Button } from 'ui-components';
import { DemoControlCenter } from 'ui-kit';

const SAMPLE_TRACKING_CODES = [
  { code: 'SLG-DEMO-DN3PL-0001', label: 'Đơn đang giao KCN Amata' },
  { code: 'SLG-DEMO-DN3PL-0003', label: 'Đơn chờ xuất / đóng gói' },
];

export default function CustomerPortalLanding() {
  const router = useRouter();
  const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = (event.currentTarget[0] as HTMLInputElement).value.trim();
    if (!code) return;
    router.push(`/track/${code}`);
  };

  return (
    <div className="min-h-[100dvh] bg-canvas p-6 font-sans text-ink">
      <div className="mx-auto flex min-h-[100dvh] max-w-[72rem] flex-col items-center justify-center gap-10">
        <div className="text-center">
          <Link
            href="/client/dashboard"
            className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-faint hover:text-accent"
          >
            Cổng khách B2B
          </Link>
          <h1 className="font-editorial mt-4 text-[56px] font-semibold leading-[0.95] tracking-[-0.02em] sm:text-[64px]">
            Theo dõi kiện hàng.
            <br />
            <span className="text-accent">Thực và rõ ràng.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-[46ch] text-[13px] leading-6 text-ink-soft">
            Nhập mã vận đơn để xem vị trí làm tròn công khai, trạng thái và dự báo ETA — không cần
            đăng nhập.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex w-full max-w-[44rem] flex-col gap-3 md:flex-row"
        >
          <Input
            type="text"
            placeholder="SLG-DEMO-DN3PL-0001"
            className="flex-1"
            required
          />
          <Button
            type="submit"
            variant="primary"
            className="h-12 whitespace-nowrap rounded-lg text-[13px] font-semibold uppercase tracking-[0.12em]"
          >
            Tìm mã vận đơn
          </Button>
        </form>

        {isDemoMode ? (
          <div className="flex flex-wrap items-center justify-center gap-2 text-[12px]">
            <span className="text-ink-faint">Mã vận đơn demo:</span>
            {SAMPLE_TRACKING_CODES.map((item) => (
              <Link
                key={item.code}
                href={`/track/${item.code}`}
                className="rounded-md border border-line bg-surface px-2.5 py-1 font-mono text-[11px] text-ink hover:border-accent hover:text-accent"
              >
                {item.code} ({item.label})
              </Link>
            ))}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-center gap-4 text-[13px]">
          <p className="text-ink-faint">Đã có tài khoản doanh nghiệp?</p>
          <Link
            href="/client/login"
            className="text-accent underline decoration-accent/30 hover:decoration-accent"
          >
            Đến đăng nhập Khách B2B
          </Link>
          <Link href="/build-info" className="text-ink-faint hover:text-accent">
            /build-info
          </Link>
        </div>
      </div>
      {isDemoMode ? <DemoControlCenter variant="floating" portalOverride="customer" /> : null}
    </div>
  );
}
