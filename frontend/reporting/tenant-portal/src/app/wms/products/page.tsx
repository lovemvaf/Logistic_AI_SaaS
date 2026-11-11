'use client';
import { useState } from 'react';
import useSWR from 'swr';
import api from '@/lib/api';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Can } from '@/components/auth/Can';

const fetcher = (url: string) => api.get(url).then(res => res.data);

// Neutralizes CSV formula injection (CWE-1236) and escapes quotes/newlines.
function csvCell(value: unknown): string {
  const raw = String(value ?? '');
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[,"\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export default function ProductsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const limit = 15;

  const { data, isLoading, mutate } = useSWR(
    `/products?page=${page}&limit=${limit}&search=${search}`,
    fetcher
  );

  const products = data?.data || [];
  const meta = data?.meta || { total: 0, totalPages: 0 };

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState({ id: '', name: '', sku: '', barcode: '', weightKg: 0, volumeCbm: 0 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      if (form.id) {
        await api.patch(`/products/${form.id}`, form);
      } else {
        await api.post('/products', form);
      }
      setIsModalOpen(false);
      setForm({ id: '', name: '', sku: '', barcode: '', weightKg: 0, volumeCbm: 0 });
      mutate();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error saving product');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (p: any) => {
    setForm({
      id: p.id,
      name: p.name,
      sku: p.sku,
      barcode: p.barcode || '',
      weightKg: p.weightKg || 0,
      volumeCbm: p.volumeCbm || 0
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    setError('');
    try {
      await api.delete(`/products/${id}`);
      mutate();
    } catch (err) { console.error("Error deleting product", err); setError('Failed to delete product'); }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto ">
      {error && <ErrorBanner message={error} onRetry={() => mutate()} />}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-10">
        <div>
          <h1 className="text-4xl font-bold text-ink tracking-tight">
            Product Catalog
          </h1>
          <p className="text-sm text-inkSoft mt-2 font-medium">Manage your organization's SKU master list and specifications.</p>
        </div>
        <Can perform="inventory:adjust">
          <Button variant="primary" onClick={() => {
            setForm({ id: '', name: '', sku: '', barcode: '', weightKg: 0, volumeCbm: 0 });
            setIsModalOpen(true);
          }} className="gap-2 shadow-lg ">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4"/></svg>
            Add New Product
          </Button>
        </Can>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-8">
        <div className="relative w-full max-w-md group">
          <Input 
            placeholder="Search by SKU, Barcode or Name..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            icon={<svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>}
          />
        </div>
        <div className="flex items-center gap-2">
           <Button variant="outline" size="sm" className="font-bold tracking-widest text-[10px]" onClick={() => {
             const headers = ['SKU', 'Name', 'Weight', 'Volume'];
             const rows = products.map((p: any) => [
               csvCell(p.sku),
               csvCell(p.name),
               csvCell(p.weightKg ?? 0),
               csvCell(p.volumeCbm ?? 0),
             ]);
             const csvContent = [headers.map(csvCell).join(','), ...rows.map((r: string[]) => r.join(','))].join('\n');
             const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
             const url = URL.createObjectURL(blob);
             const link = document.createElement('a');
             link.setAttribute('href', url);
             link.setAttribute('download', 'products_export.csv');
             document.body.appendChild(link);
             link.click();
             document.body.removeChild(link);
             URL.revokeObjectURL(url);
           }}>EXPORT CSV</Button>
           <Button variant="outline" size="sm" className="font-bold tracking-widest text-[10px]" onClick={() => {
             const input = document.createElement('input');
             input.type = 'file';
             input.accept = '.xlsx,.xls,.csv';
             input.onchange = async (e: any) => {
               const file = e.target.files[0];
               if (!file) return;
               const formData = new FormData();
               formData.append('file', file);
               try {
                 await api.post('/products/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
                 console.log('Import successful!');
                  mutate();
                } catch (err) {
                  console.error('Import failed', err);
                  setError('Import failed. Check file format.');
                }
             };
             input.click();
           }}>IMPORT EXCEL</Button>
        </div>
      </div>

      <Card className="">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-border">
                <th className="px-8 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-widest">SKU Identity</th>
                <th className="px-8 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-widest">Product Details</th>
                <th className="px-8 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-widest">Spec (W/V)</th>
                <th className="px-8 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-widest">Status</th>
                <th className="px-8 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-8 py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Retrieving Product Master...</span>
                    </div>
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-8 py-20 text-center text-slate-400 font-bold uppercase tracking-widest text-xs">No products found in the catalog.</td>
                </tr>
              ) : (
                products.map((p: any) => (
                  <tr key={p.id} className="hover:bg-slate-50/80 transition-all group">
                    <td className="px-8 py-6">
                      <div className="font-bold text-primary font-mono tracking-tight">{p.sku}</div>
                      <div className="text-[10px] text-slate-400 mt-1 font-bold uppercase tracking-wider">{p.barcode || 'NO BARCODE'}</div>
                    </td>
                    <td className="px-8 py-6 font-bold text-ink leading-tight">
                      {p.name}
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex flex-col gap-1">
                        <div className="text-[11px] font-bold text-inkSoft uppercase tracking-widest">{p.weightKg || '0.00'} <span className="text-slate-400">KG</span></div>
                        <div className="text-[11px] font-bold text-inkSoft uppercase tracking-widest">{p.volumeCbm || '0.00'} <span className="text-slate-400">CBM</span></div>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                       <Badge variant="success">ACTIVE</Badge>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <Can perform="inventory:adjust">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" className="p-2 h-9 w-9 rounded-xl text-slate-400 hover:text-primary" onClick={() => handleEdit(p)}>
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(p.id)} className="p-2 h-9 w-9 rounded-xl text-slate-400 hover:text-ember">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </Button>
                        </div>
                      </Can>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!isLoading && meta.totalPages > 1 && (
          <div className="p-6 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4">
             <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
              Page <span className="text-ink">{page}</span> of <span className="text-ink">{meta.totalPages}</span>
            </span>
            <div className="flex gap-2">
              <Button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                variant="outline"
                size="sm"
                className="font-bold tracking-widest text-[10px]"
              >
                PREVIOUS
              </Button>
              <Button
                onClick={() => setPage(p => Math.min(meta.totalPages, p + 1))}
                disabled={page === meta.totalPages}
                variant="outline"
                size="sm"
                className="font-bold tracking-widest text-[10px]"
              >
                NEXT
              </Button>
            </div>
          </div>
        )}
      </Card>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 ">
          <Card className="w-full max-w-md bg-white p-6">
            <h2 className="text-xl font-bold mb-4">{form.id ? 'Edit Product' : 'Add New Product'}</h2>
            <form onSubmit={handleSave} className="space-y-4">
              {error && <div className="p-3 bg-red-50 text-red-600 text-sm rounded border border-red-100">{error}</div>}
              <div>
                <label className="block text-xs font-bold mb-1">Product Name</label>
                <Input required value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="e.g. Standard Pallet" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold mb-1">SKU</label>
                  <Input required value={form.sku} onChange={e => setForm({...form, sku: e.target.value})} placeholder="e.g. PLT-01" />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">Barcode (Opt)</label>
                  <Input value={form.barcode} onChange={e => setForm({...form, barcode: e.target.value})} placeholder="e.g. 123456789" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold mb-1">Weight (KG)</label>
                  <Input type="number" step="0.01" value={form.weightKg} onChange={e => setForm({...form, weightKg: parseFloat(e.target.value)})} min={0} />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">Volume (CBM)</label>
                  <Input type="number" step="0.01" value={form.volumeCbm} onChange={e => setForm({...form, volumeCbm: parseFloat(e.target.value)})} min={0} />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={saving}>Save Product</Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}

