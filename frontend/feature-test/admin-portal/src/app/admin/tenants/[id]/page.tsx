'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button, Modal, TableState } from 'ui-components';
import { EditorialPageHeader, EditorialSection, StatusLabel } from 'ui-kit';
import { formatCurrency, formatDate, formatNumber } from '@/lib/format';
import api from '@/lib/api';
import { Tenant, getOne, initStore, isMockDataSource, update } from '@/lib/local-store';

function getPlanLabel(plan: Tenant['plan']): string {
  if (!plan) return '—';
  return typeof plan === 'string' ? plan : plan.name ?? '—';
}

export default function TenantDetailPage() {
  const { id } = useParams<{ id: string }>() as { id: string };
  const router = useRouter();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');

  // Modal state
  const [isSuspendModalOpen, setIsSuspendModalOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [suspending, setSuspending] = useState(false);
  const [suspendError, setSuspendError] = useState<string | null>(null);

  useEffect(() => {
    void fetchTenantDetails();
  }, [id]);

  const fetchTenantDetails = async () => {
    setLoading(true);
    setError(null);
    try {
      if (isMockDataSource) {
        initStore();
        const cached = getOne('tenants', id) as Tenant | null;
        setTenant(cached || null);
      } else {
        const res = await api.get(`/admin/tenants/${id}`);
        setTenant(res.data || null);
      }
    } catch (err: any) {
      setTenant(null);
      setError(err?.response?.data?.message || err?.message || 'Failed to load tenant details');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (skipConfirm: boolean = false) => {
    if (!tenant) return;
    if (!skipConfirm && tenant.status === 'ACTIVE' && confirmText !== tenant.name) {
      setSuspendError('Confirmation text does not match tenant name.');
      return;
    }
    const nextStatus = tenant.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    setSuspending(true);
    setSuspendError(null);
    try {
      if (isMockDataSource) {
        const record = update('tenants', tenant.id, { status: nextStatus }) as Tenant | null;
        if (record) setTenant(record);
      } else {
        await api.patch(`/admin/tenants/${tenant.id}`, { status: nextStatus });
        setTenant((prev) => (prev ? { ...prev, status: nextStatus } : prev));
      }
      setIsSuspendModalOpen(false);
      setConfirmText('');
    } catch (err: any) {
      setSuspendError(err?.response?.data?.message || 'Failed to update tenant status via API.');
    } finally {
      setSuspending(false);
    }
  };

  const cancelSuspend = () => {
    setIsSuspendModalOpen(false);
    setConfirmText('');
    setSuspendError(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-[12px] text-ink-faint">Loading tenant profile…</p>
      </div>
    );
  }

  if (error && !tenant) {
    return (
      <EditorialSection eyebrow="Error" title="Could not load tenant">
        <div className="rounded-lg border border-danger/40 bg-danger/5 px-4 py-3 text-[12px] text-danger">
          {error}
        </div>
        <div className="mt-4 flex gap-2">
          <Button variant="primary" size="sm" onClick={() => void fetchTenantDetails()} className="h-9">
            Retry
          </Button>
          <Button variant="outline" size="sm" onClick={() => router.push('/admin/tenants')} className="h-9">
            Back to tenants
          </Button>
        </div>
      </EditorialSection>
    );
  }

  if (!tenant) {
    return (
      <EditorialSection eyebrow="Error" title="Tenant not found">
        <div className="rounded-lg border border-line bg-surface-alt px-4 py-3 text-[12px] text-ink-soft">
          No tenant with this identifier.
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push('/admin/tenants')}
          className="mt-4 h-9"
        >
          Back to tenants
        </Button>
      </EditorialSection>
    );
  }

  const statusTone = (status: string): 'success' | 'danger' | 'warning' | 'neutral' => {
    switch (status) {
      case 'ACTIVE':
        return 'success';
      case 'SUSPENDED':
        return 'danger';
      case 'PENDING':
        return 'warning';
      default:
        return 'neutral';
    }
  };

  const planName = getPlanLabel(tenant.plan);
  const usersCount = Number(tenant.usersCount ?? 0);

  return (
    <div>
      <EditorialPageHeader
        eyebrow="Administration"
        title={tenant.name}
        description={tenant.domain ? `${tenant.id} • ${tenant.domain}` : `${tenant.id} • ${tenant.slug}@smartlogi.vn`}
        meta={
          <div className="flex items-center gap-3">
            <StatusLabel tone={statusTone(tenant.status ?? 'SUSPENDED')}>{tenant.status ?? '—'}</StatusLabel>
            <StatusLabel tone={planName === 'Enterprise' ? 'info' : 'success'}>{planName}</StatusLabel>
          </div>
        }
        actions={
          <div className="flex gap-2">
            {tenant.status === 'ACTIVE' ? (
              <Button variant="secondary" size="sm" onClick={() => setIsSuspendModalOpen(true)}>
                Suspend account
              </Button>
            ) : (
              <Button variant="primary" size="sm" onClick={() => void handleStatusChange(true)} disabled={suspending}>
                Reactivate
              </Button>
            )}
          </div>
        }
      />

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-line pb-0">
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={`h-10 px-3 text-[12px] font-medium border-b-2 transition-colors ${
            activeTab === 'overview'
              ? 'border-accent text-accent'
              : 'border-transparent text-ink-soft hover:text-ink hover:bg-surface-alt'
          }`}
        >
          Overview
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('users')}
          className={`h-10 px-3 text-[12px] font-medium border-b-2 transition-colors ${
            activeTab === 'users'
              ? 'border-accent text-accent'
              : 'border-transparent text-ink-soft hover:text-ink hover:bg-surface-alt'
          }`}
        >
          Users ({usersCount})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('billing')}
          className={`h-10 px-3 text-[12px] font-medium border-b-2 transition-colors ${
            activeTab === 'billing'
              ? 'border-accent text-accent'
              : 'border-transparent text-ink-soft hover:text-ink hover:bg-surface-alt'
          }`}
        >
          Billing
        </button>
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && (
        <EditorialSection eyebrow="Overview" title="Account details">
          <div className="grid gap-6 sm:grid-cols-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Current plan</p>
              <p className="mt-1 text-[13px] font-semibold text-ink">{planName}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Monthly orders</p>
              <p className="mt-1 text-[13px] font-semibold text-ink">{tenant.ordersMonthly ? formatNumber(tenant.ordersMonthly) : '—'}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Registered</p>
              <p className="mt-1 text-[13px] font-semibold text-ink">{tenant.createdAt ? formatDate(tenant.createdAt) : '—'}</p>
            </div>
          </div>
        </EditorialSection>
      )}

      {activeTab === 'users' && (
        <EditorialSection eyebrow="Users" title="Tenant users">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">Users of this tenant</caption>
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className="h-8 pr-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Name</th>
                  <th scope="col" className="h-8 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Email</th>
                  <th scope="col" className="h-8 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Role</th>
                  <th scope="col" className="h-8 pl-3 text-right text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Actions</th>
                </tr>
              </thead>
              <tbody>
                <TableState
                  loading={loading}
                  empty
                  colSpan={4}
                  emptyTitle="No users found"
                  emptyDescription="Users invited to this tenant will appear here."
                />
              </tbody>
            </table>
          </div>
        </EditorialSection>
      )}

      {activeTab === 'billing' && (
        <EditorialSection eyebrow="Billing" title="Invoice history">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">Invoices of this tenant</caption>
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className="h-8 pr-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Invoice</th>
                  <th scope="col" className="h-8 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Amount</th>
                  <th scope="col" className="h-8 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Status</th>
                  <th scope="col" className="h-8 pl-3 text-right text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Date</th>
                </tr>
              </thead>
              <tbody>
                <TableState
                  loading={loading}
                  empty
                  colSpan={4}
                  emptyTitle="No invoices found"
                  emptyDescription="Invoices for this tenant will appear here."
                />
              </tbody>
            </table>
          </div>
        </EditorialSection>
      )}

      {/* Suspend confirmation modal */}
      <Modal
        isOpen={isSuspendModalOpen}
        onClose={cancelSuspend}
        title={tenant.status === 'ACTIVE' ? 'Suspend this tenant?' : 'Reactivate this tenant?'}
        footer={
          <div className="flex gap-2">
            <Button variant="ghost" onClick={cancelSuspend}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => void handleStatusChange(false)}
              disabled={suspending || confirmText !== tenant.name}
              isLoading={suspending}
            >
              {suspending ? 'Suspending…' : tenant.status === 'ACTIVE' ? 'Yes, suspend account' : 'Yes, reactivate account'}
            </Button>
          </div>
        }
      >
        <input
          type="text"
          value={confirmText}
          onChange={(e) => { setConfirmText(e.target.value); setSuspendError(null); }}
          placeholder="Type the tenant name to confirm"
          className="h-9 w-full rounded-md border border-line bg-white px-3 text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent/15"
          required
        />
        {suspendError && <p className="mt-2 text-[11px] text-danger">{suspendError}</p>}
      </Modal>
    </div>
  );
}
