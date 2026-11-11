'use client';

import { data } from '@/lib/data';
import { EditorialPageHeader, EditorialSection, StatusLabel, EmptyNote } from 'ui-kit';
import { TableState } from 'ui-components';
import { formatCurrency, formatDateVN, serviceLabel, serviceTone } from '@/lib/labels';
import type { Product, ServiceLevel } from '@/lib/mock';
import { useEffect, useState, useCallback } from 'react';

/**
 * Hệ thống định giá điểm chuẩn: phí dựa trên mức dịch vụ (STANDARD, EXPRESS,
 * SAME_DAY), khoảng cách vận chuyển và trọng lượng (bao gồm khối lượng quy đổi
 * thể tích 1 CBM = 167 kg). Giá cuối làm tròn đến nghìn đồng.
 */

type RateModel = { base: number; perKm: number; perKg: number };

const RATES: Record<ServiceLevel, RateModel> = {
  STANDARD: { base: 24_000, perKm: 1_800, perKg: 3_500 },
  EXPRESS: { base: 48_000, perKm: 3_600, perKg: 5_000 },
  SAME_DAY: { base: 96_000, perKm: 6_000, perKg: 9_000 },
};

/** 1 CBM = 167 kg, quy đổi khối lượng cồng kềnh ra trọng tải tính cước. */
const VOLUME_KG_PER_CBM = 167;

const DISTANCE_BANDS = [
  { label: '1-10 km', mid: 5 },
  { label: '11-25 km', mid: 18 },
  { label: '26-50 km', mid: 38 },
  { label: '51-100 km', mid: 75 },
  { label: '>100 km', mid: 150 },
];

const QUANTITY_BANDS = ['1', '5', '15', '30', '50'];

function roundToThousand(value: number) {
  return Math.round(value / 1_000) * 1_000;
}

function estimateRate(service: ServiceLevel, distanceKm: number, weightKg: number, volumeCbm = 0): number {
  const { base, perKm, perKg } = RATES[service];
  const volumetric = volumeCbm > 0 ? Math.ceil(volumeCbm * VOLUME_KG_PER_CBM) : 0;
  const chargeable = Math.max(weightKg, volumetric);
  return roundToThousand(base + perKm * distanceKm + perKg * chargeable);
}

type UserResult = {
  service: ServiceLevel;
  distance: number;
  weight: number;
  volumeCbm: number;
  price: number;
  volumetric: boolean;
};

type Row = {
  service: ServiceLevel;
  bands: { label: string; value: number }[];
};

export default function RateEstimationPage() {
  const [service, setService] = useState<ServiceLevel>('STANDARD');
  const [distance, setDistance] = useState('');
  const [weight, setWeight] = useState('');
  const [volume, setVolume] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedSku, setSelectedSku] = useState('');
  const [result, setResult] = useState<UserResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadProducts = useCallback(async () => {
    setError('');
    try {
      setProducts(await data.products.list());
    } catch (err: any) {
      setError(err?.message || 'Không tải được dữ liệu mẫu.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const handleSubmit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      const distanceKm = Number(distance);
      const weightKg = Number(weight);
      const volumeCbm = Number(volume);
      if (!distanceKm || !weightKg) {
        setError('Nhập khoảng cách và khối lượng cần tính.');
        return;
      }
      const price = estimateRate(service, distanceKm, weightKg, volumeCbm);
      const chargeable = Math.max(weightKg, volumeCbm > 0 ? Math.ceil(volumeCbm * VOLUME_KG_PER_CBM) : 0);
      setResult({ service, distance: distanceKm, weight: weightKg, volumeCbm, price, volumetric: chargeable > weightKg });
      setError('');
    },
    [service, distance, weight, volume],
  );

  const handleProduct = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const product = products.find((row) => row.sku === event.target.value);
      setSelectedSku(product ? product.sku : '');
      setWeight(product ? `${product.weightKg}` : '');
      setVolume(product ? `${product.volumeCbm}` : '');
    },
    [products],
  );

  const reference: Row[] = DISTANCE_BANDS.map((band) => ({
    service,
    bands: QUANTITY_BANDS.map((bandLabel) => ({
      label: `${bandLabel} kg`,
      value: estimateRate(service, band.mid, Number(bandLabel)),
    })),
  }));

  return (
    <div className="space-y-5">
      <EditorialPageHeader
        eyebrow="Trợ lý định giá"
        title="Định giá vận chuyển"
        description="Hệ thống ước lượng chi phí vận chuyển từ mức dịch vụ, khoảng cách và trọng lượng hàng hóa. Bộ định giá sử dụng dữ liệu tĩnh theo mẫu hệ thống, không gọi API bên ngoài."
        meta={
          <span className="text-[11px] leading-5 text-ink-faint">Cập nhật {formatDateVN(new Date().toISOString())}</span>
        }
        actions={
          <button
            type="button"
            onClick={loadProducts}
            disabled={loading}
            className="h-9 rounded-md border border-line px-3 text-[12px] font-medium text-ink-soft transition-colors hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Đang tải…' : 'Làm mới dữ liệu'}
          </button>
        }
      />

      {error ? (
        <div className="flex items-center gap-2 border-l-2 border-danger bg-surface px-3 py-2 text-[12px] text-ink-faint">
          <span>{error}</span>
          <button type="button" onClick={loadProducts} className="font-medium text-accent underline decoration-accent/30 hover:decoration-accent">
            Thử lại
          </button>
        </div>
      ) : null}

      <EditorialSection eyebrow="Cấu hình" title="Dự toán chi phí">
        <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-[12px] font-medium text-ink-soft">Loại dịch vụ</span>
            <select
              value={service}
              onChange={(event) => setService(event.target.value as ServiceLevel)}
              className="h-9 rounded-md border border-line bg-surface px-3 text-[13px] text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
            >
              <option value="STANDARD">Tiêu chuẩn</option>
              <option value="EXPRESS">Nhanh</option>
              <option value="SAME_DAY">Hàng ngày</option>
            </select>
          </label>
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-[12px] font-medium text-ink-soft">Khoảng cách (km)</span>
            <input
              type="number"
              inputMode="numeric"
              value={distance}
              onChange={(event) => setDistance(event.target.value)}
              min={1}
              step={1}
              placeholder="VD: 25"
              className="h-9 rounded-md border border-line bg-surface px-3 text-[13px] text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
              required
            />
          </label>
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-[12px] font-medium text-ink-soft">Khối lượng (kg)</span>
            <input
              type="number"
              inputMode="numeric"
              value={weight}
              onChange={(event) => setWeight(event.target.value)}
              min={0.1}
              step={0.1}
              placeholder="VD: 2.5"
              className="h-9 rounded-md border border-line bg-surface px-3 text-[13px] text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
              required
            />
          </label>
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-[12px] font-medium text-ink-soft">Thể tích (CBM, tùy chọn)</span>
            <input
              type="number"
              inputMode="numeric"
              value={volume}
              onChange={(event) => setVolume(event.target.value)}
              min={0}
              step={0.001}
              placeholder="VD: 0.004"
              className="h-9 rounded-md border border-line bg-surface px-3 text-[13px] text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </label>
          <label className="flex-1 flex-col gap-1">
            <span className="text-[12px] font-medium text-ink-soft">Chọn mẫu sản phẩm</span>
            <select
              value={selectedSku}
              onChange={handleProduct}
              className="h-9 rounded-md border border-line bg-surface px-3 text-[13px] text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
            >
              <option value="">Chọn SKU</option>
              {products.map((row) => (
                <option key={row.id} value={row.sku}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="h-9 rounded-md border border-line bg-accent px-4 text-[12px] font-medium text-surface transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Tính phí
          </button>
        </form>

        {result ? (
          <div className="mt-4 rounded-lg border border-line bg-surface/80 p-3 text-[13px]">
            <dl className="grid gap-2 sm:grid-cols-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Phí ước lượng</p>
                <p className="mt-0.5 text-[14px] font-semibold tabular-nums text-ink">
                  {formatCurrency(result.price)}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Trọng tải tính cước</p>
                <p className="mt-0.5 text-[14px] tabular-nums text-ink">
                  {Math.max(result.weight, result.volumetric ? Math.ceil(result.volumeCbm * VOLUME_KG_PER_CBM) : result.weight)} kg
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Dịch vụ</p>
                <p className="mt-0.5 text-[13px]">
                  <StatusLabel tone={serviceTone(result.service)}>{serviceLabel(result.service)}</StatusLabel>
                </p>
              </div>
            </dl>
            <p className="mt-2 text-[12px] text-ink-faint">
              {result.volumetric
                ? `Hàng cồng kềnh: ${result.volumeCbm} CBM, trọng tải quy đổi ${Math.ceil(result.volumeCbm * VOLUME_KG_PER_CBM)} kg thành 1 trọng tải thực. Kéo theo ${result.distance} km.`
                : `${serviceLabel(result.service)} · ${result.distance} km · ${result.weight} kg`}
            </p>
          </div>
        ) : null}
      </EditorialSection>

      <EditorialSection eyebrow="Tham chiếu" title="Bảng định giá theo dịch vụ">
        <TableState
          loading={loading}
          empty={!loading && reference.length === 0}
          error={error ? new Error(error) : undefined}
          onRetry={loadProducts}
          colSpan={5}
          emptyContent={<EmptyNote>Chưa có dữ liệu mẫu để xây dựng bảng định giá.</EmptyNote>}
        >
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full border-collapse">
              <thead className="border-b border-line bg-surface-alt">
                <tr>
                  <th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">Dịch vụ</th>
                  {QUANTITY_BANDS.map((band) => (
                    <th key={band} className="px-4 py-2 text-right text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                      {band} kg
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-[13px]">
                {reference.map((row) => (
                  <tr key={row.service} className="hover:bg-surface-alt">
                    <td className="px-4 py-2 text-[13px]">
                      <StatusLabel tone={serviceTone(row.service)}>{serviceLabel(row.service)}</StatusLabel>
                    </td>
                    {row.bands.map(({ label, value }) => (
                      <td key={label} className="px-4 py-2 text-right font-semibold tabular-nums text-ink">
                        {formatCurrency(value)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TableState>
      </EditorialSection>

      <EditorialSection title="Hướng dẫn">
        <EmptyNote>
          Mô hình dựa trên hệ thống định giá điểm chuẩn: phí cố định + phí/km + phí/kg. Khối lượng cồng kềnh được quy đổi 1 CBM = 167 kg theo quy chuẩn vận tải hàng không.
        </EmptyNote>
      </EditorialSection>
    </div>
  );
}
