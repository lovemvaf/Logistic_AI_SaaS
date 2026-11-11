'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, TableState } from 'ui-components';
import {
  EditorialPageHeader,
  EditorialSection,
  StatusLabel,
} from 'ui-kit';
import api from '@/lib/api';
import {
  Tenant,
  create,
  fetchPaginatedFromStoreOrAPI,
  initStore,
  isMockDataSource,
  update,
  remove,
} from '@/lib/local-store';

const PAGE_SIZE = 15;

function getPlanLabel(plan: Tenant['plan']): string {
  if (!plan) return '—';
  return typeof plan === 'string' ? plan : plan.name ?? '—';
}

export default function TenantsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pageParam = searchParams.get('page');
  const page = Math.max(1, Number(pageParam ?? '1') || 1);

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newTenantName, setNewTenantName] = useState('');
  const [newTenantSlug, setNewTenantSlug] = useState('');
  const [newTenantPlan, setNewTenantPlan] = useState('Starter');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [creating, setCreating] = useState(false);

  const [confirmAction, setConfirmAction] = useState<{ tenant?: Tenant; action?: string }>({});
  const [confirmText, setConfirmText] = useState('');
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmError, setConfirmError] = useState('');

  useEffect(() => {
    void fetchTenants(page, filter, search);
  }, [page, filter, search]);

  useEffect(() => {
    if (searchParams.get('action') === 'new') {
      setIsModalOpen(true);
      const newUrl = window.location.pathname + (page !== 1 ? `?page=${page}` : '');
      window.history.replaceState({}, '', newUrl);
    }
  }, [searchParams, page]);

  const handleNameChange = (name: string) => {
    setNewTenantName(name);
    setNewTenantSlug(name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''));
  };

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTenantName || !newTenantSlug) return;
    setError('');
    setCreating(true);
    try {
      if (isMockDataSource) {
        initStore();
        const newTenant: Tenant = {
          id: `tnnt_${Date.now()}`,
          name: newTenantName,
          slug: newTenantSlug,
          plan: newTenantPlan,
          maxUsers: newTenantPlan === 'Enterprise' ? 50 : newTenantPlan === 'Pro' ? 25 : 10,
          maxWarehouses: newTenantPlan === 'Enterprise' ? 10 : newTenantPlan === 'Pro' ? 5 : 2,
          status: 'PENDING',
          createdAt: new Date().toISOString(),
        };
        create('tenants', newTenant);
      } else {
        await api.post('/admin/tenants', {
          name: newTenantName.trim(),
          slug: newTenantSlug.trim(),
          plan: newTenantPlan,
          ...(adminEmail.trim() && adminPassword ? { adminEmail: adminEmail.trim(), adminPassword } : {}),
        });
      }
      setIsModalOpen(false);
      setNewTenantName('');
      setNewTenantSlug('');
      setNewTenantPlan('Starter');
      setAdminEmail('');
      setAdminPassword('');
      void fetchTenants(1, 'All', '');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to create tenant. Slug might already be in use.');
    } finally {
      setCreating(false);
    }
  };

  const fetchTenants = async (pageNum: number, currentFilter: string, currentSearch: string) => {
    setLoading(true);
    setError('');
    try {
      initStore();
      const result = await fetchPaginatedFromStoreOrAPI<Tenant>(
        'tenants',
        `/admin/tenants?page=${pageNum}&limit=${PAGE_SIZE}`,
      );
      const q = currentSearch.trim().toLowerCase();
      const matchesFilterAndSearch = (t: Tenant) => {
        if (currentFilter !== 'All' && t.status !== currentFilter) return false;
        if (q && !t.name.toLowerCase().includes(q) && !t.slug.toLowerCase().includes(q)) return false;
        return true;
      };
      if (isMockDataSource) {
        const filtered = result.data.filter(matchesFilterAndSearch);
        const start = (pageNum - 1) * PAGE_SIZE;
        setTenants(filtered.slice(start, start + PAGE_SIZE));
        setTotal(filtered.length);
      } else {
        const filtered = result.data.filter(matchesFilterAndSearch);
        setTenants(filtered);
        setTotal(
          currentFilter === 'All' && !q
            ? Number(result.meta?.total ?? filtered.length)
            : filtered.length,
        );
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load tenants.');
      setTenants([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  const handleFilter = (newFilter: string) => {
    setFilter(newFilter);
    router.push('/admin/tenants?page=1');
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const start = (page - 1) * PAGE_SIZE;

  const handleDelete = async (tenant: Tenant) => {
    if (isMockDataSource) {
      remove('tenants', tenant.id);
    } else {
      await api.delete(`/admin/tenants/${tenant.id}`);
    }
    setTenants((prev) => prev.filter((t) => t.id !== tenant.id));
    setTotal((t) => Math.max(0, t - 1));
  };

  const handleConfirmAction = async () => {
    const { tenant, action } = confirmAction;
    if (!tenant || !action) return;
    if (action === 'suspend' && confirmText !== tenant.name) {
      setConfirmError('Confirmation text does not match tenant name.');
      return;
    }
    setConfirmLoading(true);
    setConfirmError('');
    try {
      if (action === 'delete') {
        await handleDelete(tenant);
      } else {
        const target = action === 'suspend' ? 'SUSPENDED' : 'ACTIVE';
        if (isMockDataSource) {
          update('tenants', tenant.id, { status: target });
        } else {
          await api.patch(`/admin/tenants/${tenant.id}`, { status: target });
        }
      }
      setConfirmAction({});
      setConfirmText('');
      await fetchTenants(page, filter, search);
    } catch (err: any) {
      setConfirmError(err?.response?.data?.message || `Failed to ${action} tenant via API.`);
    } finally {
      setConfirmLoading(false);
    }
  };

  const filters = ['All', 'ACTIVE', 'PENDING', 'SUSPENDED'];

  return (
    <div>
      <EditorialPageHeader
        eyebrow="Administration"
        title="Tenants"
        description="Manage enterprise accounts, resource quotas, and system access."
        meta={
          <div className="text-[11px] leading-5">
            {total > 0 ? `${total} tenants registered` : 'No tenants registered'}
          </div>
        }
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsModalOpen(true)}
            disabled={isModalOpen}
          >
            Add tenant
          </Button>
        }
      />

      <EditorialSection eyebrow="Pending review" title="Tenant overview">
        {/* Toolbar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0">
            {filters.map((f) => (
              <button
                key={f}
                onClick={() => handleFilter(f)}
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
            placeholder="Find a tenant by name or slug"
            className="h-9 max-w-[300px] rounded-md border border-line bg-surface-alt px-3 text-[13px] text-ink outline-none placeholder:text-ink-faint focus:border-accent focus:ring-2 focus:ring-accent/15"
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Data table */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">All registered tenants</caption>
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="h-8 pr-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Company & workspace</th>
                <th scope="col" className="h-8 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Plan</th>
                <th scope="col" className="h-8 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Quotas</th>
                <th scope="col" className="h-8 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Registered</th>
                <th scope="col" className="h-8 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Status</th>
                <th scope="col" className="h-8 pl-3 text-right text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Actions</th>
              </tr>
            </thead>
            <tbody>
              <TableState
                loading={loading}
                empty={!loading && tenants.length === 0}
                error={error ? new Error(error) : undefined}
                onRetry={() => void fetchTenants(page, filter, search)}
                colSpan={6}
                emptyTitle="No tenants found"
                emptyDescription="Tenants created or synced will appear here."
              >
                {tenants.map((row) => {
                  const planName = getPlanLabel(row.plan);
                  return (
                    <tr key={row.id} className="h-[42px] border-b border-line/80 transition-colors hover:bg-surface-alt/60">
                      <td className="pr-3">
                        <div className="min-w-0">
                          <Link href={`/admin/tenants/${row.id}`} className="text-[12px] font-medium text-ink hover:text-accent hover:underline">
                            {row.name}
                          </Link>
                          <div className="mt-1 text-[11px] text-ink-faint truncate">{row.slug}</div>
                        </div>
                      </td>
                      <td className="px-3">
                        <StatusLabel tone={planName === 'Enterprise' ? 'success' : planName === 'Pro' ? 'info' : 'neutral'}>
                          {planName}
                        </StatusLabel>
                      </td>
                      <td className="px-3 text-[12px] text-ink-soft">
                        <div className="flex items-center gap-4">
                          <span title="Users">{row.maxUsers ?? '—'}</span>
                          <span className="text-ink-faint" aria-hidden="true">
                            ·
                          </span>
                          <span title="Warehouses">{row.maxWarehouses ?? '—'}</span>
                        </div>
                      </td>
                      <td className="px-3 text-[12px] tabular-nums text-ink-soft">
                        {row.createdAt ? new Date(row.createdAt).toLocaleDateString('en-GB', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                      </td>
                      <td className="px-3">
                        <StatusLabel tone={row.status === 'ACTIVE' ? 'success' : row.status === 'SUSPENDED' ? 'danger' : 'warning'}>
                          {row.status || '—'}
                        </StatusLabel>
                      </td>
                      <td className="pl-3 text-right">
                        <div className="flex justify-end gap-2">
                          <Link
                            href={`/admin/tenants/${row.id}`}
                            className="text-[11px] font-medium text-ink-soft underline decoration-ink-faint/30 underline-offset-2 hover:text-accent hover:decoration-accent"
                          >
                            Details
                          </Link>
                          {row.status === 'ACTIVE' ? (
                            <button
                              type="button"
                              onClick={() => setConfirmAction({ tenant: row, action: 'suspend' })}
                              className="text-[11px] font-medium text-ink-soft underline decoration-ink-faint/30 underline-offset-2 hover:text-danger hover:decoration-danger"
                            >
                              Suspend
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmAction({ tenant: row, action: 'reactivate' })}
                              className="text-[11px] font-medium text-ink-soft underline decoration-ink-faint/30 underline-offset-2 hover:text-accent hover:decoration-accent"
                            >
                              Reactivate
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setConfirmAction({ tenant: row, action: 'delete' })}
                            className="text-[11px] font-medium text-ink-soft underline decoration-ink-faint/30 underline-offset-2 hover:text-danger hover:decoration-danger"
                          >
                            Delete
                          </button>
                        </div>
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
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/admin/tenants?page=${Math.max(1, page - 1)}`)}
                disabled={page === 1}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/admin/tenants?page=${Math.min(totalPages, page + 1)}`)}
                disabled={page >= totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </EditorialSection>

      {/* Onboarding Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-faint/50">
          <div className="w-full max-w-md rounded-lg border border-line bg-surface p-6 shadow-floating">
            <div className="flex items-start justify-between border-b border-line pb-3">
              <div>
                <h3 className="text-[15px] font-semibold text-ink">Onboard tenant</h3>
                <p className="mt-0.5 text-[12px] text-ink-soft">Register a new enterprise customer.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-ink-faint hover:text-ink transition-colors"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleCreateTenant} className="mt-4 space-y-4">
              {error && (
                <div className="rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-[12px] text-danger">
                  {error}
                </div>
              )}

              <label className="block">
                <span className="text-[11px] font-medium text-ink-soft">Company name</span>
                <input
                  type="text"
                  value={newTenantName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="e.g. Acme Logistics"
                  required
                  className="mt-1 h-9 w-full rounded-md border border-line bg-white px-3 text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent/15"
                />
              </label>

              <label className="block">
                <span className="text-[11px] font-medium text-ink-soft">Workspace URL slug</span>
                <input
                  type="text"
                  value={newTenantSlug}
                  onChange={(e) => setNewTenantSlug(e.target.value)}
                  placeholder="e.g. acme-logistics"
                  required
                  className="mt-1 h-9 w-full rounded-md border border-line bg-white px-3 text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent/15"
                />
              </label>

              <label className="block">
                <span className="text-[11px] font-medium text-ink-soft">Plan</span>
                <select
                  value={newTenantPlan}
                  onChange={(e) => setNewTenantPlan(e.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-line bg-white px-3 text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent/15"
                >
                  <option value="Starter">Starter</option>
                  <option value="Pro">Pro</option>
                  <option value="Enterprise">Enterprise</option>
                </select>
              </label>

              {!isMockDataSource && (
                <>
                  <label className="block">
                    <span className="text-[11px] font-medium text-ink-soft">Initial admin email (optional)</span>
                    <input
                      type="email"
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      placeholder="admin@tenant.vn"
                      className="mt-1 h-9 w-full rounded-md border border-line bg-white px-3 text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent/15"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[11px] font-medium text-ink-soft">Initial admin password (min. 8 chars, optional)</span>
                    <input
                      type="password"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      minLength={8}
                      placeholder="Optional temporary password"
                      className="mt-1 h-9 w-full rounded-md border border-line bg-white px-3 text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent/15"
                    />
                  </label>
                </>
              )}

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  isLoading={creating}
                  disabled={!newTenantName.trim() || !newTenantSlug.trim()}
                  className="flex-1"
                >
                  {creating ? 'Provisioning…' : 'Create tenant'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation modal */}
      {confirmAction.tenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-faint/50">
          <div className="w-full max-w-sm rounded-lg border border-line bg-surface p-6 shadow-floating">
            <h3 className="text-[15px] font-semibold text-ink">
              {confirmAction.action === 'delete'
                ? 'Delete this tenant?'
                : confirmAction.action === 'reactivate'
                  ? 'Reactivate this tenant?'
                  : 'Suspend this tenant?'}
            </h3>
            <p className="mt-2 text-[12px] text-ink-soft">
              {confirmAction.action === 'delete'
                ? 'This will soft-delete the tenant account and revoke access.'
                : confirmAction.action === 'reactivate'
                  ? 'The tenant will be restored and regain access to the platform.'
                  : 'This will block all users of this tenant from logging in or using the APIs.'}
            </p>
            {confirmAction.action === 'suspend' ? (
              <div className="mt-4">
                <label className="block text-[11px] font-medium text-ink-soft">
                  Type <strong className="text-ink select-all">{confirmAction.tenant.name}</strong> to confirm
                </label>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => { setConfirmText(e.target.value); setConfirmError(''); }}
                  placeholder={confirmAction.tenant.name}
                  className="mt-1 h-9 w-full rounded-md border border-line bg-white px-3 text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent/15"
                  required
                />
                {confirmError && <p className="mt-2 text-[11px] text-danger">{confirmError}</p>}
              </div>
            ) : null}
            {confirmError && confirmAction.action !== 'suspend' ? (
              <p className="mt-2 text-[11px] text-danger">{confirmError}</p>
            ) : null}
            <div className="mt-6 flex gap-2">
              <Button
                variant="ghost"
                onClick={() => { setConfirmAction({}); setConfirmText(''); setConfirmError(''); }}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                variant={confirmAction.action === 'delete' ? 'danger' : 'secondary'}
                onClick={handleConfirmAction}
                isLoading={confirmLoading}
                disabled={confirmAction.action === 'suspend' && confirmText !== confirmAction.tenant.name}
                className="flex-1"
              >
                {confirmLoading
                  ? 'Confirming…'
                  : confirmAction.action === 'delete'
                    ? 'Delete'
                    : confirmAction.action === 'reactivate'
                      ? 'Reactivate'
                      : 'Suspend'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
