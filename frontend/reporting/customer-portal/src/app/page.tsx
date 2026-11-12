'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Input, Button } from 'ui-components';
import { DemoControlCenter } from 'ui-kit';
import { DongNaiRouteMap } from 'map-components';

const SAMPLE_TRACKING_CODES = [
  { code: 'SLG-DEMO-DN3PL-0001', label: 'Chờ đóng gói · KCN Long Thành (PENDING)' },
  { code: 'SLG-DEMO-DN3PL-0003', label: 'Đang giao · KCN Trảng Bom -> Amata (IN_TRANSIT)' },
];

const SHOWCASE_STOPS = [
  {
    id: 'wh',
    name: 'ICD Tân Cảng Long Bình',
    locality: 'Phường Long Bình, Đồng Nai',
    lat: 10.9415,
    lng: 106.8908,
    status: 'COMPLETED',
    corridor: 'CENTRAL',
  },
  {
    id: 'amata',
    name: 'KCN Amata Biên Hòa',
    locality: 'Phường Long Bình, Đồng Nai',
    lat: 10.9478,
    lng: 106.8722,
    status: 'CURRENT',
    corridor: 'CENTRAL',
  },
  {
    id: 'lt',
    name: 'KCN Long Thành',
    locality: 'Phường Long Thành, Đồng Nai',
    lat: 10.7782,
    lng: 106.9531,
    status: 'PENDING',
    corridor: 'SOUTH',
  },
  {
    id: 'catlai',
    name: 'Cảng Cát Lái',
    locality: 'TP. Thủ Đức, TP.HCM',
    outsideCity: true,
    lat: 10.7689,
    lng: 106.7944,
    status: 'PENDING',
    corridor: 'SOUTH',
  },
];

export default function CustomerPortalLanding() {
  const router = useRouter();
  const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
  const [trackingInput, setTrackingInput] = useState('');

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const raw =
      trackingInput.trim() || ((event.currentTarget[0] as HTMLInputElement)?.value || '').trim();
    const code = raw.toUpperCase();
    if (!code) return;
    router.push(`/track/${encodeURIComponent(code)}`);
  };

  return (
    <div className="min-h-[100dvh] bg-canvas px-4 py-8 font-sans text-ink sm:px-6">
      <div className="mx-auto flex max-w-[74rem] flex-col items-center justify-center gap-8 pt-6">
        <div className="text-center">
          <Link
            href="/client/dashboard"
            className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-faint hover:text-accent"
          >
            Cổng khách B2B &amp; Tra cứu Vận đơn Đồng Nai 2026
          </Link>
          <h1 className="font-editorial mt-4 text-[46px] font-semibold leading-[0.98] tracking-[-0.02em] sm:text-[60px]">
            Theo dõi kiện hàng.
            <br />
            <span className="text-accent">Thực và rõ ràng.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-[54ch] text-[13px] leading-6 text-ink-soft">
            Nhập mã vận đơn để xem hành trình mô phỏng trên bản đồ Đồng Nai, vị trí làm tròn công khai,
            tiến độ chặng và dự báo ETA — không cần đăng nhập.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex w-full max-w-[44rem] flex-col gap-3 md:flex-row"
        >
          <Input
            type="text"
            aria-label="Mã vận đơn cần tra cứu"
            placeholder="SLG-DEMO-DN3PL-0003"
            value={trackingInput}
            onChange={(e) => setTrackingInput(e.target.value)}
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

        <div className="flex flex-wrap items-center justify-center gap-2 text-[12px]">
          <span className="text-ink-faint">Mã vận đơn tra cứu nhanh:</span>
          {SAMPLE_TRACKING_CODES.map((item) => (
            <Link
              key={item.code}
              href={`/track/${item.code}`}
              className="rounded-md border border-line bg-surface px-3 py-1.5 font-mono text-[11px] text-ink transition-colors hover:border-accent hover:text-accent"
            >
              {item.code} · {item.label}
            </Link>
          ))}
        </div>

        <div className="w-full max-w-[58rem]">
          <DongNaiRouteMap
            title="Mạng lưới Hành lang Vận tải Đồng Nai — Cảng Gateway (Live Showcase)"
            subtitle="Từ trục Bắc (Đồng Xoài · Chơn Thành) qua Trung tâm (Amata · ICD Long Bình · Long Khánh) tới Cụm Cảng (Nhơn Trạch · Phước An · Cát Lái · Cái Mép)"
            stops={SHOWCASE_STOPS}
            waypoints={SHOWCASE_STOPS.map((s) => ({ lat: s.lat, lng: s.lng, label: s.name }))}
            progressPercent={54}
            interactivePlayback
            isSimulatedRoute
            precisionLabel="PUBLIC PREVIEW"
            height={280}
          />
        </div>

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
