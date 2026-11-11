'use client';

import { useState, useEffect } from 'react';
import { TableState } from 'ui-components';
import { EditorialPageHeader, EditorialSection, MetricBand, StatusLabel } from 'ui-kit';
import { formatDate, formatNumber, parseMoney } from '@/lib/format';
import { Invoice, fetchPaginatedFromStoreOrAPI, initStore, isMockDataSource } from '@/lib/local-store';

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
  link.download = 'billing-invoices.csv';
  link.click();
  URL.revokeObjectURL(url);
}

function formatUSD(value: string | number | null | undefined): string {
  if (value == null) return '—';
  const num = typeof value === 'number' ? value : Number(String(value).replace(/[$,]/g, ''));
  if (Number.isNaN(num)) return '—';
  return `$${num.toLocaleString('en-US')}`;
}

export default function BillingPage() {
  const [page, setPage] = useState(1);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [mrr, setMrr] = useState(0);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('All');

  useEffect(() => {
    void fetchBilling(page, filter);
  }, [page, filter]);

  const fetchBilling = async (pageNum: number, currentFilter: string) => {
    setLoading(true);
    setError('');
    try {
      initStore();
      const result = await fetchPaginatedFromStoreOrAPI<Invoice>(
        'invoices',
        `/admin/billing?page=${pageNum}&limit=${PAGE_SIZE}`,
      );
      const filtered = currentFilter === 'All' ? result.data : result.data.filter((inv) => inv.status === currentFilter);
      if (isMockDataSource) {
        const start = (pageNum - 1) * PAGE_SIZE;
        setInvoices(filtered.slice(start, start + PAGE_SIZE));
        setTotal(filtered.length);
        setMrr(
          filtered
            .filter((inv) => inv.status === 'PAID')
            .reduce((sum, inv) => sum + (parseMoney(inv.amount) || 0), 0),
        );
      } else {
        setInvoices(filtered);
        setTotal(currentFilter === 'All' ? Number(result.meta?.total ?? filtered.length) : filtered.length);
        setMrr(
          typeof result.meta?.mrr === 'number'
            ? result.meta.mrr
            : filtered.filter((inv) => inv.status === 'PAID').reduce((sum, inv) => sum + (parseMoney(inv.amount) || 0), 0),
        );
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load billing data.');
      setInvoices([]);
      setTotal(0);
      setMrr(0);
    } finally {
      setLoading(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const start = (page - 1) * PAGE_SIZE;

  const statusTone = (status: string | undefined) => {
    switch (status) {
      case 'PAID':
        return 'success';
      case 'DUE':
        return 'warning';
      case 'OVERDUE':
        return 'danger';
      default:
        return 'neutral';
    }
  };

  const filters = ['All', 'PAID', 'DUE', 'OVERDUE'];

  const handleExportCSV = () => {
    const rows = [
      ['Invoice ID', 'Tenant', 'Plan', 'Amount', 'Issued', 'Status'],
      ...invoices.map((invoice) => [
        invoice.id,
        invoice.tenant,
        invoice.plan,
        formatUSD(invoice.amount),
        invoice.issuedAt ? formatDate(invoice.issuedAt) : '—',
        invoice.status ?? '—',
      ]),
    ];
    downloadCSV(rows.map((row) => row.map((cell) => csvCell(String(cell ?? ''))).join(',')));
  };

  return (
    <div>
      <EditorialPageHeader
        eyebrow="Administration"
        title="Billing & invoices"
        description="Manage SaaS subscriptions, track MRR, and monitor overdue payments."
        meta={
          <div className="text-[11px] leading-5">
            {total > 0 ? `${total} invoices` : 'No billed invoices'}
          </div>
        }
      />

      <MetricBand
        metrics={[
          { label: 'Global MRR', value: formatUSD(mrr > 0 ? mrr : null), meta: 'Paid invoices, current period' },
          { label: 'Paid', value: formatNumber(invoices.filter((inv) => inv.status === 'PAID').length), meta: 'In this view' },
          { label: 'Due', value: formatNumber(invoices.filter((inv) => inv.status === 'DUE').length), meta: 'Awaiting payment' },
          { label: 'Overdue', value: formatNumber(invoices.filter((inv) => inv.status === 'OVERDUE').length), meta: 'Past due date', tone: 'danger' },
        ]}
      />

      <EditorialSection eyebrow="Payments" title="Invoice ledger">
        {/* Toolbar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-2 overflow-x-auto">
            {filters.map((f) => (
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
          <button
            type="button"
            onClick={handleExportCSV}
            className="h-9 rounded-md border border-line px-3 text-[12px] font-medium text-ink-soft transition-colors hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
          >
            Export CSV
          </button>
        </div>

        {/* Data table */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">All billed invoices</caption>
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="h-8 pr-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Invoice ID</th>
                <th scope="col" className="h-8 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Tenant</th>
                <th scope="col" className="h-8 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Plan</th>
                <th scope="col" className="h-8 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Amount</th>
                <th scope="col" className="h-8 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Issued At</th>
                <th scope="col" className="h-8 pl-3 text-right text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Status</th>
              </tr>
            </thead>
            <tbody>
              <TableState
                loading={loading}
                empty={!loading && invoices.length === 0}
                error={error ? new Error(error) : undefined}
                onRetry={() => void fetchBilling(page, filter)}
                colSpan={6}
                emptyTitle="No invoices found"
                emptyDescription="Invoices will appear once billed."
              >
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="h-[42px] border-b border-line/80 transition-colors hover:bg-surface-alt/60">
                    <td className="pr-3 text-[12px] font-medium font-mono text-ink">{invoice.id}</td>
                    <td className="px-3 text-[12px] text-ink">{invoice.tenant}</td>
                    <td className="px-3 text-[12px]">
                      <StatusLabel tone={invoice.plan === 'Enterprise' ? 'info' : invoice.plan === 'Pro' ? 'success' : 'neutral'}>
                        {invoice.plan ?? '—'}
                      </StatusLabel>
                    </td>
                    <td className="px-3 text-[12px] tabular-nums text-ink-soft">{formatUSD(invoice.amount)}</td>
                    <td className="px-3 text-[12px] tabular-nums text-ink-soft">
                      {invoice.issuedAt ? new Date(invoice.issuedAt).toLocaleDateString('en-GB', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                    </td>
                    <td className="pl-3 text-right">
                      <StatusLabel tone={statusTone(invoice.status)}>{invoice.status ?? '—'}</StatusLabel>
                    </td>
                  </tr>
                ))}
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
