'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { data } from '@/lib/data';
import type {
  AiAnomaly,
  CorrectionLog,
  PackOrder,
  PackSession,
  PackStation,
  PackStaff,
  ScanLog,
} from '@/lib/mock';

import {
  EditorialPageHeader,
  EditorialSection,
  EmptyNote,
  MetricBand,
  StatusLabel,
} from 'ui-kit';

import { Button, Input, Modal, Select, TableState } from 'ui-components';

import {
  boxTypeLabel,
  correctionStatusLabel,
  correctionStatusTone,
  formatDateTimeVN,
  formatDuration,
  matchStatusLabel,
  matchStatusTone,
  sessionStatusLabel,
  sessionStatusTone,
  stationStatusLabel,
  stationStatusTone,
  anomalyKindLabel,
  anomalySeverityLabel,
  anomalySeverityTone,
} from '@/lib/labels';

/** Mức kết quả khớp để làm bộ lọc (nhãn giống `matchStatusLabel`). */
const COLOR_TAG = {
  MATCH: 'Khớp',
  MISMATCH: 'Khác biệt',
  OVERRIDE: 'Thay thế',
};

export default function PackLogsPage() {
  // --- Sessions & data ---
  const [sessions, setSessions] = useState<PackSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orderMap, setOrderMap] = useState<Record<string, PackOrder>>({});
  const [staffList, setStaffList] = useState<PackStaff[]>([]);
  const [stations, setStations] = useState<PackStation[]>([]);

  // --- Summary metrics (phiên hôm nay) ---
  const [summary, setSummary] = useState<{
    sessionsToday: number;
    packsToday: number;
    matchRate: number;
    correctionCount: number;
    averageSecondsPerPack: number;
  } | null>(null);

  // --- Filters ---
  const [stationFilter, setStationFilter] = useState<string>('');
  const [matchFilter, setMatchFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [search, setSearch] = useState<string>('');

  // --- Anomaly feed
  const [anomalies, setAnomalies] = useState<AiAnomaly[]>([]);
  const [anomalyLoading, setAnomalyLoading] = useState(false);

  // --- Correction modal ---
  const [corrections, setCorrections] = useState<CorrectionLog[]>([]);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [selectedCorrection, setSelectedCorrection] = useState<CorrectionLog | null>(null);
  const [correcting, setCorrecting] = useState(false);

  /** Các dòng bảng (phiên + scanLog) đã làm giàu bởi nhân viên & trạm & đơn. */
  const rows = useMemo(() => {
    const list: Array<ScanLog & { session: PackSession; station: PackStation; staff: PackStaff; order?: PackOrder }> = [];
    for (const session of sessions) {
      const station = stations.find((row) => row.id === session.stationId);
      const staff = staffList.find((row) => row.id === session.staffId);
      for (const scanLog of session.scanLogs || []) {
        const order = orderMap[scanLog.packCode];
        list.push({
          ...scanLog,
          session,
          station: station ?? { id: '-', code: '-', name: '-', status: 'OFFLINE' },
          staff: staff ?? { id: '-', staffCode: '-', fullName: '-', email: '-', role: 'WAREHOUSE_STAFF', phone: '-' },
          order,
        });
      }
    }
    return list.sort((a, b) => String(b.scannedAt || '').localeCompare(String(a.scannedAt || '')));
  }, [sessions, stations, staffList, orderMap]);

  // --- Filters logic ---
  const pageFilter = useMemo(() => {
    const searchLower = search.toLowerCase();
    return (row: typeof rows[number]) => {
      if (stationFilter && row.station.id !== stationFilter) return false;
      if (matchFilter && row.result !== matchFilter) return false;
      if (statusFilter && row.session.status !== statusFilter) return false;
      if (searchLower && !row.packCode.includes(searchLower) && !row.trackingCode.toLowerCase().includes(searchLower)) return false;
      return true;
    };
  }, [stationFilter, matchFilter, statusFilter, search]);

  const filteredRows = useMemo(() => rows.filter(pageFilter), [rows, pageFilter]);

  // --- Loads ---
  const loadAnomalies = useCallback(async () => {
    setAnomalyLoading(true);
    try {
      setAnomalies(await data.aiFeature.detectAnomaly());
    } catch (err: any) {
      setError(err?.message ?? 'Không tải được dự báo bất thường.');
    } finally {
      setAnomalyLoading(false);
    }
  }, [data]);

  useEffect(() => {
    void loadAnomalies();
  }, [loadAnomalies]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sessionList, stationList, staffListData, summaryData] = await Promise.all([
        data.sessions.list(),
        data.stations.list(),
        data.staff.list(),
        data.orders.summary(),
      ]);

      setSessions(sessionList);
      setStations(stationList);
      setStaffList(staffListData);
      setSummary(summaryData);

      // Làm giàu hàng chờ bằng thông tin đơn song song thay vì nối tuần tự.
      const packCodes = new Set<string>();
      for (const session of sessionList) {
        for (const log of session.scanLogs || []) packCodes.add(log.packCode);
      }
      const orderMapData: Record<string, PackOrder> = {};
      await Promise.all(
        Array.from(packCodes).slice(0, 30).map(async (code) => {
          try {
            const order = await data.orders.byPackCode(code);
            if (order) orderMapData[code] = order;
          } catch {}
        }),
      );
      setOrderMap(orderMapData);

      setCorrections(await data.corrections.list());
    } catch (err: any) {
      setError(err?.message ?? 'Không tải được nhật ký đóng gói.');
    } finally {
      setLoading(false);
    }
  }, [data]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const fetchCorrections = useCallback(async () => {
    try {
      setCorrections(await data.corrections.list());
    } catch (err: any) {
      setError(err?.message ?? 'Không tải được danh sách đính chính.');
    }
  }, [data]);

  const handleApprove = async (correction: CorrectionLog, status: 'APPROVED' | 'REJECTED') => {
    setCorrecting(true);
    try {
      await data.corrections.updateStatus(correction.id, status);
      await fetchCorrections();
      if (selectedCorrection?.id === correction.id) {
        setSelectedCorrection((prev) => (prev ? { ...prev, status } : null));
      }
    } catch (err: any) {
      setError(err?.message ?? `Không thể ${status === 'APPROVED' ? 'duyệt' : 'từ chối'} đính chính.`);
    } finally {
      setCorrecting(false);
    }
  };

  const colSpan = 10;

  const emptyMessage = !loading && !error && rows.length === 0 ? (
    <EmptyNote>Chưa có lượt ghi nhận nào. Quay lại trạm đóng gói và quét mã kiện để tạo bản ghi đầu tiên.</EmptyNote>
  ) : null;

  return (
    <div className="space-y-4">
      <EditorialPageHeader
        eyebrow={
          <>
            <span>Pack station</span>
            <span className="text-line-strong" aria-hidden="true">/</span>
            <span>Nhật ký</span>
          </>
        }
        title="Nhật ký đóng gói"
        description="Toàn bộ lượt ghi nhận kiện tại trạm đóng gói, sắp xếp theo thời điểm mới nhất."
        meta={
          <>
            <p>{filteredRows.length} bản ghi đang hiển thị</p>
            <p className="mt-0.5">
              <StatusLabel tone={error ? 'danger' : loading ? 'neutral' : 'success'}>
                {error ? 'Không tải được dữ liệu' : loading ? 'Đang đồng bộ' : 'Đã kết nối'}
              </StatusLabel>
            </p>
          </>
        }
        actions={
          <>
            <Button variant="outline" size="sm" onClick={loadData} isLoading={loading}>
              Làm mới
            </Button>
            <Button variant="primary" size="sm" onClick={() => setCorrectionOpen(true)}>
              Đính chính {corrections.length > 0 ? `(${corrections.length})` : ''}
            </Button>
          </>
        }
      />

      {error && (
        <div className="flex items-center justify-between rounded-md border-l-2 border-danger bg-surface px-3 py-2 text-[12px] text-ink-soft">
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={loadData}>
            Thử lại
          </Button>
        </div>
      )}

      {summary && !error ? (
        <MetricBand
          metrics={[
            { label: 'Phiên hôm nay', value: summary.sessionsToday, meta: 'Bắt đầu gần đây', tone: 'default' },
            { label: 'Tỷ lệ khớp', value: `${summary.matchRate}%`, meta: 'Quét đúng SKU', tone: 'default' },
            { label: 'Đính chính', value: summary.correctionCount, meta: 'Chờ xử lý', tone: 'warning' },
            { label: 'Trung bình', value: formatDuration(summary.averageSecondsPerPack), meta: 'Giây/kiện', tone: 'default' },
          ]}
        />
      ) : null}

      <EditorialSection eyebrow="Lịch sử" title="Các lượt ghi nhận">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Select
            label="Trạm"
            placeholder="Tất cả trạm"
            value={stationFilter}
            onChange={(event) => setStationFilter(event.target.value)}
            options={[{ value: '', label: 'Tất cả trạm' }, ...stations.map((station) => ({ value: station.id, label: station.name }))]}
          />
          <Select
            label="Kết quả"
            placeholder="Tất cả kết quả"
            value={matchFilter}
            onChange={(event) => setMatchFilter(event.target.value)}
            options={[
              { value: '', label: 'Tất cả kết quả' },
              { value: 'MATCH', label: 'Khớp chính xác' },
              { value: 'MISMATCH', label: 'Khác biệt' },
              { value: 'OVERRIDE', label: 'Đã thay thế' },
            ]}
          />
          <Select
            label="Trạng thái phiên"
            placeholder="Tất cả trạng thái"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            options={[
              { value: '', label: 'Tất cả trạng thái' },
              { value: 'ACTIVE', label: 'Đang mở' },
              { value: 'SEALING', label: 'Sắp đóng' },
              { value: 'CLOSED', label: 'Đã đóng' },
            ]}
          />
          <Input
            placeholder="Tìm mã đơn / mã kit / barcode"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] border-collapse text-left">
            <caption className="sr-only">Nhật ký các lượt ghi nhận kiện tại trạm đóng gói</caption>
            <thead>
              <tr className="border-b border-line">
                <th className="h-9 pr-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Mã phiên</th>
                <th className="h-9 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Mã đơn</th>
                <th className="h-9 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Trạm</th>
                <th className="h-9 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Nhân viên</th>
                <th className="h-9 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Dự kiến / quét</th>
                <th className="h-9 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Khớp</th>
                <th className="h-9 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Cân</th>
                <th className="h-9 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Hộp</th>
                <th className="h-9 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Trạng thái</th>
                <th className="h-9 pl-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Giờ</th>
              </tr>
            </thead>
            <tbody>
              <TableState
                loading={loading}
                empty={!loading && !error && filteredRows.length === 0}
                error={error ? new Error(error) : undefined}
                onRetry={loadData}
                colSpan={colSpan}
                emptyContent={
                  emptyMessage ? (
                    <tr>
                      <td colSpan={colSpan} className="py-12 text-center">
                        {emptyMessage}
                      </td>
                    </tr>
                  ) : null
                }
              >
                {filteredRows.map((row, index) => (
                  <tr key={`${row.packCode}-${row.scannedAt}-${index}`} className="h-[42px] border-b border-line/80 transition-colors hover:bg-surface-alt/60">
                    <td className="pr-3 font-mono text-[12px] font-medium text-ink">{row.session.sessionCode}</td>
                    <td className="px-3 text-[12px] text-ink-soft">{row.packCode}</td>
                    <td className="px-3 text-[12px] text-ink-soft">{row.station.name}</td>
                    <td className="px-3 text-[12px] text-ink-soft">{row.staff.fullName}</td>
                    <td className="px-3 text-[12px] text-ink-soft">
                      <div className="min-w-0">
                        <p className="truncate font-mono text-[12px]">{row.order ? row.order.expectedSku : row.expectedSku}</p>
                        <p className="mt-0 truncate text-[11px] text-ink-faint">
                          {row.order ? `${row.order.estimatedWeight}kg` : `${row.weight ?? ''}kg`}
                        </p>
                      </div>
                    </td>
                    <td className="px-3 text-[12px]">
                      <StatusLabel tone={matchStatusTone[row.result] ?? 'neutral'}>
                        {matchStatusLabel[row.result] ?? row.result}
                      </StatusLabel>
                    </td>
                    <td className="px-3 text-[12px] tabular-nums text-ink-soft">
                      {row.weight ? `${row.weight}kg` : '—'}
                    </td>
                    <td className="px-3 text-[12px] text-ink-soft">{row.boxType ? boxTypeLabel(row.boxType) : '—'}</td>
                    <td className="px-3 text-[12px]">
                      <StatusLabel tone={sessionStatusTone[row.session.status] ?? 'neutral'}>
                        {sessionStatusLabel[row.session.status] ?? row.session.status}
                      </StatusLabel>
                    </td>
                    <td className="pl-3 text-[12px] tabular-nums text-ink-soft">{formatDateTimeVN(row.scannedAt)}</td>
                  </tr>
                ))}
              </TableState>
            </tbody>
          </table>
        </div>
      </EditorialSection>

      <EditorialSection eyebrow="Dự báo" title="Phát hiện bất thường">
        {!anomalyLoading && anomalies.length === 0 ? (
          <EmptyNote>Không phát hiện bất thường nào hôm nay.</EmptyNote>
        ) : (
         <div className="space-y-3">
            {anomalies.map((anomaly) => (
              <div key={anomaly.id} className="rounded-md border border-line bg-surface p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[12px] font-medium text-ink">
                    {anomalyKindLabel[anomaly.kind] ?? anomaly.kind}
                  </p>
                  <div className="flex items-center gap-2">
                    <StatusLabel tone={anomalySeverityTone[anomaly.severity] ?? 'neutral'}>
                      {anomalySeverityLabel[anomaly.severity] ?? anomaly.severity}
                    </StatusLabel>
                    <span className="text-[11px] text-ink-faint">
                      {formatDateTimeVN(anomaly.createdAt)}
                    </span>
                  </div>
                </div>
                <p className="mt-1 text-[12px] text-ink-soft">
                  {anomaly.message}
                </p>
                <p className="mt-1 text-[12px] text-ink-faint">
                  Khuyến nghị: {anomaly.recommendation}
                </p>
              </div>
            ))}
          </div>
        )}
      </EditorialSection>

      {/* Correction modal */}
      <Modal
        isOpen={correctionOpen}
        onClose={() => setCorrectionOpen(false)}
        title="Chi tiết đính chính"
        size="lg"
        footer={
          <div className="flex items-center justify-between">
            <p className="text-[12px] text-ink-faint">{corrections.length} bản ghi</p>
            <Button variant="secondary" size="sm" onClick={fetchCorrections}>
              Làm mới
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          {corrections.length === 0 ? (
            <EmptyNote>Không có đính chính nào.</EmptyNote>
          ) : (
            [...corrections]
              .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
              .map((correction) => {
                const order = orderMap[correction.packCode];
                return (
                  <div key={correction.id} className="rounded-md border border-line bg-surface p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[12px] font-medium text-ink">{correction.packCode}</p>
                      <StatusLabel tone={correctionStatusTone[correction.status] ?? 'neutral'}>
                        {correctionStatusLabel[correction.status] ?? correction.status}
                      </StatusLabel>
                    </div>
                    <p className="mt-1 text-[12px] text-ink-soft">
                      Đơn: <span className="font-mono">{correction.trackingCode || order?.trackingCode || '—'}</span> •
                      SKU dự kiến: <span className="font-mono">{correction.orderSku}</span> •
                      Quét: <span className="font-mono">{correction.scannedSku}</span>
                    </p>
                    <p className="mt-1 text-[12px] text-ink-faint">{correction.reason}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <Button variant="primary" size="sm" onClick={() => handleApprove(correction, 'APPROVED')} disabled={correcting}>
                        Duyệt
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleApprove(correction, 'REJECTED')} disabled={correcting}>
                        Từ chối
                      </Button>
                    </div>
                  </div>
                );
              })
          )}
        </div>
      </Modal>
    </div>
  );
}
