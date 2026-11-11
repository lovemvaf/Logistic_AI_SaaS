'use client';

import { useState, useEffect } from 'react';
import { TableState } from 'ui-components';
import { EditorialPageHeader, EditorialSection, StatusLabel } from 'ui-kit';
import { formatDateTime } from '@/lib/format';
import { AuditLog, fetchPaginatedFromStoreOrAPI, initStore, isMockDataSource } from '@/lib/local-store';

const PAGE_SIZE = 15;

// Prevents spreadsheet formula injection (CSV CWE-1236) and properly quotes CSV cells.
function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  if (/[,"\n\r]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`;
  return safe;
}

// Builds a CSV from rows of values and downloads it as a file.
function downloadCSV(rows: string[]): void {
  const csv = rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'audit-logs.csv';
  link.click();
  URL.revokeObjectURL(url);
}

export default function AuditLogsPage() {
  const [page, setPage] = useState(1);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');

  useEffect(() => {
    void fetchLogs(page, filter, search);
  }, [page, filter, search]);

  const fetchLogs = async (pageNum: number, currentFilter: string, currentSearch: string) => {
    setLoading(true);
    setError('');
    try {
      initStore();
      const params = new URLSearchParams({ page: String(pageNum), limit: String(PAGE_SIZE) });
      if (currentFilter !== 'All') params.set('action', currentFilter);
      if (currentSearch.trim()) params.set('actorEmail', currentSearch.trim());

      const result = await fetchPaginatedFromStoreOrAPI<AuditLog>(
        'auditLogs',
        `/admin/audit-logs?${params.toString()}`,
      );
      if (isMockDataSource) {
        const q = currentSearch.trim().toLowerCase();
        const filtered = result.data.filter((log) => {
          if (currentFilter !== 'All' && !(log.action ?? '').includes(currentFilter)) return false;
          if (q) {
            const hay = `${log.actorEmail ?? log.actor ?? ''} ${log.resourceId ?? log.target ?? ''}`.toLowerCase();
            if (!hay.includes(q)) return false;
          }
          return true;
        });
        const start = (pageNum - 1) * PAGE_SIZE;
        setLogs(filtered.slice(start, start + PAGE_SIZE));
        setTotal(filtered.length);
      } else {
        setLogs(result.data);
        setTotal(Number(result.meta?.total ?? result.data.length));
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load audit logs.');
      setLogs([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const start = (page - 1) * PAGE_SIZE;

  const actionTone = (action?: string): 'neutral' | 'success' | 'warning' | 'danger' | 'info' => {
    if (!action) return 'neutral';
    if (action.includes('SUCCESS')) return 'success';
    if (action.includes('FAILED')) return 'danger';
    if (action.includes('CREATE')) return 'info';
    if (action.includes('UPDATE')) return 'info';
    if (action.includes('DELETE')) return 'danger';
    if (action.includes('SUSPEND')) return 'warning';
    return 'neutral';
  };

  const buttons = ['All', 'CREATE', 'UPDATE', 'DELETE', 'SUSPEND'];

  const handleExportCSV = () => {
    const rows = [
      ['Timestamp', 'Actor & IP', 'Action', 'Resource', 'Target'],
      ...logs.map((log) => [
        log.timestamp ?? log.createdAt ? formatDateTime(log.timestamp ?? log.createdAt) : '—',
        `${log.actor ?? log.actorEmail ?? 'System'} · ${log.ip ?? log.ipAddress ?? '—'}`,
        log.action ?? '—',
        log.resource ?? log.resourceType ?? '—',
        log.target ?? log.resourceId ?? '—',
      ]),
    ];
    downloadCSV(rows.map((row) => row.map((cell) => csvCell(String(cell ?? ''))).join(',')));
  };

  return (
    <div>
      <EditorialPageHeader
        eyebrow="Administration"
        title="Security & audit logs"
        description="Immutable ledger of platform actions, configurations, and security events."
        meta={
          <div className="text-[11px] leading-5">
            {total > 0 ? `${total} entries` : 'No entries recorded'}
          </div>
        }
        actions={
          <button
            type="button"
            onClick={handleExportCSV}
            className="h-9 rounded-md border border-line px-3 text-[12px] font-medium text-ink-soft transition-colors hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
          >
            Export CSV
          </button>
        }
      />

      <EditorialSection eyebrow="Ledger" title="Activity">
        {/* Toolbar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-2 overflow-x-auto">
            {buttons.map((f) => (
              <button
                key={f}
                onClick={() => {
                  setFilter(f);
                  setPage(1);
                }}
                className={`h-8 rounded-md px-3 text-[11px] font-medium transition-colors ${
                  filter === f
                    ? 'border-accent text-accent hover:bg-accent/10'
                    : 'border-border text-ink-soft hover:bg-surface-alt hover:text-ink'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <input
            type="search"
            value={search}
            placeholder="Find an actor or resource id"
            className="h-9 max-w-[300px] rounded-md border border-line bg-surface-alt px-3 text-[13px] text-ink outline-none placeholder:text-ink-faint focus:border-accent focus:ring-2 focus:ring-accent/15"
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>

        {/* Data table */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">All security and audit events</caption>
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="h-8 pr-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Timestamp</th>
                <th scope="col" className="h-8 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Actor & IP</th>
                <th scope="col" className="h-8 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Action</th>
                <th scope="col" className="h-8 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Resource</th>
                <th scope="col" className="h-8 pl-3 text-right text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Target</th>
              </tr>
            </thead>
            <tbody>
              <TableState
                loading={loading}
                empty={!loading && logs.length === 0}
                error={error ? new Error(error) : undefined}
                onRetry={() => void fetchLogs(page, filter, search)}
                colSpan={5}
                emptyTitle="No audit logs found"
                emptyDescription="Logs will appear once an action is recorded."
              >
                {logs.map((log) => {
                  const when = log.timestamp ?? log.createdAt ?? log.created_at;
                  const date = when ? new Date(when).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
                  const time = when ? new Date(when).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';
                  const actor = log.actor ?? log.actorEmail ?? 'System';
                  const ip = log.ip ?? log.ipAddress ?? '—';
                  const resource = log.resource ?? log.resourceType ?? '—';
                  const target = log.target ?? log.resourceId ?? '—';
                  return (
                    <tr key={log.id} className="h-[42px] border-b border-line/80 transition-colors hover:bg-surface-alt/60">
                      <td className="pr-3 text-[12px] tabular-nums text-ink-soft">
                        <div className="text-ink">{date}</div>
                        <div className="text-[10px] text-ink-faint mt-0.5">{time}</div>
                      </td>
                      <td className="px-3">
                        <div className="text-[12px] font-medium text-ink">{actor}</div>
                        <div className="mt-0.5 text-[11px] text-ink-faint">
                          {ip} · {log.resourceType ?? ''}
                        </div>
                      </td>
                      <td className="px-3 text-[12px]">
                        <StatusLabel tone={actionTone(log.action)}>{log.action ?? 'UNKNOWN'}</StatusLabel>
                      </td>
                      <td className="px-3 text-[12px] text-ink-soft">{resource}</td>
                      <td className="pl-3 text-right text-[12px] text-ink-soft">
                        <span className="block max-w-[200px] truncate" title={target}>{target}</span>
                      </td>
                    </tr>
                  );
                })}
              </TableState>
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && total > 0 && (
          <div className="flex items-center justify-between gap-4 border-t border-line py-3">
            <div className="text-[11px] text-ink-faint">
              Showing <span className="text-ink tabular-nums">{start + 1}</span> to{' '}
              <span className="text-ink tabular-nums">{Math.min(start + PAGE_SIZE, total)}</span> of{' '}
              <span className="text-ink tabular-nums">{total}</span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="h-9 rounded-md border border-line px-3 text-[12px] font-medium text-ink-soft transition-colors hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 disabled:cursor-wait disabled:opacity-60"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                className="h-9 rounded-md border border-line px-3 text-[12px] font-medium text-ink-soft transition-colors hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 disabled:cursor-wait disabled:opacity-60"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </EditorialSection>
    </div>
  );
}
