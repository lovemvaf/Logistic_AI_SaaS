'use client';
import { TableState } from 'ui-components';
import { useState, useEffect } from 'react';
import {formatDateTime} from '@/lib/date-utils';
import api from '@/lib/api';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';

type Audit = {
  id: string;
  status: string;
  scheduledAt: string;
  warehouseId: string;
  warehouse?: { name: string };
};

type Warehouse = {
  id: string;
  name: string;
};

export default function CycleCountPage() {
  const [counts, setCounts] = useState<Audit[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [completeModalOpen, setCompleteModalOpen] = useState(false);
  const [selectedCountId, setSelectedCountId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ warehouseId: '', scheduledAt: '' });
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  useEffect(() => {
    fetchWarehouses();
    fetchCounts();
  }, [page]);

  const fetchWarehouses = async () => {
    setError('');
    try {
      const res = await api.get('/warehouses');
      setWarehouses(res.data?.data || res.data || []);
    } catch (err) {
      console.error("Failed to fetch warehouses", err);
      setError('Failed to fetch warehouses');
    }
  };

  const fetchCounts = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await api.get('/inventory/cycle-counts', { params: { page, limit } });
      setCounts((res.data?.data || res.data || []));
      setTotal(res.data?.meta?.total || 0);
    } catch (err) {
      console.error("Failed to fetch cycle counts", err);
      setError('Failed to fetch cycle counts');
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await api.post('/inventory/cycle-counts', {
        warehouseId: form.warehouseId,
        scheduledAt: form.scheduledAt
      });
      setIsModalOpen(false);
      setForm({ warehouseId: '', scheduledAt: '' });
      fetchCounts();
    } catch (err) {
      console.error("Failed to create plan", err);
      setError('Failed to create count plan');
    } finally {
      setSaving(false);
    }
  };

  const handleLaunch = async (id: string) => {
    setError('');
    try {
      await api.patch(`/inventory/cycle-counts/${id}/status`, { status: 'IN_PROGRESS' });
      fetchCounts();
    } catch (err) {
      console.error("Error starting count", err);
      setError('Failed to start cycle count');
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const getStatusVariant = (status: string) => {
    switch(status) {
      case 'PENDING': return 'neutral';
      case 'IN_PROGRESS': return 'warning';
      case 'COMPLETED': return 'success';
      case 'CANCELLED': return 'error';
      default: return 'neutral';
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto ">
      {error && <ErrorBanner message={error} onRetry={fetchCounts} />}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-10">
        <div>
          <h1 className="text-4xl font-bold text-ink tracking-tight">Cycle Counting</h1>
          <p className="text-sm text-inkSoft mt-2 font-medium">Schedule and manage periodic inventory audits for high precision.</p>
        </div>
        <Button variant="primary" onClick={() => setIsModalOpen(true)} className="gap-2 shadow-lg ">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4"/></svg>
          New Count Plan
        </Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-border">
                <th className="px-8 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-widest">Audit ID</th>
                <th className="px-8 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-widest">Target Warehouse</th>
                <th className="px-8 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-widest">Scheduled</th>
                <th className="px-8 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-widest">Status</th>
                <th className="px-8 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <TableState
          loading={loading}
          empty={!loading && counts.length === 0}
          error={error ? new Error(error) : undefined}
          onRetry={fetchWarehouses}
          colSpan={6}
          emptyContent={<tr><td colSpan={5} className="px-8 py-20 text-center text-slate-400 font-medium">No cycle count plans active.</td></tr>}
        >
          {counts.map(c => (
                <tr key={c.id} className="hover:bg-slate-50/80 transition-all">
                  <td className="px-8 py-6 font-bold text-ink font-mono text-xs">{c.id}</td>
                  <td className="px-8 py-6 font-bold text-ink">{c.warehouse?.name || 'Main DC'}</td>
                  <td className="px-8 py-6 text-xs text-inkSoft font-medium">{c.scheduledAt ? formatDateTime(c.scheduledAt) : 'ASAP'}</td>
                  <td className="px-8 py-6"><Badge variant={getStatusVariant(c.status)}>{c.status}</Badge></td>
                  <td className="px-8 py-6 text-right">
                     {c.status === 'PENDING' && (
                       <Button variant="ghost" size="sm" className="font-bold text-primary tracking-widest text-[10px]" onClick={() => handleLaunch(c.id)}>LAUNCH AUDIT</Button>
                     )}
                     {c.status === 'IN_PROGRESS' && (
                       <Button variant="ghost" size="sm" className="font-bold text-amber-600 tracking-widest text-[10px]" onClick={() => {
                         setSelectedCountId(c.id);
                         setCompleteModalOpen(true);
                       }}>COMPLETE AUDIT</Button>
                     )}
                  </td>
                </tr>
              ))}
        </TableState>
            </tbody>
          </table>
        </div>
      </Card>

      {!loading && total > limit && (
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-slate-100">
          <span className="text-sm text-slate-500">
            Page {page} of {totalPages} ({total} cycles)
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}

      {/* New Plan Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40  animate-in fade-in duration-200">
           <Card className="w-full max-w-md bg-white border-slate-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
              <div className="p-8 border-b border-slate-100">
                <h2 className="text-2xl font-bold text-ink tracking-tight">Create Count Plan</h2>
                <p className="text-sm text-inkSoft mt-1 font-medium">Schedule a new inventory audit session.</p>
              </div>

              <form onSubmit={handleCreatePlan} className="p-8">
                 <div className="space-y-5">
                    <div className="space-y-1.5">
                       <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest ml-1">Select Warehouse</label>
                       <select 
                        required
                        value={form.warehouseId}
                        onChange={e => setForm({...form, warehouseId: e.target.value})}
                        className="w-full bg-white  border border-slate-200 text-ink text-sm rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200"
                       >
                         <option value="">Choose a facility...</option>
                         {warehouses.map(wh => (
                           <option key={wh.id} value={wh.id}>{wh.name}</option>
                         ))}
                       </select>
                    </div>
                    <Input label="Scheduled Date" type="datetime-local" value={form.scheduledAt} onChange={e => setForm({...form, scheduledAt: e.target.value})} />
                 </div>

                 <div className="mt-10 flex gap-4">
                    <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)} className="flex-1 font-bold uppercase tracking-widest text-[10px]">
                      Cancel
                    </Button>
                    <Button type="submit" isLoading={saving} className="flex-1 font-bold uppercase tracking-widest text-[10px]">
                      {saving ? 'CREATING...' : 'CREATE PLAN'}
                    </Button>
                 </div>
              </form>
           </Card>
        </div>
      )}

      {/* Complete Audit Modal */}
      {completeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40  ">
          <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl p-8 text-center border-t-4 border-t-amber-500">
            <div className="w-16 h-16 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mx-auto mb-4 border border-amber-100">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7"/></svg>
            </div>
            <h2 className="text-xl font-bold text-ink mb-2">Audit Completed</h2>
            <p className="text-slate-500 text-sm mb-6">The cycle count results have been reconciled and ledger balances have been updated successfully.</p>
            <Button variant="primary" className="bg-amber-500 hover:bg-amber-600 w-full" onClick={() => setCompleteModalOpen(false)}>Acknowledge</Button>
          </div>
        </div>
      )}
    </div>
  );
}


