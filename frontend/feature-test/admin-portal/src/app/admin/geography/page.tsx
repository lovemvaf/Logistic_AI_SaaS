'use client';

import { useCallback, useEffect, useState } from 'react';
import api from '@/lib/api';
import { isMockDataSource } from '@/lib/local-store';
import {
  EditorialPageHeader,
  EditorialSection,
  EmptyNote,
  MetricBand,
  StatusLabel,
  type StatusTone,
} from 'ui-kit';
import { Button } from 'ui-components';

const unwrapList = <T,>(res: any): T[] => {
  const payload = res?.data ?? res;
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};

const unwrapObj = <T,>(res: any): T => (res?.data !== undefined ? res.data : res);

const OUTBOX_TONE: Record<string, StatusTone> = {
  PUBLISHED: 'success',
  PENDING: 'info',
  PROCESSING: 'warning',
  DEAD_LETTER: 'danger',
};

export default function AdminGeographyAndDlqPage() {
  const [overview, setOverview] = useState<any>(null);
  const [units, setUnits] = useState<any[]>([]);
  const [outboxEvents, setOutboxEvents] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [outboxFilter, setOutboxFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [bootstrapping, setBootstrapping] = useState(false);

  // Official metadata edit modal state
  const [editingUnit, setEditingUnit] = useState<any>(null);
  const [officialCode, setOfficialCode] = useState('');
  const [sourceDoc, setSourceDoc] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [geoJsonText, setGeoJsonText] = useState('');
  const [savingOfficial, setSavingOfficial] = useState(false);

  const loadAll = useCallback(async () => {
    if (isMockDataSource) {
      setLoading(false);
      setError('Admin Geography 2026 & Platform Outbox DLQ require PostgreSQL API mode (NEXT_PUBLIC_DATA_SOURCE=api).');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [ovRes, unitRes, outboxRes] = await Promise.all([
        api.get('/geography/overview'),
        api.get('/geography/units', { params: { limit: 95 } }),
        api.get('/admin/dashboard/outbox'),
      ]);
      setOverview(unwrapObj<any>(ovRes));
      const unitObj = unwrapObj<any>(unitRes);
      setUnits(Array.isArray(unitObj?.data) ? unitObj.data : unwrapList<any>(unitRes));
      setOutboxEvents(unwrapList<any>(outboxRes));
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load geography & outbox data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handleBootstrap = async () => {
    setBootstrapping(true);
    setFeedback('');
    setError('');
    try {
      const res = await api.post('/geography/admin/units/bootstrap-2026');
      const obj = unwrapObj<any>(res);
      setFeedback(`Bootstrapped ${obj?.upsertedUnits ?? 95} Dong Nai 2026 units and ${obj?.upsertedAliases ?? 0} aliases.`);
      await loadAll();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Bootstrap failed.');
    } finally {
      setBootstrapping(false);
    }
  };

  const handleSaveOfficial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUnit || !sourceDoc.trim()) return;
    setSavingOfficial(true);
    setError('');
    setFeedback('');
    try {
      let geometryGeoJson: Record<string, unknown> | undefined;
      if (geoJsonText.trim()) {
        geometryGeoJson = JSON.parse(geoJsonText.trim());
      }
      await api.patch(`/geography/admin/units/${editingUnit.id}/official`, {
        ...(officialCode.trim() ? { officialCode: officialCode.trim() } : {}),
        sourceDoc: sourceDoc.trim(),
        ...(sourceUrl.trim() ? { sourceUrl: sourceUrl.trim() } : {}),
        ...(geometryGeoJson ? { geometryGeoJson } : {}),
      });
      setFeedback(`Updated official metadata for ${editingUnit.canonicalName} (source: ${sourceDoc.trim()}).`);
      setEditingUnit(null);
      setOfficialCode('');
      setSourceDoc('');
      setSourceUrl('');
      setGeoJsonText('');
      await loadAll();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to save official metadata.');
    } finally {
      setSavingOfficial(false);
    }
  };

  const handleRedrive = async (id: string) => {
    setFeedback('');
    try {
      await api.post(`/admin/dashboard/outbox/${id}/redrive`);
      setFeedback(`Outbox event ${id} moved back to PENDING queue for redelivery.`);
      await loadAll();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Redrive failed.');
    }
  };

  const filteredUnits = units.filter((u) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      String(u.canonicalName || '').toLowerCase().includes(q) ||
      String(u.normalizedName || '').toLowerCase().includes(q) ||
      String(u.corridor || '').toLowerCase().includes(q)
    );
  });

  const filteredOutbox = outboxEvents.filter((ev) =>
    outboxFilter === 'ALL' ? true : ev.status === outboxFilter,
  );

  return (
    <div className="space-y-5">
      <EditorialPageHeader
        eyebrow="Platform Governance"
        title="Dong Nai 2026 Master & Outbox DLQ"
        description="Manage the 95 canonical wards and communes of TP Dong Nai 2026 without fabricated administrative codes or GIS polygons, and redrive dead-letter outbox messages across the platform."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" size="sm" isLoading={bootstrapping} onClick={() => void handleBootstrap()}>
              Bootstrap 2026 (95 DVHC)
            </Button>
            <Button variant="outline" size="sm" onClick={() => void loadAll()}>
              Refresh
            </Button>
          </div>
        }
      />

      {error ? (
        <div className="border-l-2 border-danger bg-surface px-3 py-2 text-[12px] text-danger">
          {error}
        </div>
      ) : null}

      {feedback ? (
        <div className="border-l-2 border-success bg-surface px-3 py-2 text-[12px] text-ink">
          {feedback}
        </div>
      ) : null}

      <div className="rounded-md border border-warning/40 bg-warning/5 px-4 py-3 text-[12px] text-ink-soft">
        <strong className="text-ink">Master Data Integrity Notice:</strong> Until an authoritative{' '}
        <code>sourceDoc</code> is attached via the official update dialog below, units keep{' '}
        <code>officialCodeStatus = PENDING_OFFICIAL_CODE</code> and{' '}
        <code>boundaryStatus = NO_OFFICIAL_POLYGON</code>. Synthetic codes are strictly forbidden.
      </div>

      <MetricBand
        metrics={[
          { label: 'Total Units', value: overview?.totalUnits ?? units.length, meta: 'Expected: 95 (33W + 62C)' },
          { label: 'Wards / Communes', value: `${overview?.wardCount ?? 0} / ${overview?.communeCount ?? 0}`, meta: '33 Phuong / 62 Xa' },
          {
            label: 'Pending Official Code',
            value: overview?.pendingOfficialCodeCount ?? 0,
            tone: 'warning',
            meta: 'Awaiting official decree code',
          },
          {
            label: 'Outbox Dead-Letter',
            value: outboxEvents.filter((e) => e.status === 'DEAD_LETTER').length,
            tone: outboxEvents.some((e) => e.status === 'DEAD_LETTER') ? 'danger' : 'success',
            meta: `${outboxEvents.length} total platform events`,
          },
        ]}
      />

      {loading ? (
        <EmptyNote>Loading platform master data and outbox telemetry...</EmptyNote>
      ) : (
        <>
          <EditorialSection eyebrow="Platform Outbox" title={`Platform Outbox & DLQ (${filteredOutbox.length})`}>
            <div className="mb-3 flex flex-wrap gap-2">
              {['ALL', 'DEAD_LETTER', 'PENDING', 'PUBLISHED'].map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setOutboxFilter(status)}
                  className={`rounded-md border px-2.5 py-1 text-[11px] font-medium ${
                    outboxFilter === status
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-line bg-surface text-ink-soft hover:text-ink'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
            {filteredOutbox.length === 0 ? (
              <EmptyNote>No platform outbox events match the filter.</EmptyNote>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] border-collapse text-left text-[12px]">
                  <thead>
                    <tr className="border-b border-line text-[10px] uppercase tracking-[0.14em] text-ink-faint">
                      <th className="py-2 pr-3">Channel / Topic</th>
                      <th className="py-2 px-3">Aggregate</th>
                      <th className="py-2 px-3">Attempts</th>
                      <th className="py-2 px-3">Status / Error</th>
                      <th className="py-2 pl-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOutbox.slice(0, 30).map((ev) => (
                      <tr key={ev.id} className="border-b border-line/80">
                        <td className="py-2 pr-3 font-mono text-ink">
                          {ev.channel} / {ev.topic}
                        </td>
                        <td className="py-2 px-3 font-mono text-[11px] text-ink-soft">{ev.aggregateId}</td>
                        <td className="py-2 px-3 tabular-nums text-ink-soft">{ev.attempts}</td>
                        <td className="py-2 px-3">
                          <StatusLabel tone={OUTBOX_TONE[ev.status] ?? 'neutral'}>{ev.status}</StatusLabel>
                          {ev.deadLetterReason || ev.lastError ? (
                            <div className="mt-1 max-w-xs truncate text-[11px] text-danger">
                              {ev.deadLetterReason || ev.lastError}
                            </div>
                          ) : null}
                        </td>
                        <td className="py-2 pl-3 text-right">
                          {ev.status === 'DEAD_LETTER' || ev.status === 'FAILED' ? (
                            <Button size="sm" variant="primary" onClick={() => void handleRedrive(ev.id)}>
                              Redrive
                            </Button>
                          ) : (
                            <span className="text-[11px] text-ink-faint">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </EditorialSection>

          <EditorialSection eyebrow="TP Dong Nai 2026" title={`Administrative Units (${filteredUnits.length} / ${units.length})`}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter by ward, commune, corridor..."
                className="h-9 w-72 rounded-md border border-line bg-surface px-3 text-[12px] text-ink outline-none focus:border-accent"
              />
            </div>

            {filteredUnits.length === 0 ? (
              <EmptyNote>No administrative units found. Click Bootstrap 2026 above to initialize the 95 units.</EmptyNote>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[740px] border-collapse text-left text-[12px]">
                  <thead>
                    <tr className="border-b border-line text-[10px] uppercase tracking-[0.14em] text-ink-faint">
                      <th className="py-2 pr-3">Canonical Name</th>
                      <th className="py-2 px-3">Type</th>
                      <th className="py-2 px-3">Corridor</th>
                      <th className="py-2 px-3">Official Code Status</th>
                      <th className="py-2 px-3">Boundary GIS Status</th>
                      <th className="py-2 pl-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUnits.map((u) => (
                      <tr key={u.id} className="border-b border-line/80">
                        <td className="py-2 pr-3 font-medium text-ink">
                          {u.canonicalName}
                          {u.officialCode ? (
                            <span className="ml-2 font-mono text-[11px] text-accent">[{u.officialCode}]</span>
                          ) : null}
                        </td>
                        <td className="py-2 px-3">{u.unitType}</td>
                        <td className="py-2 px-3">{u.corridor || '—'}</td>
                        <td className="py-2 px-3">
                          <StatusLabel tone={u.officialCodeStatus === 'OFFICIAL_VERIFIED' ? 'success' : 'warning'}>
                            {u.officialCodeStatus}
                          </StatusLabel>
                        </td>
                        <td className="py-2 px-3">
                          <StatusLabel tone={u.boundaryStatus === 'OFFICIAL_GIS_POLYGON' ? 'success' : 'neutral'}>
                            {u.boundaryStatus}
                          </StatusLabel>
                        </td>
                        <td className="py-2 pl-3 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditingUnit(u);
                              setOfficialCode(u.officialCode || '');
                              setSourceDoc(u.sourceDoc || '');
                              setSourceUrl('');
                              setGeoJsonText('');
                            }}
                          >
                            Update Official
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </EditorialSection>
        </>
      )}

      {editingUnit ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-faint/50 p-4">
          <div className="w-full max-w-md rounded-lg border border-line bg-surface p-6 shadow-floating">
            <h3 className="text-[15px] font-semibold text-ink">
              Update Official Metadata: {editingUnit.canonicalName}
            </h3>
            <p className="mt-1 text-[12px] text-ink-soft">
              Requires an authoritative source document reference before promoting status from{' '}
              <code>PENDING_OFFICIAL_CODE</code>.
            </p>
            <form onSubmit={handleSaveOfficial} className="mt-4 space-y-3">
              <label className="block text-[11px] font-medium text-ink-soft">
                Authoritative Source Document *
                <input
                  type="text"
                  required
                  value={sourceDoc}
                  onChange={(e) => setSourceDoc(e.target.value)}
                  placeholder="e.g. NQ-UBTVQH-2026-DN"
                  className="mt-1 h-9 w-full rounded-md border border-line bg-canvas px-3 text-[12px] text-ink"
                />
              </label>
              <label className="block text-[11px] font-medium text-ink-soft">
                Official Administrative Code (optional)
                <input
                  type="text"
                  value={officialCode}
                  onChange={(e) => setOfficialCode(e.target.value)}
                  placeholder="e.g. 26001"
                  className="mt-1 h-9 w-full rounded-md border border-line bg-canvas px-3 text-[12px] text-ink"
                />
              </label>
              <label className="block text-[11px] font-medium text-ink-soft">
                Source URL (optional)
                <input
                  type="url"
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  placeholder="https://vbpl.vn/..."
                  className="mt-1 h-9 w-full rounded-md border border-line bg-canvas px-3 text-[12px] text-ink"
                />
              </label>
              <label className="block text-[11px] font-medium text-ink-soft">
                Official GeoJSON Polygon (optional JSON)
                <textarea
                  rows={3}
                  value={geoJsonText}
                  onChange={(e) => setGeoJsonText(e.target.value)}
                  placeholder='{"type":"Polygon","coordinates":[...]}'
                  className="mt-1 w-full rounded-md border border-line bg-canvas p-2 font-mono text-[11px] text-ink"
                />
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => setEditingUnit(null)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" isLoading={savingOfficial}>
                  Save Verified Metadata
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
