'use client';

import { data } from '@/lib/data';
import {
  EditorialPageHeader,
  EditorialSection,
  MetricBand,
  StatusLabel,
  EmptyNote,
} from 'ui-kit';
import { TableState } from 'ui-components';
import { formatNumber, formatDateVN } from '@/lib/labels';
import type { Order, ServiceLevel } from '@/lib/mock';
import { useEffect, useState, useCallback } from 'react';

type DailyRow = {
  date: string;
  label: string;
  weekday: string;
  created: number;
  delivered: number;
};

type ForecastRow = {
  date: string;
  label: string;
  weekday: string;
  predicted: number;
  band: string;
};

type ServiceRow = {
  service: ServiceLevel;
  created: number;
  delivered: number;
  share: string;
};

type WeekStats = { created: number; delivered: number };

type Analysis = {
  daily: DailyRow[];
  forecast: ForecastRow[];
  byService: ServiceRow[];
  weekLabel: string;
  trend: string;
  trendTone: 'default' | 'warning' | 'danger' | 'success';
};

const WEEKDAYS = ['Chủ', 'Hai', 'Ba', 'Tư', 'Năm', 'Sáu', 'Bảy'];

/**
 * Khóa tuần ISO `{ year }-W{ week }` (Thứ Hai là ngày đầu tuần, tuần 1 chứa
 * ngày 4/1). Tuần ISO được xác định theo năm của ngày Thứ Năm trong tuần, nên
 * các khoảng năm mới hết tháng vẫn ghép đúng.
 */
function isoWeekKey(date: Date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dow = d.getUTCDay() || 7;
  const thursday = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 4 - dow),
  );
  const year = thursday.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dowOfJan4 = (jan4.getUTCDay() || 7) - 1;
  const weekOneStart = new Date(jan4.getTime() - dowOfJan4 * 86400000);
  return `${year}-W${String(
    Math.floor((thursday.getTime() - weekOneStart.getTime()) / 604800000) + 1,
  ).padStart(2, '0')}`;
}

/** Ngày đầu (Thứ Hai) của một tuần ISO. */
function weekStartOfWeekNumber(year: number, week: number) {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dowOfJan4 = (jan4.getUTCDay() || 7) - 1;
  const weekOneStart = new Date(jan4.getTime() - dowOfJan4 * 86400000);
  const start = new Date(weekOneStart.getTime() + (week - 1) * 604800000);
  start.setUTCDate(start.getUTCDate() - (start.getUTCDay() || 7));
  return start;
}

/** 7 ngày lịch trình tính đến hôm nay, lấy thời gian làm cửa sổ dự báo. */
function lastSevenDays() {
  const now = new Date();
  const list: Date[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    list.push(d);
  }
  return list;
}

/**
 * Tính toán dự báo nhu cầu:
 * - băng ngày: số đơn hàng tạo ra và giao thành công trong 7 ngày gần nhất;
 * - trung bình động 3 ngày cuối làm cơ sở dự báo 7 ngày tiếp theo;
 * - xu hướng tuần: so tuần ISO hiện tại (nửa cuối) với tuần ISO liền trước
 *   dựa trên toàn bộ đơn hàng, không tính trùng với băng ngày bên trên.
 */
function analyze(orders: Order[]): Analysis {
  const daily: DailyRow[] = [];
  for (const day of lastSevenDays()) {
    daily.push({
      date: day.toISOString().slice(0, 10),
      label: `${String(day.getDate()).padStart(2, '0')}/${String(day.getMonth() + 1).padStart(2, '0')}`,
      weekday: WEEKDAYS[day.getDay()],
      created: 0,
      delivered: 0,
    });
  }

  const byService: Record<ServiceLevel, WeekStats> = {
    STANDARD: { created: 0, delivered: 0 },
    EXPRESS: { created: 0, delivered: 0 },
    SAME_DAY: { created: 0, delivered: 0 },
  };

  // Toàn bộ đơn hàng được nhóm week độc lập, không cộng trùng với băng 7 ngày.
  const weekMap: Record<string, WeekStats> = {};

  for (const order of orders) {
    const key = order.createdAt.slice(0, 10);
    const row = daily.find((r) => r.date === key);
    if (row) {
      row.created += 1;
      if (order.status === 'DELIVERED') row.delivered += 1;
    }
    byService[order.service].created += 1;
    if (order.status === 'DELIVERED') byService[order.service].delivered += 1;

    const weekKey = isoWeekKey(new Date(order.createdAt));
    const stats = weekMap[weekKey] ?? { created: 0, delivered: 0 };
    stats.created += 1;
    if (order.status === 'DELIVERED') stats.delivered += 1;
  }

  const createdTotal = daily.reduce((total, r) => total + r.created, 0);

  // Trung bình động 3 ngày cuối làm cơ sở dự báo.
  const last3 = daily.slice(-3);
  const avg = Math.max(1, Math.round(last3.reduce((total, r) => total + r.created, 0) / 3));
  const variance = Math.max(1, Math.round(avg * 0.15));

  const forecast: ForecastRow[] = [];
  const now = new Date();
  for (let i = 1; i <= 7; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    forecast.push({
      date: d.toISOString().slice(0, 10),
      label: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`,
      weekday: WEEKDAYS[d.getDay()],
      predicted: avg,
      band: `±${variance}`,
    });
  }

  const keys = Object.keys(weekMap).sort();
  const thisKey = keys[keys.length - 1] ?? '';
  const lastKey = keys[keys.length - 2] ?? '';
  const thisWeek = weekMap[thisKey] ?? { created: 0, delivered: 0 };
  const lastWeek = weekMap[lastKey] ?? { created: 0, delivered: 0 };

  const lastWeekStart = lastKey ? weekStartOfWeekNumber(parseInt(lastKey.split('-')[0], 10), parseInt(lastKey.split('-W')[1], 10)) : undefined;
  const weekLabel = lastWeekStart
    ? `Tuần ${lastKey.split('-W')[1]} (${formatDateVN(lastWeekStart.toISOString())} – ${formatDateVN(new Date(lastWeekStart.getTime() + 6 * 86400000).toISOString())})`
    : '—';

  const change =
    lastWeek.created === 0
      ? thisWeek.created === 0
        ? 'Chưa đủ dữ liệu so sánh'
        : '+100% so tuần liền trước'
      : `${thisWeek.created > lastWeek.created ? '+' : '-'}${Math.abs(
          Math.round(((thisWeek.created - lastWeek.created) / Math.max(1, lastWeek.created)) * 100),
        )}`;

  const trendTone = thisWeek.created > lastWeek.created ? 'success' : thisWeek.created < lastWeek.created ? 'danger' : 'default';

  return {
    daily,
    forecast,
    byService: Object.entries(byService).map(([service, stats]) => ({
      service: service as ServiceLevel,
      created: stats.created,
      delivered: stats.delivered,
      share: createdTotal === 0 ? '0%' : `${(stats.created / createdTotal * 100).toFixed(1)}%`,
    })),
    weekLabel,
    trend: `${change}${lastWeek.created > 0 ? ' so tuần liền trước' : ''}`,
    trendTone,
  };
}

export default function DemandForecastPage() {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setAnalysis(analyze(await data.orders.list()));
    } catch (err: any) {
      setError(err?.message || 'Không tải được dữ liệu mẫu.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const today = new Date().toISOString().slice(0, 10);

  const metrics = [
    {
      label: 'Đơn hàng 7 ngày',
      value: formatNumber(analysis?.daily.reduce((t, r) => t + r.created, 0) ?? 0),
      meta: `${analysis?.daily.reduce((t, r) => t + r.delivered, 0) ?? 0} đơn giao thành công`,
    },
    {
      label: 'Dự báo trung bình',
      value: formatNumber(analysis?.forecast[0]?.predicted ?? 0),
      meta: `7 ngày tới · trung bình động 3 ngày`,
    },
    {
      label: 'Xu hướng tuần',
      value: analysis?.trend ?? '—',
      meta: analysis?.weekLabel ?? '—',
      tone: analysis?.trendTone ?? 'default',
    },
  ];

  return (
    <div className="space-y-5">
      <EditorialPageHeader
        eyebrow="Dự báo nhu cầu"
        title="Dự báo nhu cầu"
        description="Phân tích số đơn hàng sinh ra mỗi ngày trong 7 ngày gần nhất, ước lượng mô hình trung bình động cho 7 ngày tiếp theo. Số liệu lấy trực tiếp từ chuỗi đơn hàng mẫu của tenant, không gọi dịch vụ ngoài."
        meta={
          <span className="text-[11px] leading-5 text-ink-faint">Cập nhật {formatDateVN(new Date().toISOString())}</span>
        }
        actions={
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="h-9 rounded-md border border-line px-3 text-[12px] font-medium text-ink-soft transition-colors hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 disabled:cursor-wait disabled:opacity-60"
          >
            {loading ? 'Đang tải…' : 'Làm mới số liệu'}
          </button>
        }
      />

      {error ? (
        <div className="flex items-center gap-2 border-l-2 border-danger bg-surface px-3 py-2 text-[12px] text-ink-faint">
          <span>{error}</span>
          <button type="button" onClick={load} className="font-medium text-accent underline decoration-accent/30 hover:decoration-accent">
            Thử lại
          </button>
        </div>
      ) : null}

      <MetricBand metrics={metrics} />

      <EditorialSection
        eyebrow="Xu hướng hàng ngày"
        title="Số đơn tạo và giao thành công theo ngày"
        action={<StatusLabel tone="info">7 ngày gần nhất</StatusLabel>}
      >
        <div className="overflow-x-auto rounded-lg border border-line">
          <TableState
            loading={loading}
            empty={!loading && analysis?.daily.every((r) => r.created === 0)}
            error={error ? new Error(error) : undefined}
            onRetry={load}
            colSpan={5}
            emptyContent={<EmptyNote>Chưa có đơn hàng nào trong 7 ngày gần nhất.</EmptyNote>}
          >
            <table className="w-full border-collapse">
              <thead className="border-b border-line bg-surface-alt">
                <tr>
                  <th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">Ngày</th>
                  <th className="px-4 py-2 text-right text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">Đơn tạo</th>
                  <th className="px-4 py-2 text-right text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">Đã giao</th>
                  <th className="px-4 py-2 text-center text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">So với hôm qua</th>
                  <th className="px-4 py-2 text-right text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">Xu hướng</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-[13px]">
                {analysis?.daily.map((row, index) => {
                  const prev = analysis.daily[index - 1] ?? { created: 0 };
                  const delta = row.created - prev.created;
                  return (
                    <tr key={row.date} className="hover:bg-surface-alt">
                      <td className="px-4 py-2 text-[13px] font-medium text-ink">
                        {row.label} · {row.weekday}
                      </td>
                      <td className="px-4 py-2 text-right font-semibold tabular-nums text-ink">{row.created}</td>
                      <td className="px-4 py-2 text-right font-semibold tabular-nums text-ink">{row.delivered}</td>
                      <td className="px-4 py-2 text-center">
                        <StatusLabel
                          tone={
                            delta > 0
                              ? 'success'
                              : delta < 0
                                ? 'danger'
                                : row.created === 0
                                  ? 'neutral'
                                  : 'info'
                          }
                        >
                          {delta === 0 ? 'Không thay đổi' : (delta > 0 ? '+' : '') + delta}
                        </StatusLabel>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <span className={`text-[11px] font-medium ${row.date === today ? 'text-accent' : 'text-ink-faint'}`}>
                          {row.date === today ? 'Hôm nay' : '—'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableState>
        </div>
        <EmptyNote>
          Số liệu xác thực: đơn có trạng thái DELIVERED được tính 1 giao thành công, các ngày trống hiển thị 0. Phương pháp ước lượng mở rộng từ chuỗi giá trị.
        </EmptyNote>
      </EditorialSection>

      <EditorialSection
        eyebrow="Dự báo"
        title="7 ngày tới — mô hình trung bình động"
        action={<StatusLabel tone="info">± biên độ</StatusLabel>}
      >
        <div className="overflow-x-auto rounded-lg border border-line">
          <TableState
            loading={loading}
            empty={!loading && analysis?.forecast.length === 0}
            error={error ? new Error(error) : undefined}
            onRetry={load}
            colSpan={4}
            emptyContent={<EmptyNote>Chưa có dữ liệu để dự báo.</EmptyNote>}
          >
            <table className="w-full border-collapse">
              <tbody className="divide-y divide-line text-[13px]">
                {analysis?.forecast.map((row) => (
                  <tr key={row.date} className="hover:bg-surface-alt">
                    <td className="px-4 py-2 text-[13px] font-medium text-ink">
                      {row.label} · {row.weekday}
                    </td>
                    <td className="px-4 py-2 text-center font-semibold tabular-nums text-ink">{row.predicted}</td>
                    <td className="px-4 py-2 text-center">
                      <StatusLabel tone="info">{row.band}</StatusLabel>
                    </td>
                    <td className="px-4 py-2 text-right text-[11px] font-medium text-ink-faint">
                      Tính 3 ngày gần nhất
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableState>
        </div>
      </EditorialSection>

      <EditorialSection eyebrow="Dịch vụ" title="Tỷ trọng theo loại dịch vụ">
        <div className="overflow-x-auto rounded-lg border border-line">
          <TableState
            loading={loading}
            empty={!loading && analysis?.byService.every((r) => r.created === 0)}
            error={error ? new Error(error) : undefined}
            onRetry={load}
            colSpan={4}
            emptyContent={<EmptyNote>Chưa có đơn hàng dịch vụ nào để phân tích.</EmptyNote>}
          >
            <table className="w-full border-collapse">
              <tbody className="divide-y divide-line text-[13px]">
                {analysis?.byService.map((row) => (
                  <tr key={row.service} className="hover:bg-surface-alt">
                    <td className="px-4 py-2 text-[13px] font-medium text-ink">{row.service}</td>
                    <td className="px-4 py-2 text-center font-semibold tabular-nums text-ink">{row.created}</td>
                    <td className="px-4 py-2 text-center font-semibold tabular-nums text-ink">{row.delivered}</td>
                    <td className="px-4 py-2 text-right">
                      <StatusLabel
                        tone={
                          row.service === 'STANDARD'
                            ? 'success'
                            : row.service === 'EXPRESS'
                              ? 'info'
                              : 'warning'
                        }
                      >
                        {row.share}
                      </StatusLabel>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableState>
        </div>
        <EmptyNote>
          Tỷ trọng tính trên tổng số đơn hàng tạo ra trong 7 ngày gần nhất. Tuỳ vào khả năng thực tế chuyển dịch doanh số.
        </EmptyNote>
      </EditorialSection>
    </div>
  );
}
