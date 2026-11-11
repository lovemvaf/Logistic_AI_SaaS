'use client';

import { useCallback, useEffect, useState } from 'react';
import api from '@/lib/api';
import { isMockDataSource } from '@/lib/data';
import {
  EditorialPageHeader,
  EditorialSection,
  EmptyNote,
  MetricBand,
  StatusLabel,
  type StatusTone,
} from 'ui-kit';
import { Button, Input } from 'ui-components';

const unwrapList = <T,>(res: any): T[] => {
  const payload = res?.data ?? res;
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};

const unwrapObj = <T,>(res: any): T => (res?.data !== undefined ? res.data : res);

const CORRIDOR_LABELS: Record<string, string> = {
  NORTH: 'Phía Bắc (Chơn Thành / Đồng Xoài)',
  CENTRAL: 'Trung tâm (Biên Hòa / Long Thành / Nhơn Trạch)',
  SOUTH: 'Phía Nam & Cửa ngõ',
};

export default function GeographyPage() {
  const [overview, setOverview] = useState<any>(null);
  const [units, setUnits] = useState<any[]>([]);
  const [meta, setMeta] = useState<any>(null);
  const [facilities, setFacilities] = useState<any[]>([]);
  const [corridors, setCorridors] = useState<any[]>([]);
  const [restrictions, setRestrictions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [unitTypeFilter, setUnitTypeFilter] = useState('');
  const [corridorFilter, setCorridorFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const [resolveInput, setResolveInput] = useState('TP Biên Hòa');
  const [resolveResult, setResolveResult] = useState<any>(null);
  const [resolving, setResolving] = useState(false);

  const [obsFacilityId, setObsFacilityId] = useState('');
  const [obsWaitMinutes, setObsWaitMinutes] = useState('35');
  const [obsQueueLength, setObsQueueLength] = useState('12');
  const [obsNotes, setObsNotes] = useState('');
  const [submittingObs, setSubmittingObs] = useState(false);
  const [obsFeedback, setObsFeedback] = useState('');

  const loadAll = useCallback(async () => {
    if (isMockDataSource) {
      setLoading(false);
      setError('Trang Địa giới Đồng Nai 2026 yêu cầu kết nối PostgreSQL API (NEXT_PUBLIC_DATA_SOURCE=api).');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [ovRes, facRes, corRes, resRes] = await Promise.all([
        api.get('/geography/overview'),
        api.get('/geography/facilities'),
        api.get('/geography/corridors'),
        api.get('/geography/restrictions'),
      ]);
      const ov = unwrapObj<any>(ovRes);
      const facList = unwrapList<any>(facRes);
      setOverview(ov);
      setFacilities(facList);
      setCorridors(unwrapList<any>(corRes));
      setRestrictions(unwrapList<any>(resRes));
      if (!obsFacilityId && facList.length > 0) {
        setObsFacilityId(facList[0].id);
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Không tải được dữ liệu địa giới.');
    } finally {
      setLoading(false);
    }
  }, [obsFacilityId]);

  const loadUnits = useCallback(async () => {
    if (isMockDataSource) return;
    try {
      const params: Record<string, string | number> = { limit: 95 };
      if (unitTypeFilter) params.unitType = unitTypeFilter;
      if (corridorFilter) params.corridor = corridorFilter;
      if (searchTerm.trim()) params.search = searchTerm.trim();
      const res = await api.get('/geography/units', { params });
      const payload = unwrapObj<any>(res);
      setUnits(Array.isArray(payload?.data) ? payload.data : unwrapList<any>(res));
      setMeta(payload?.meta ?? null);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Không lọc được danh mục 95 phường/xã.');
    }
  }, [unitTypeFilter, corridorFilter, searchTerm]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    void loadUnits();
  }, [loadUnits]);

  const handleResolve = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolveInput.trim() || isMockDataSource) return;
    setResolving(true);
    try {
      const res = await api.get('/geography/units/resolve', { params: { q: resolveInput.trim() } });
      setResolveResult(unwrapObj<any>(res));
    } catch (err: any) {
      setResolveResult({ error: err?.response?.data?.message || 'Không tra cứu được alias.' });
    } finally {
      setResolving(false);
    }
  };

  const handleCreateQueueObs = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!obsFacilityId || isMockDataSource) return;
    setSubmittingObs(true);
    setObsFeedback('');
    try {
      await api.post(`/geography/facilities/${obsFacilityId}/queue-observations`, {
        waitMinutes: Number(obsWaitMinutes || 0),
        queueLength: Number(obsQueueLength || 0),
        notes: obsNotes.trim() || undefined,
      });
      setObsFeedback('Đã ghi nhận thời gian chờ bãi (OPERATOR_REPORTED).');
      setObsNotes('');
      await loadAll();
    } catch (err: any) {
      setObsFeedback(err?.response?.data?.message || 'Lỗi ghi nhận quan trắc.');
    } finally {
      setSubmittingObs(false);
    }
  };

  const statusTone = (status?: string): StatusTone => {
    if (status === 'OFFICIAL_VERIFIED' || status === 'OFFICIAL_GIS_POLYGON') return 'success';
    return 'warning';
  };

  return (
    <div className="space-y-6">
      <EditorialPageHeader
        eyebrow={
          <>
            <span>Địa giới & Mạng lưới</span>
            <span className="text-line-strong" aria-hidden="true">/</span>
            <span>TP Đồng Nai 2026</span>
          </>
        }
        title="Mạng lưới Địa giới TP Đồng Nai (95 ĐVHC)"
        description="Chuẩn hóa 33 phường và 62 xã sau sáp nhập, đối chiếu địa danh cũ tiền sáp nhập, quản lý KCN/ICD nội thành và cảng cửa ngõ ngoài địa giới."
        meta={
          <div className="space-y-1">
            <StatusLabel tone="warning">PENDING_OFFICIAL_CODE</StatusLabel>
            <p className="text-[11px] text-ink-faint">Chưa tự gán mã quốc gia/GIS khi chưa có công bố</p>
          </div>
        }
        actions={
          <Button variant="outline" size="sm" onClick={() => void loadAll()}>
            Làm mới dữ liệu
          </Button>
        }
      />

      {error ? (
        <div className="rounded-md border-l-2 border-danger bg-surface px-4 py-2 text-[12px] text-ink">
          {error}
        </div>
      ) : null}

      <div className="rounded-md border border-line bg-surface-alt px-4 py-3 text-[12px] text-ink-soft">
        <strong className="text-ink">Tính toàn vẹn dữ liệu địa giới: </strong>
        {meta?.officialCodeStatusNote ||
          'Danh mục tên 95 phường/xã TP Đồng Nai 2026 giữ officialCodeStatus=PENDING_OFFICIAL_CODE và boundaryStatus=NO_OFFICIAL_POLYGON cho tới khi có công bố mã/GIS chính thức.'}
      </div>

      <MetricBand
        metrics={[
          {
            label: 'ĐVHC TP Đồng Nai',
            value: overview ? `${overview.totalUnits} / 95` : '—',
            meta: overview ? `${overview.pendingOfficialCodeCount} đang chờ mã chính thức` : 'Đang tải...',
            tone: overview?.totalUnits === 95 ? 'success' : 'warning',
          },
          {
            label: 'Phường / Xã',
            value: overview ? `${overview.wardCount}W · ${overview.communeCount}C` : '—',
            meta: 'Chuẩn 33 Phường + 62 Xã',
          },
          {
            label: 'KCN & ICD nội thành',
            value: overview ? overview.dongNaiFacilitiesCount : '—',
            meta: `Cửa ngõ ngoài TP: ${overview?.externalGatewayFacilitiesCount ?? 0}`,
          },
          {
            label: 'Hành lang & Hạn chế tải',
            value: overview ? `${overview.corridorsCount} · ${overview.activeRestrictionsCount}` : '—',
            meta: 'Trục QL1A / QL51 / Cao tốc & Khung giờ cấm tải',
          },
        ]}
      />

      <EditorialSection
        eyebrow="Tra cứu & Chuẩn hóa"
        title="Đối chiếu địa danh cũ (Pre-2025 Alias Resolver)"
      >
        <form onSubmit={handleResolve} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Input
              label="Nhập tên phường/xã 2026 hoặc địa danh cũ (VD: TP Biên Hòa, Tam An, TX Long Khánh, Chơn Thành)"
              value={resolveInput}
              onChange={(e) => setResolveInput(e.target.value)}
              placeholder="Ví dụ: TP Biên Hòa, Tam An, Bù Đăng..."
            />
          </div>
          <Button type="submit" variant="primary" size="md" isLoading={resolving}>
            Chuẩn hóa địa giới
          </Button>
        </form>

        {resolveResult ? (
          <div className="mt-4 rounded-md border border-line bg-surface p-3 text-[12px]">
            {resolveResult.error ? (
              <p className="text-danger">{resolveResult.error}</p>
            ) : (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-3">
                  <StatusLabel tone={resolveResult.matched ? (resolveResult.ambiguous ? 'warning' : 'success') : 'danger'}>
                    {resolveResult.matchedVia}
                  </StatusLabel>
                  <span className="font-mono text-ink-faint">normalized: {resolveResult.normalizedQuery}</span>
                </div>
                {resolveResult.unit ? (
                  <p className="text-ink">
                    Kết quả: <strong>{resolveResult.unit.unitType === 'WARD' ? 'Phường' : 'Xã'} {resolveResult.unit.canonicalName}</strong>
                    {' · '}Hành lang: <span className="font-mono">{resolveResult.unit.corridor}</span>
                    {' · '}Mã chính thức: <span className="font-mono">{resolveResult.unit.officialCodeStatus}</span>
                  </p>
                ) : resolveResult.candidates?.length ? (
                  <p className="text-ink-soft">
                    Ứng viên ({resolveResult.candidates.length}): {resolveResult.candidates.map((c: any) => `${c.unitType} ${c.canonicalName}`).join(', ')}
                  </p>
                ) : (
                  <p className="text-ink-faint">Không tìm thấy đơn vị hành chính phù hợp.</p>
                )}
              </div>
            )}
          </div>
        ) : null}
      </EditorialSection>

      <EditorialSection
        eyebrow="Danh mục 2026"
        title={`95 Đơn vị hành chính cấp xã TP Đồng Nai (${units.length} hiển thị)`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Lọc loại đơn vị"
              value={unitTypeFilter}
              onChange={(e) => setUnitTypeFilter(e.target.value)}
              className="h-8 rounded border border-line bg-surface px-2 text-[12px] text-ink"
            >
              <option value="">Tất cả (Phường + Xã)</option>
              <option value="WARD">Phường (33)</option>
              <option value="COMMUNE">Xã (62)</option>
            </select>
            <select
              aria-label="Lọc hành lang"
              value={corridorFilter}
              onChange={(e) => setCorridorFilter(e.target.value)}
              className="h-8 rounded border border-line bg-surface px-2 text-[12px] text-ink"
            >
              <option value="">Tất cả hành lang</option>
              <option value="NORTH">NORTH (Phía Bắc)</option>
              <option value="CENTRAL">CENTRAL (Trung tâm)</option>
              <option value="SOUTH">SOUTH (Phía Nam)</option>
            </select>
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm tên phường/xã..."
              className="h-8 rounded border border-line bg-surface px-2.5 text-[12px] text-ink outline-none focus:border-accent"
            />
          </div>
        }
      >
        {loading ? (
          <EmptyNote>Đang tải danh mục địa giới Đồng Nai...</EmptyNote>
        ) : units.length === 0 ? (
          <EmptyNote>Không có đơn vị nào khớp bộ lọc hiện tại.</EmptyNote>
        ) : (
          <div className="max-h-[420px] overflow-auto rounded-md border border-line">
            <table className="w-full border-collapse text-left text-[12px]">
              <thead className="sticky top-0 border-b border-line bg-surface-alt text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Tên chuẩn 2026</th>
                  <th className="px-3 py-2">Loại</th>
                  <th className="px-3 py-2">Hành lang</th>
                  <th className="px-3 py-2">Mã ĐVHC</th>
                  <th className="px-3 py-2">Polygon GIS</th>
                  <th className="px-3 py-2">Địa danh cũ tham chiếu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line bg-surface">
                {units.map((u, idx) => (
                  <tr key={u.id} className="hover:bg-surface-alt/50">
                    <td className="px-3 py-2 tabular-nums text-ink-faint">{idx + 1}</td>
                    <td className="px-3 py-2 font-medium text-ink">{u.canonicalName}</td>
                    <td className="px-3 py-2 font-mono text-[11px]">{u.unitType === 'WARD' ? 'Phường' : 'Xã'}</td>
                    <td className="px-3 py-2 font-mono text-[11px] text-ink-soft">{u.corridor}</td>
                    <td className="px-3 py-2">
                      <StatusLabel tone={statusTone(u.officialCodeStatus)}>
                        {u.officialCode || u.officialCodeStatus}
                      </StatusLabel>
                    </td>
                    <td className="px-3 py-2">
                      <StatusLabel tone={statusTone(u.boundaryStatus)}>
                        {u.boundaryStatus}
                      </StatusLabel>
                    </td>
                    <td className="px-3 py-2 text-ink-soft">
                      {Array.isArray(u.aliases) && u.aliases.length > 0
                        ? u.aliases.map((a: any) => a.aliasName).join(', ')
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </EditorialSection>

      <div className="grid gap-6 lg:grid-cols-2">
        <EditorialSection eyebrow="Điểm nút hạ tầng" title="KCN, ICD & Cửa ngõ ngoài TP Đồng Nai">
          {facilities.length === 0 ? (
            <EmptyNote>Chưa có dữ liệu điểm nút hạ tầng.</EmptyNote>
          ) : (
            <div className="space-y-2">
              {facilities.map((f) => (
                <div key={f.id} className="rounded-md border border-line bg-surface p-3 text-[12px]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-ink">
                      <span className="mr-2 font-mono text-[11px] text-ink-faint">{f.code}</span>
                      {f.name}
                    </span>
                    <StatusLabel tone={f.outsideCity ? 'warning' : 'success'}>
                      {f.outsideCity ? 'NGOÀI ĐỊA GIỚI (GATEWAY)' : 'TRONG TP ĐỒNG NAI'}
                    </StatusLabel>
                  </div>
                  <p className="mt-1 text-[11px] text-ink-soft">
                    Loại: {f.facilityType} · Khu vực: {f.localityName || f.administrativeUnit?.canonicalName || '—'} ·{' '}
                    {CORRIDOR_LABELS[f.corridor] || f.corridor || '—'}
                  </p>
                  {f.queueObservations?.length ? (
                    <p className="mt-1 font-mono text-[11px] text-ink-faint">
                      Chờ bãi gần nhất: {f.queueObservations[0].waitMinutes} phút ({f.queueObservations[0].sourceLabel})
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </EditorialSection>

        <div className="space-y-6">
          <EditorialSection eyebrow="Quan trắc điều độ" title="Ghi nhận thời gian chờ bãi (Operator Reported)">
            <form onSubmit={handleCreateQueueObs} className="space-y-3 rounded-md border border-line bg-surface p-3">
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                  Cơ sở / Cảng / ICD
                </label>
                <select
                  value={obsFacilityId}
                  onChange={(e) => setObsFacilityId(e.target.value)}
                  className="h-9 w-full rounded border border-line bg-canvas px-2.5 text-[12px] text-ink"
                >
                  {facilities.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.code} — {f.name} {f.outsideCity ? '(Ngoài ĐN)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Thời gian chờ (phút)"
                  type="number"
                  value={obsWaitMinutes}
                  onChange={(e) => setObsWaitMinutes(e.target.value)}
                  required
                />
                <Input
                  label="Số xe chờ (ước lượng)"
                  type="number"
                  value={obsQueueLength}
                  onChange={(e) => setObsQueueLength(e.target.value)}
                />
              </div>
              <Input
                label="Ghi chú cổng / làn xe"
                value={obsNotes}
                onChange={(e) => setObsNotes(e.target.value)}
                placeholder="VD: Cổng B kẹt cục bộ giờ cao điểm..."
              />
              {obsFeedback ? <p className="text-[12px] text-ink-soft">{obsFeedback}</p> : null}
              <Button type="submit" variant="primary" size="sm" isLoading={submittingObs}>
                Lưu quan trắc (OPERATOR_REPORTED)
              </Button>
            </form>
          </EditorialSection>

          <EditorialSection eyebrow="Khung giờ & Tải trọng" title="Hành lang & Hạn chế lưu thông">
            <div className="space-y-2 text-[12px]">
              {corridors.map((c) => (
                <div key={c.id} className="rounded border border-line bg-surface px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-ink">{c.name}</span>
                    <span className="font-mono text-[11px] text-ink-faint">
                      {c.distanceKm ? `${c.distanceKm} km` : '—'}
                    </span>
                  </div>
                </div>
              ))}
              {restrictions.map((r) => (
                <div key={r.id} className="rounded border-l-2 border-warning bg-surface px-3 py-2">
                  <p className="font-medium text-ink">{r.title}</p>
                  <p className="text-[11px] text-ink-soft">
                    {r.restrictionType} {r.curfewStart && r.curfewEnd ? `· Giờ cấm: ${r.curfewStart} - ${r.curfewEnd}` : ''}
                    {r.maxGrossWeightKg ? ` · Tối đa ${(Number(r.maxGrossWeightKg) / 1000).toFixed(1)} tấn` : ''}
                  </p>
                </div>
              ))}
            </div>
          </EditorialSection>
        </div>
      </div>
    </div>
  );
}
