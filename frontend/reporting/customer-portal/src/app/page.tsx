'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Input, Button } from 'ui-components';

/**
 * Landing trang tra cứu công khai của khách hàng.
 *
 * Không đăng nhập, không nền tối, không spinner. Nhập mã vận đơn để mở
 * màn theo dõi. Link đến đăng nhập xuất hiện khi khách muốn vào vùng chúng
 * tôi.
 */

export default function CustomerPortalLanding() {
  const router = useRouter();

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = (event.currentTarget[0] as HTMLInputElement).value.trim();
    if (!code) return;
    router.push(`/track/${code}`);
  };

  return (
    <div className="min-h-[100dvh] bg-canvas p-6 font-sans text-ink">
      <div className="mx-auto flex min-h-[100dvh] max-w-[72rem] flex-col items-center justify-center gap-12">
        <div className="text-center">
          <Link href="/client/dashboard" className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-faint hover:text-accent">
            Cổng khách B2B
          </Link>
          <h1 className="font-editorial mt-4 text-[56px] font-semibold leading-[0.95] tracking-[-0.02em] sm:text-[64px]">
            Theo dõi kiện hàng.<br />
            <span className="text-accent">Thực và rõ ràng.</span>
          </h1>
          <p className="mt-4 max-w-[42ch] text-[13px] leading-6 text-ink-soft">
            Nhập mã vận đơn để xem vị trí, trạng thái và báo vận chuyển — công khai, không cần đăng nhập.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex w-full max-w-[44rem] flex-col gap-3 md:flex-row"
        >
          <Input
            type="text"
            placeholder="SLG-YYYYMMDD-XXXXXX"
            className="flex-1"
            required
          />
          <Button
            type="submit"
            variant="primary"
            className="h-12 whitespace-nowrap text-[13px] font-semibold uppercase tracking-[0.12em] rounded-lg"
          >
            Tìm mã vận đơn
          </Button>
        </form>

        <div className="flex items-center gap-3 text-[13px]">
          <p className="text-ink-faint">Đã có tài khoản doanh nghiệp?</p>
          <Link href="/client/login" className="text-accent underline decoration-accent/30 hover:decoration-accent">
            Đến đăng nhập
          </Link>
        </div>
      </div>
    </div>
  );
}
