'use client';
import { TableState } from 'ui-components';
import { useState, useEffect } from 'react';
import {formatDate, formatTime} from '@/lib/date-utils';
import api from '@/lib/api';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';

type Adjustment = {
  id: string;
  inventoryId: string;
  warehouseId: string;
  quantityChange: number;
  reasonCode: string;
  createdAt: string;
  inventory: {
    product: { name: string; sku: string };
  };
  creator: {
    fullName: string;
  };
};

export default function InventoryAdjustmentsPage() {
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ inventoryId: '', qtyChange: '', reason: '' });
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  useEffect(() => {
    fetchAdjustments();
  }, [page]);

  const fetchAdjustments = async () => {
    setError('');
    try {
      const res = await api.get('/inventory/adjustments', { params: { page, limit } });
      setAdjustments((res.data?.data || res.data || []));
      setTotal(res.data?.meta?.total || 0);
    } catch (err) {
      console.error("Failed to fetch adjustments", err);
      setError('Failed to fetch adjustments');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await api.post('/inventory/adjust', {
        inventoryId: form.inventoryId,
        qtyChange: Number(form.qtyChange),
        reason: form.reason
      });
      setIsModalOpen(false);
      setForm({ inventoryId: '', qtyChange: '', reason: '' });
      fetchAdjustments();
    } catch (err) {
      console.error("Failed to create adjustment", err);
      setError('Failed to save adjustment. Ensure Inventory ID is correct.');
    } finally {
      setSaving(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="p-8 max-w-7xl mx-auto ">
      {error && <ErrorBanner message={error} onRetry={fetchAdjustments} />}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-10">
        <div>
          <h1 className="text-4xl font-bold text-ink tracking-tight">Stock Adjustments</h1>
          <p className="text-sm text-inkSoft mt-2 font-medium">Audit trail of manual inventory corrections.</p>
        </div>
        <Button variant="primary" size="md" onClick={() => setIsModalOpen(true)} className="gap-2 shadow-lg ">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4"/></svg>
          New Adjustment
        </Button>
      </div>

      <Card className="">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-border">
                <th className="px-8 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-widest">Date</th>
                <th className="px-8 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-widest">Product</th>
                <th className="px-8 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-widest">Change</th>
                <th className="px-8 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-widest">Reason & Actor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <TableState
          loading={loading}
          empty={!loading && adjustments.length === 0}
          error={error ? new Error(error) : undefined}
          onRetry={fetchAdjustments}
          colSpan={6}
          emptyContent={<tr>
                  <td colSpan={4} className="px-8 py-20 text-center text-slate-400 font-medium">No adjustment records found.</td>
                </tr>}
        >
          {adjustments.map(adj => (
                  <tr key={adj.id} className="hover:bg-slate-50/80 transition-all group">
                    <td className="px-8 py-6">
                      <div className="font-bold text-ink">{formatDate(adj.createdAt)}</div>
                      <div className="text-[10px] font-semibold text-slate-400 mt-1 uppercase">{formatTime(adj.createdAt)}</div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="font-bold text-ink leading-tight">{adj.inventory?.product?.name}</div>
                      <div className="text-[10px] font-mono font-bold text-primary mt-1">{adj.inventory?.product?.sku}</div>
                    </td>
                    <td className="px-8 py-6">
                       <Badge variant={adj.quantityChange > 0 ? 'success' : 'error'}>
                        {adj.quantityChange > 0 ? '+' : ''}{adj.quantityChange}
                      </Badge>
                    </td>
                    <td className="px-8 py-6">
                      <div className="text-sm font-semibold text-ink italic">"{adj.reasonCode}"</div>
                      <div className="text-[10px] font-bold text-slate-400 mt-1.5 uppercase flex items-center gap-2">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                        {adj.creator?.fullName}
                      </div>
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
            Page {page} of {totalPages} ({total} adjustments)
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

      {/* Adjustment Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40  animate-in fade-in duration-200">
           <Card className="w-full max-w-md bg-white border-slate-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
              <div className="p-8 border-b border-slate-100">
                <h2 className="text-2xl font-bold text-ink tracking-tight">Record Adjustment</h2>
                <p className="text-sm text-inkSoft mt-1 font-medium">Explicit inventory correction for auditing.</p>
              </div>

              <form onSubmit={handleCreateAdjustment} className="p-8">
                 <div className="space-y-5">
                    <Input label="Inventory ID" required value={form.inventoryId} onChange={e => setForm({...form, inventoryId: e.target.value})} placeholder="Paste Inventory UUID here" />
                    <Input label="Quantity Change (+/-)" type="number" required value={form.qtyChange} onChange={e => setForm({...form, qtyChange: e.target.value})} placeholder="e.g. -5" />
                    <div className="space-y-1.5">
                       <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest ml-1">Reason for Correction</label>
                       <textarea 
                        required
                        value={form.reason}
                        onChange={e => setForm({...form, reason: e.target.value})}
                        className="w-full bg-white  border border-slate-200 text-ink text-sm rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200 h-24 resize-none"
                        placeholder="Detail the reason for this manual override..."
                       ></textarea>
                    </div>
                 </div>

                 <div className="mt-10 flex gap-4">
                    <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)} className="flex-1 font-bold uppercase tracking-widest text-[10px]">
                      Cancel
                    </Button>
                    <Button type="submit" isLoading={saving} className="flex-1 font-bold uppercase tracking-widest text-[10px]">
                      {saving ? 'RECORDING...' : 'COMMIT ADJUSTMENT'}
                    </Button>
                 </div>
              </form>
           </Card>
        </div>
      )}
    </div>
  );
}

