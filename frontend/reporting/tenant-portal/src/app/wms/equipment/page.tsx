'use client';
import { useState, useEffect } from 'react';
import {formatDateTime} from '@/lib/date-utils';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import api from '@/lib/api';

type Checkout = {
  id: string;
  equipmentCode: string;
  staffName: string;
  checkedOutAt: string;
  status: string;
};

export default function EquipmentCheckoutPage() {
  const [logs, setLogs] = useState<Checkout[]>([]);
  const [loading, setLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState({ equipmentCode: '', staffName: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  const fetchLogs = async () => {
    setError('');
    try {
      const response = await api.get('/inventory/ops/equipment/logs', { params: { page, limit } });
      setLogs(response.data?.data || response.data || []);
      setTotal(response.data?.meta?.total || 0);
    } catch (err: any) {
      console.error('Failed to fetch equipment logs', err);
      setError('Failed to fetch equipment logs');
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await api.post('/inventory/ops/equipment/checkout', form);
      setIsModalOpen(false);
      setForm({ equipmentCode: '', staffName: '' });
      fetchLogs();
    } catch (err) {
      console.error("Error processing checkout", err);
      setError('Failed to process checkout');
    } finally {
      setSaving(false);
    }
  };

  const handleReturn = async (id: string) => {
    setError('');
    try {
      await api.patch(`/inventory/ops/equipment/${id}/return`);
      fetchLogs();
    } catch (err) {
      console.error("Error returning equipment", err);
      setError('Failed to return equipment');
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto ">
      {error && <ErrorBanner message={error} onRetry={fetchLogs} />}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-10">
        <div>
          <h1 className="text-4xl font-bold text-ink tracking-tight">Equipment Registry</h1>
          <p className="text-sm text-inkSoft mt-2 font-medium">Track asset custody for mobile scanners, PDAs, and printers.</p>
        </div>
        <Button variant="primary" className="gap-2 shadow-lg " onClick={() => setIsModalOpen(true)}>
          New Checkout
        </Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-border">
                <th className="px-8 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-widest">Asset Code</th>
                <th className="px-8 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-widest">Current Custodian</th>
                <th className="px-8 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-widest">Timestamp</th>
                <th className="px-8 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-widest">Custody Status</th>
                <th className="px-8 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={5} className="px-8 py-10 text-center font-bold uppercase text-[10px] text-slate-400">Loading Registry...</td></tr>
              ) : logs.map(l => (
                <tr key={l.id} className="hover:bg-slate-50/80 transition-all">
                  <td className="px-8 py-6 font-bold text-primary font-mono">{l.equipmentCode}</td>
                  <td className="px-8 py-6 font-bold text-ink">{l.staffName}</td>
                  <td className="px-8 py-6 text-xs text-inkSoft font-medium">{formatDateTime(l.checkedOutAt)}</td>
                  <td className="px-8 py-6">
                    <Badge variant={l.status === 'OUT' ? 'warning' : 'success'}>{l.status}</Badge>
                  </td>
                  <td className="px-8 py-6 text-right">
                    {l.status === 'OUT' && <Button variant="ghost" size="sm" className="font-bold text-primary tracking-widest text-[10px]" onClick={() => handleReturn(l.id)}>MARK RETURNED</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 ">
          <Card className="w-full max-w-md bg-white p-6">
            <h2 className="text-xl font-bold mb-4">Equipment Checkout</h2>
            <form onSubmit={handleCheckout} className="space-y-4">
              <div>
                <label className="block text-xs font-bold mb-1">Equipment Code</label>
                <Input required value={form.equipmentCode} onChange={e => setForm({...form, equipmentCode: e.target.value})} placeholder="e.g. SCN-01" />
              </div>
              <div>
                <label className="block text-xs font-bold mb-1">Staff Name</label>
                <Input required value={form.staffName} onChange={e => setForm({...form, staffName: e.target.value})} placeholder="e.g. John Doe" />
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={saving}>Confirm Checkout</Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {!loading && total > limit && (
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-slate-100">
          <span className="text-sm text-slate-500">
            Page {page} of {totalPages} ({total} equipment)
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
    </div>
  );
}

