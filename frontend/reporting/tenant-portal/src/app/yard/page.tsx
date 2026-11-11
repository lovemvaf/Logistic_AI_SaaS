'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import api from '@/lib/api';
import { isMockDataSource } from '@/lib/data';
import {
  EditorialPageHeader,
  EditorialSection,
  EmptyNote,
  MetricBand,
  StatusLabel,
} from 'ui-kit';
import { Button, Input } from 'ui-components';

const unwrapList = <T,>(res: any): T[] => {
  const payload = res?.data ?? res;
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};

export default function YardPage() {
  const [yards, setYards] = useState<any[]>([]);
  const [selectedYardId, setSelectedYardId] = useState('');
  const [slots, setSlots] = useState<any[]>([]);
  const [gateEvents, setGateEvents] = useState<any[]>([]);
  const [eirs, setEirs] = useState<any[]>([]);
  const [containers, setContainers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  // Gate event form
  const [containerId, setContainerId] = useState('');
  const [slotId, setSlotId] = useState('');
  const [eventType, setEventType] = useState<'GATE_IN' | 'GATE_OUT'>('GATE_IN');
  const [loadState, setLoadState] = useState<'FULL' | 'EMPTY'>('EMPTY');
  const [condition, setCondition] = useState<'GOOD' | 'MINOR_DENT' | 'DAMAGED'>('GOOD');
  const [sealNo, setSealNo] = useState('');
  const [driverName, setDriverName] = useState('Nguyễn Văn Tài');
  const [inspectorName, setInspectorName] = useState('Kiểm viên Bãi Biên Hòa');
  const [submitting, setSubmitting] = useState(false);

  const selectedYardRef = useRef('');

  const loadSlots = useCallback(async (yardId: string) => {
    if (!yardId || isMockDataSource) return;
    try {
      const res = await api.get(`/yard/yards/${yardId}/slots`);
      setSlots(unwrapList<any>(res));
    } catch {
      setSlots([]);
    }
  }, []);

  const loadAll = useCallback(async () => {
    if (isMockDataSource) {
      setLoading(false);
      setError('Phân hệ Bãi Container & EIR cần kết nối PostgreSQL API.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [yR, gR, eR, cR] = await Promise.all([
        api.get('/yard/yards'),
        api.get('/yard/gate-events'),
        api.get('/yard/eirs'),
        api.get('/freight/containers'),
      ]);
      const yList = unwrapList<any>(yR);
      const cList = unwrapList<any>(cR);
      setYards(yList);
      setGateEvents(unwrapList<any>(gR));
      setEirs(unwrapList<any>(eR));
      setContainers(cList);

      const targetYard = selectedYardRef.current || yList[0]?.id || '';
      if (targetYard) {
        if (!selectedYardRef.current) {
          selectedYardRef.current = targetYard;
          setSelectedYardId(targetYard);
        }
        await loadSlots(targetYard);
      }
      if (cList.length > 0) setContainerId((prev) => prev || cList[0].id);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Không tải được dữ liệu Bãi Cont.');
    } finally {
      setLoading(false);
    }
  }, [loadSlots]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handleSelectYard = async (yardId: string) => {
    selectedYardRef.current = yardId;
    setSelectedYardId(yardId);
    setSlotId('');
    await loadSlots(yardId);
  };

  const handleRecordGateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedYardId || !containerId || isMockDataSource) return;
    setSubmitting(true);
    setFeedback('');
    setError('');
    try {
      const res = await api.post('/yard/gate-events', {
        yardId: selectedYardId,
        containerId,
        yardSlotId: slotId || undefined,
        eventType,
        loadState,
        condition,
        sealNo: sealNo.trim() || undefined,
        driverName: driverName.trim() || undefined,
        inspectorName: inspectorName.trim() || undefined,
      });
      const data = res?.data ?? res;
      setFeedback(`Đã ghi nhận ${eventType} & phát hành EIR ${data?.eir?.eirNumber || ''}`);
      await loadAll();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Lỗi ghi nhận cổng bãi / EIR.');
    } finally {
      setSubmitting(false);
    }
  };

  const occupiedCount = slots.filter((s) => s.status === 'OCCUPIED').length;
  const emptyCount = slots.filter((s) => s.status === 'EMPTY').length;

  return (
    <div className="space-y-6">
      <EditorialPageHeader
        eyebrow={
          <>
            <span>Vận tải Container</span>
            <span className="text-line-strong" aria-hidden="true">/</span>
            <span>Bãi Cont & EIR</span>
          </>
        }
        title="Quản lý Bãi Container (CY/Depot) & Phiếu EIR"
        description="Theo dõi sơ đồ vị trí bãi (Block / Row / Bay / Tier), phích cắm cont lạnh và phát hành EIR tự động khi Gate-In / Gate-Out."
        actions={
          <div className="flex items-center gap-2">
            <select
              aria-label="Chọn bãi container"
              value={selectedYardId}
              onChange={(e) => void handleSelectYard(e.target.value)}
              className="h-9 rounded border border-line bg-surface px-2.5 text-[12px] text-ink"
            >
              {yards.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.code} — {y.name}
                </option>
              ))}
            </select>
            <Button variant="outline" size="sm" onClick={() => void loadAll()}>
              Làm mới
            </Button>
          </div>
        }
      />

      {error ? (
        <div className="rounded-md border-l-2 border-danger bg-surface px-4 py-2 text-[12px] text-ink">{error}</div>
      ) : null}
      {feedback ? (
        <div className="rounded-md border-l-2 border-success bg-surface px-4 py-2 text-[12px] text-ink">{feedback}</div>
      ) : null}

      <MetricBand
        metrics={[
          { label: 'Bãi đang quản lý', value: yards.length, meta: 'Depot & ICD nội địa' },
          { label: 'Vị trí đang chứa Cont', value: occupiedCount, meta: `Trống: ${emptyCount}`, tone: 'default' },
          { label: 'Lượt Gate-In / Gate-Out', value: gateEvents.length, meta: 'Ghi nhận thời gian thực' },
          { label: 'Phiếu EIR đã cấp', value: eirs.length, meta: 'Kèm biên bản tình trạng vỏ' },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <EditorialSection eyebrow="Sơ đồ bãi" title={`Lưới vị trí Container (${slots.length} slot)`}>
          {loading ? (
            <EmptyNote>Đang tải sơ đồ bãi...</EmptyNote>
          ) : slots.length === 0 ? (
            <EmptyNote>Bãi chưa cấu hình slot chi tiết.</EmptyNote>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {slots.map((s) => {
                const isOccupied = s.status === 'OCCUPIED';
                const isSelected = slotId === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSlotId(isSelected ? '' : s.id)}
                    className={`rounded-md border p-2.5 text-left transition-colors ${
                      isSelected
                        ? 'border-accent bg-accent/10'
                        : isOccupied
                          ? 'border-line-strong bg-surface-alt'
                          : 'border-line bg-surface hover:border-line-strong'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-mono text-[11px] font-semibold text-ink">{s.slotCode}</span>
                      {s.isReeferSlot ? (
                        <span className="rounded border border-line px-1 text-[9px] font-mono text-ink-soft">RF</span>
                      ) : null}
                    </div>
                    <div className="mt-1">
                      <StatusLabel tone={isOccupied ? 'warning' : 'success'}>{s.status}</StatusLabel>
                    </div>
                    <p className="mt-1 truncate font-mono text-[10px] text-ink-faint">
                      {s.container ? `${s.container.containerNo} (${s.container.sizeType})` : 'Slot trống'}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </EditorialSection>

        <EditorialSection eyebrow="Cổng bãi" title="Ghi nhận Gate-In / Gate-Out & Cấp EIR">
          <form onSubmit={handleRecordGateEvent} className="space-y-3 rounded-md border border-line bg-surface p-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                  Loại giao dịch
                </label>
                <select
                  value={eventType}
                  onChange={(e) => setEventType(e.target.value as 'GATE_IN' | 'GATE_OUT')}
                  className="h-9 w-full rounded border border-line bg-canvas px-2 text-[12px]"
                >
                  <option value="GATE_IN">GATE_IN (Hạ bãi)</option>
                  <option value="GATE_OUT">GATE_OUT (Xuất bãi)</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                  Trạng thái hàng
                </label>
                <select
                  value={loadState}
                  onChange={(e) => setLoadState(e.target.value as 'FULL' | 'EMPTY')}
                  className="h-9 w-full rounded border border-line bg-canvas px-2 text-[12px]"
                >
                  <option value="EMPTY">EMPTY (Cont rỗng)</option>
                  <option value="FULL">FULL (Cont có hàng)</option>
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                Container
              </label>
              <select
                value={containerId}
                onChange={(e) => setContainerId(e.target.value)}
                className="h-9 w-full rounded border border-line bg-canvas px-2 text-[12px]"
              >
                {containers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.containerNo} ({c.sizeType} · {c.status})
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                  Tình trạng vỏ (EIR)
                </label>
                <select
                  value={condition}
                  onChange={(e) => setCondition(e.target.value as 'GOOD' | 'MINOR_DENT' | 'DAMAGED')}
                  className="h-9 w-full rounded border border-line bg-canvas px-2 text-[12px]"
                >
                  <option value="GOOD">GOOD (Nguyên vẹn)</option>
                  <option value="MINOR_DENT">MINOR_DENT (Móp nhẹ)</option>
                  <option value="DAMAGED">DAMAGED (Hư hỏng)</option>
                </select>
              </div>
              <Input label="Số Seal" value={sealNo} onChange={(e) => setSealNo(e.target.value)} placeholder="SL-88421..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Tài xế giao/nhận" value={driverName} onChange={(e) => setDriverName(e.target.value)} />
              <Input label="Kiểm viên bãi" value={inspectorName} onChange={(e) => setInspectorName(e.target.value)} />
            </div>
            <p className="text-[11px] text-ink-faint">
              Slot chọn: <span className="font-mono">{slots.find((x) => x.id === slotId)?.slotCode || 'Tự động chọn slot trống'}</span>
            </p>
            <Button type="submit" variant="primary" size="sm" isLoading={submitting} disabled={!selectedYardId || !containerId}>
              Xác nhận {eventType} & Cấp EIR
            </Button>
          </form>
        </EditorialSection>
      </div>

      <EditorialSection eyebrow="Chứng từ bãi" title={`Sổ Phiếu EIR (${eirs.length})`}>
        {eirs.length === 0 ? (
          <EmptyNote>Chưa có phiếu EIR nào.</EmptyNote>
        ) : (
          <div className="overflow-x-auto rounded-md border border-line">
            <table className="w-full border-collapse text-left text-[12px]">
              <thead className="border-b border-line bg-surface-alt text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                <tr>
                  <th className="px-3 py-2">Số EIR</th>
                  <th className="px-3 py-2">Container</th>
                  <th className="px-3 py-2">Hướng / Trạng thái</th>
                  <th className="px-3 py-2">Tình trạng</th>
                  <th className="px-3 py-2">Seal</th>
                  <th className="px-3 py-2">Thời điểm</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line bg-surface">
                {eirs.map((e) => (
                  <tr key={e.id}>
                    <td className="px-3 py-2 font-mono font-medium">{e.eirNumber}</td>
                    <td className="px-3 py-2 font-mono">{e.container?.containerNo || '—'}</td>
                    <td className="px-3 py-2 font-mono text-[11px]">{e.direction} · {e.loadState}</td>
                    <td className="px-3 py-2">
                      <StatusLabel tone={e.condition === 'GOOD' ? 'success' : e.condition === 'MINOR_DENT' ? 'warning' : 'danger'}>
                        {e.condition}
                      </StatusLabel>
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px]">{e.sealNo || '—'}</td>
                    <td className="px-3 py-2 text-[11px] text-ink-faint">
                      {new Date(e.issuedAt).toLocaleString('vi-VN')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </EditorialSection>
    </div>
  );
}
