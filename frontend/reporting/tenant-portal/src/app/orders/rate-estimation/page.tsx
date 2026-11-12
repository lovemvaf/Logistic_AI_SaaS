'use client';

import api from '@/lib/api';
import { data, isMockDataSource } from '@/lib/data';
import { EditorialPageHeader, EditorialSection, StatusLabel, EmptyNote } from 'ui-kit';
import { TableState } from 'ui-components';
import { formatCurrency, formatDateVN, serviceLabel, serviceTone } from '@/lib/labels';
import type { Product, ServiceLevel } from '@/lib/mock';
import { estimateDongNaiRate, VOLUME_KG_PER_CBM } from 'shared-types';
import { useEffect, useState, useCallback } from 'react';

const DISTANCE_BANDS = [
  { label: '1-10 km', mid: 5 },
  { label: '11-25 km', mid: 18 },
  { label: '26-50 km', mid: 38 },
  { label: '51-100 km', mid: 75 },
  { label: '>100 km', mid: 150 },
];

const QUANTITY_BANDS = ['1', '5', '15', '30', '50'];

function estimateRate(
  service: ServiceLevel,
  distanceKm: number,
  weightKg: number,
  volumeCbm = 0,
  corridor: 'NORTH' | 'CENTRAL' | 'SOUTH' = 'CENTRAL',
  codAmount = 0,
) {
  return estimateDongNaiRate({
    serviceLevel: service,
    distanceKm,
    weightKg,
    volumeCbm,
    corridor,
    codAmount,
  });
}

type UserResult = {
  service: ServiceLevel;
  corridor: 'NORTH' | 'CENTRAL' | 'SOUTH';
  distance: number;
  weight: number;
  volumeCbm: number;
  codAmount: number;
  price: number;
  volumetric: boolean;
  source: 'api' | 'local';
  matchedContract?: { code: string; baseContainerRate: number } | null;
  breakdown?: {
    baseFee: number;
    weightSurcharge: number;
    serviceMultiplier: number;
    codCollectionFee: number;
  };
  formula?: string;
};

type Row = {
  service: ServiceLevel;
  bands: { label: string; value: number }[];
};

export default function RateEstimationPage() {
  const [service, setService] = useState<ServiceLevel>('STANDARD');
  const [corridor, setCorridor] = useState<'NORTH' | 'CENTRAL' | 'SOUTH'>('CENTRAL');
  const [distance, setDistance] = useState('25');
  const [weight, setWeight] = useState('12');
  const [volume, setVolume] = useState('');
  const [codAmount, setCodAmount] = useState('0');
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedSku, setSelectedSku] = useState('');
  const [result, setResult] = useState<UserResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [estimating, setEstimating] = useState(false);
  const [error, setError] = useState('');

  const loadProducts = useCallback(async () => {
    setError('');
    try {
      setProducts(await data.products.list());
    } catch (err: any) {
      setError(err?.message || 'Không tải được dữ liệu danh mục sản phẩm.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      const distanceKm = Number(distance);
      const weightKg = Number(weight);
      const volumeCbm = Number(volume) || 0;
      const cod = Number(codAmount) || 0;
      if (!distanceKm || !weightKg) {
        setError('Nhập khoảng cách và khối lượng cần tính.');
        return;
      }
      setError('');
      const volumetricKg = volumeCbm > 0 ? Math.ceil(volumeCbm * VOLUME_KG_PER_CBM) : 0;
      const chargeableWeight = Math.max(weightKg, volumetricKg);

      if (!isMockDataSource) {
        setEstimating(true);
        try {
          const res = await api.post('/pricing/estimate', {
            weightKg: chargeableWeight,
            codAmount: cod,
            corridor,
            serviceLevel: service,
            distanceKm,
          });
          const payload = res.data;
          if (payload && typeof payload.totalEstimate === 'number') {
            setResult({
              service,
              corridor,
              distance: distanceKm,
              weight: weightKg,
              volumeCbm,
              codAmount: cod,
              price: payload.totalEstimate,
              volumetric: chargeableWeight > weightKg,
              source: 'api',
              matchedContract: payload.matchedContract ?? null,
              breakdown: payload.breakdown,
              formula: payload.formula,
            });
            setEstimating(false);
            return;
          }
        } catch {
          // Fall back gracefully to deterministic local formula if offline
        } finally {
          setEstimating(false);
        }
      }

      const est = estimateRate(service, distanceKm, weightKg, volumeCbm, corridor, cod);
      setResult({
        service,
        corridor,
        distance: distanceKm,
        weight: weightKg,
        volumeCbm,
        codAmount: cod,
        price: est.totalEstimate,
        volumetric: est.breakdown.volumetricApplied,
        source: 'local',
        breakdown: est.breakdown,
        formula: est.formula,
      });
    },
    [service, corridor, distance, weight, volume, codAmount],
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
      value: estimateRate(service, band.mid, Number(bandLabel), 0, corridor, 0).totalEstimate,
    })),
  }));

  return (
    <div className="space-y-5">
      <EditorialPageHeader
        eyebrow="Trợ lý định giá"
        title="Định giá vận chuyển"
        description="Hệ thống ước lượng chi phí vận chuyển dựa trên hợp đồng ContractRate trong PostgreSQL (hành lang Bắc / Trung tâm / Nam Đồng Nai, khối lượng tính cước & phụ thu COD)."
        meta={
          <span className="text-[11px] leading-5 text-ink-faint">
            Cập nhật {formatDateVN(new Date().toISOString())}
          </span>
        }
        actions={
          <button
            type="button"
            onClick={() => void loadProducts()}
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
          <button
            type="button"
            onClick={() => void loadProducts()}
            className="font-medium text-accent underline decoration-accent/30 hover:decoration-accent"
          >
            Thử lại
          </button>
        </div>
      ) : null}

      <EditorialSection eyebrow="Cấu hình" title="Dự toán chi phí">
        <form onSubmit={(e) => void handleSubmit(e)} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-ink-soft">Loại dịch vụ</span>
            <select
              value={service}
              onChange={(event) => setService(event.target.value as ServiceLevel)}
              className="h-9 rounded-md border border-line bg-surface px-3 text-[13px] text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
            >
              <option value="STANDARD">Tiêu chuẩn (1.0x)</option>
              <option value="EXPRESS">Nhanh (1.35x)</option>
              <option value="SAME_DAY">Hỏa tốc trong ngày (1.65x)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-ink-soft">Hành lang Đồng Nai</span>
            <select
              value={corridor}
              onChange={(event) => setCorridor(event.target.value as 'NORTH' | 'CENTRAL' | 'SOUTH')}
              className="h-9 rounded-md border border-line bg-surface px-3 text-[13px] text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
            >
              <option value="CENTRAL">Trung tâm (Biên Hòa - Trảng Bom)</option>
              <option value="SOUTH">Nam (Long Thành - Nhơn Trạch - Phước An)</option>
              <option value="NORTH">Bắc (Tân Phú - Định Quán - Long Khánh)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
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
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-ink-soft">Khối lượng (kg)</span>
            <input
              type="number"
              inputMode="decimal"
              value={weight}
              onChange={(event) => setWeight(event.target.value)}
              min={0.1}
              step={0.1}
              placeholder="VD: 12"
              className="h-9 rounded-md border border-line bg-surface px-3 text-[13px] text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
              required
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-ink-soft">Thể tích (CBM, tùy chọn)</span>
            <input
              type="number"
              inputMode="decimal"
              value={volume}
              onChange={(event) => setVolume(event.target.value)}
              min={0}
              step={0.001}
              placeholder="VD: 0.04"
              className="h-9 rounded-md border border-line bg-surface px-3 text-[13px] text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-ink-soft">Tiền thu hộ COD (VND)</span>
            <input
              type="number"
              inputMode="numeric"
              value={codAmount}
              onChange={(event) => setCodAmount(event.target.value)}
              min={0}
              step={10000}
              placeholder="VD: 2500000"
              className="h-9 rounded-md border border-line bg-surface px-3 text-[13px] text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </label>
          <label className="flex flex-col gap-1">
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
          <div className="flex items-end">
            <button
              type="submit"
              disabled={estimating}
              className="h-9 w-full rounded-md border border-line bg-accent px-4 text-[12px] font-medium text-surface transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {estimating ? 'Đang tính API…' : 'Tính phí'}
            </button>
          </div>
        </form>

        {result ? (
          <div className="mt-4 space-y-2 rounded-lg border border-line bg-surface/80 p-3 text-[13px]">
            <dl className="grid gap-2 sm:grid-cols-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                  Phí ước lượng ({result.source === 'api' ? 'Contract API' : 'Local'})
                </p>
                <p className="mt-0.5 text-[14px] font-semibold tabular-nums text-ink">
                  {formatCurrency(result.price)}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                  Trọng tải tính cước
                </p>
                <p className="mt-0.5 text-[14px] tabular-nums text-ink">
                  {Math.max(
                    result.weight,
                    result.volumetric ? Math.ceil(result.volumeCbm * VOLUME_KG_PER_CBM) : result.weight,
                  )}{' '}
                  kg
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                  Dịch vụ &amp; Hành lang
                </p>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[13px]">
                  <StatusLabel tone={serviceTone(result.service)}>
                    {serviceLabel(result.service)}
                  </StatusLabel>
                  <span className="font-mono text-[11px] text-ink-soft">{result.corridor}</span>
                </div>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                  Hợp đồng áp dụng
                </p>
                <p className="mt-0.5 font-mono text-[12px] text-ink">
                  {result.matchedContract?.code || 'Biểu phí tiêu chuẩn'}
                </p>
              </div>
            </dl>
            {result.breakdown ? (
              <div className="grid gap-2 rounded border border-line bg-surface-alt px-3 py-2 font-mono text-[11px] text-ink-soft sm:grid-cols-4">
                <span>Cước gốc: {formatCurrency(result.breakdown.baseFee)}</span>
                <span>Phụ cân: {formatCurrency(result.breakdown.weightSurcharge)}</span>
                <span>Hệ số DV: {result.breakdown.serviceMultiplier}x</span>
                <span>Phí COD (0.8%): {formatCurrency(result.breakdown.codCollectionFee)}</span>
              </div>
            ) : null}
            <p className="text-[12px] text-ink-faint">
              {result.formula ? `Công thức: ${result.formula}` : `${serviceLabel(result.service)} · ${result.distance} km · ${result.weight} kg`}
            </p>
          </div>
        ) : null}
      </EditorialSection>

      <EditorialSection eyebrow="Tham chiếu" title="Bảng định giá theo dịch vụ (hành lang đang chọn)">
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full border-collapse">
            <thead className="border-b border-line bg-surface-alt">
              <tr>
                <th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                  Dịch vụ · Cự ly
                </th>
                {QUANTITY_BANDS.map((band) => (
                  <th
                    key={band}
                    className="px-4 py-2 text-right text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint"
                  >
                    {band} kg
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line text-[13px]">
              <TableState
                loading={loading}
                empty={!loading && reference.length === 0}
                error={error ? new Error(error) : undefined}
                onRetry={loadProducts}
                colSpan={6}
                emptyContent={
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-ink-faint">
                      Chưa có dữ liệu mẫu để xây dựng bảng định giá.
                    </td>
                  </tr>
                }
              >
                {reference.map((row, idx) => (
                  <tr key={`${row.service}-${DISTANCE_BANDS[idx]?.label ?? idx}`} className="hover:bg-surface-alt">
                    <td className="px-4 py-2 text-[13px]">
                      <div className="flex items-center gap-2">
                        <StatusLabel tone={serviceTone(row.service)}>
                          {serviceLabel(row.service)}
                        </StatusLabel>
                        <span className="text-[11px] font-mono text-ink-faint">
                          {DISTANCE_BANDS[idx]?.label}
                        </span>
                      </div>
                    </td>
                    {row.bands.map(({ label, value }) => (
                      <td
                        key={label}
                        className="px-4 py-2 text-right font-semibold tabular-nums text-ink"
                      >
                        {formatCurrency(value)}
                      </td>
                    ))}
                  </tr>
                ))}
              </TableState>
            </tbody>
          </table>
        </div>
      </EditorialSection>

      <EditorialSection title="Hướng dẫn">
        <EmptyNote>
          Chế độ Cloud API truy vấn trực tiếp bảng ContractRate theo Tenant RLS qua endpoint
          `POST /api/v1/pricing/estimate`; khối lượng cồng kềnh quy đổi theo chuẩn 1 CBM = 167 kg.
        </EmptyNote>
      </EditorialSection>
    </div>
  );
}
