'use client';
import { TableState } from 'ui-components';
import { useState, useEffect, useRef } from 'react';
import {formatDate, formatTime} from '@/lib/date-utils';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import api from '@/lib/api';
import { ErrorBanner } from '@/components/ui/ErrorBanner';

type StockMovement = {
  id: string;
  inventoryId: string;
  warehouseId: string;
  transactionType: string;
  quantity: number;
  referenceId: string;
  createdAt: string;
  inventory?: {
    product: { name: string; sku: string };
    bin?: { barcode: string };
  };
  warehouse?: { name: string };
};

// Neutralizes CSV formula injection (CWE-1236) and escapes quotes/newlines.
function csvCell(value: unknown): string {
  const raw = String(value ?? '');
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[,"\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export default function InventoryLedgerPage() {
  const { user, token } = useAuth();
  const [view, setView] = useState<'ledger' | 'balance'>('ledger');
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;
  
  // Adjustment Modal State
  const [isAdjModalOpen, setIsAdjModalOpen] = useState(false);
  const [adjForm, setAdjForm] = useState({ sku: '', qty: '', reason: '' });
  const [savingAdj, setSavingAdj] = useState(false);

  // BƯỚC 2: Receive (Nhập Kho) Modal State
  const [isReceiveModalOpen, setIsReceiveModalOpen] = useState(false);
  const [receiveForm, setReceiveForm] = useState({ sku: '', qty: '', bin: '' });
  const [savingReceive, setSavingReceive] = useState(false);

  // BƯỚC 2: Transfer (Chuyển Vị Trí) Modal State
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferForm, setTransferForm] = useState({ barcode: '', sourceBin: '', destBin: '', qty: '' });
  const [savingTransfer, setSavingTransfer] = useState(false);
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchMovements();
  }, [token, page]);

  // Focus barcode input automatically when Transfer Modal opens
  useEffect(() => {
    if (isTransferModalOpen && barcodeInputRef.current) {
      setTimeout(() => barcodeInputRef.current?.focus(), 100);
    }
  }, [isTransferModalOpen]);

  const fetchMovements = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await api.get('/inventory/ledger', { params: { page, limit } });
      const data = res.data;
      setMovements(Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []));
      setTotal(res.data?.meta?.total || 0);
      setLoading(false);
      } catch (err) {
        console.error('Failed to fetch inventory movements:', err);
        setError('Failed to load inventory movements');
        setMovements([]);
        setLoading(false);
      }
  };

  const handleAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjForm.sku || !adjForm.qty) return;
    setSavingAdj(true);
    try {
      await api.post('/inventory/adjust', {
        sku: adjForm.sku,
        qtyChange: Number(adjForm.qty),
        reason: adjForm.reason || 'manual adjustment',
      });
      setIsAdjModalOpen(false);
      setAdjForm({ sku: '', qty: '', reason: '' });
      fetchMovements();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Adjustment failed');
    } finally {
      setSavingAdj(false);
    }
  };

  // BƯỚC 3: Xử lý Nhập Kho (Receive Logic)
  const handleReceive = async (e: React.FormEvent) => {
    e.preventDefault();
    if (Number(receiveForm.qty) <= 0) {
      window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: "Quantity must be greater than 0", type: 'warning' } }));
      return;
    }
    setSavingReceive(true);
    try {
       await api.post('/inventory/receive', {
         sku: receiveForm.sku,
         quantity: Number(receiveForm.qty),
         binBarcode: receiveForm.bin
       });
       setIsReceiveModalOpen(false);
       setReceiveForm({ sku: '', qty: '', bin: '' });
       fetchMovements();
    } catch (err: any) {
       window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: 'Receive Error: ' + (err.response?.data?.message || err.message), type: 'error' } }));
    } finally {
       setSavingReceive(false);
    }
  };

  // BƯỚC 3: Xử lý Chuyển Vị Trí (Transfer Logic)
  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (Number(transferForm.qty) <= 0) {
      window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: "Transfer quantity must be greater than 0", type: 'warning' } }));
      return;
    }
    if (transferForm.sourceBin === transferForm.destBin) {
      window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: "Source and Destination bins cannot be the same", type: 'warning' } }));
      return;
    }

    setSavingTransfer(true);
    try {
       await api.post('/inventory/transfer', {
         barcode: transferForm.barcode,
         sourceBin: transferForm.sourceBin,
         destBin: transferForm.destBin,
         quantity: Number(transferForm.qty)
       });
       setIsTransferModalOpen(false);
       setTransferForm({ barcode: '', sourceBin: '', destBin: '', qty: '' });
       fetchMovements();
    } catch (err: any) {
       const errorMessage = err.response?.data?.message || err.message;
       if (errorMessage.toLowerCase().includes("version mismatch") || errorMessage.toLowerCase().includes("conflict")) {
         window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: "Data conflict: Inventory was recently modified. Refreshing...", type: 'warning' } }));
         fetchMovements();
       } else {
         window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: 'Transfer Error: ' + errorMessage, type: 'error' } }));
       }
    } finally {
       setSavingTransfer(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const getTransactionVariant = (type: string) => {
    switch(type) {
      case 'INBOUND': return 'success';
      case 'OUTBOUND': return 'info';
      case 'ADJUSTMENT': return 'warning';
      case 'TRANSFER': return 'neutral';
      default: return 'neutral';
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto ">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-10">
        <div>
          <h1 className="text-4xl font-bold text-ink tracking-tight">
            Inventory Ops
          </h1>
          <p className="text-sm text-inkSoft mt-2 font-medium">Monitor stock movements, receive items, and execute transfers.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" size="md" onClick={() => setIsAdjModalOpen(true)} className="gap-2 border-slate-200">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"/></svg>
            Stock Adjust
          </Button>
          <Button variant="outline" size="md" onClick={() => setIsTransferModalOpen(true)} className="gap-2 border-indigo-200 text-indigo-700 hover:bg-indigo-50">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/></svg>
            Transfer Bin
          </Button>
          <Button variant="primary" size="md" onClick={() => setIsReceiveModalOpen(true)} className="gap-2 shadow-lg ">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4"/></svg>
            Receive Inbound
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-8 bg-slate-100 p-1.5 rounded-2xl w-fit">
        <button 
          onClick={() => setView('ledger')}
          className={`px-6 py-2 rounded-xl text-[11px] font-bold tracking-widest uppercase transition-all ${view === 'ledger' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-ink'}`}
        >
          Transaction Ledger
        </button>
        <button 
          onClick={() => setView('balance')}
          className={`px-6 py-2 rounded-xl text-[11px] font-bold tracking-widest uppercase transition-all ${view === 'balance' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-ink'}`}
        >
          Real-time Balance
        </button>
      </div>

      <Card className="">
        {view !== 'ledger' && error && (
          <ErrorBanner message={error} retryLabel="Đóng" onRetry={() => setError('')} />
        )}
        {view === 'ledger' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 border-b border-border">
                  <th className="px-8 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-widest">Timestamp</th>
                  <th className="px-8 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-widest">Type & Ref</th>
                  <th className="px-8 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-widest">Product & Location</th>
                  <th className="px-8 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-widest text-right">Quantity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <TableState
          loading={loading}
          empty={!loading && movements.length === 0}
          error={error ? new Error(error) : undefined}
          onRetry={fetchMovements}
          colSpan={6}
          emptyContent={<tr>
                    <td colSpan={4} className="px-8 py-20 text-center text-slate-400 font-bold uppercase tracking-widest text-xs">No movements found.</td>
                  </tr>}
        >
          {movements.map(mov => (
                    <tr key={mov.id} className="hover:bg-slate-50/80 transition-all group">
                      <td className="px-8 py-6">
                        <div className="font-bold text-ink">{formatDate(mov.createdAt)}</div>
                        <div className="text-[10px] font-semibold text-slate-400 mt-1">{formatTime(mov.createdAt)}</div>
                      </td>
                      <td className="px-8 py-6">
                        <Badge variant={getTransactionVariant(mov.transactionType)} className="mb-1.5">
                          {mov.transactionType}
                        </Badge>
                        <div className="text-[10px] font-mono font-bold text-slate-400 uppercase">{mov.referenceId}</div>
                      </td>
                      <td className="px-8 py-6">
                        <div className="font-bold text-ink leading-tight">{mov.inventory?.product?.name}</div>
                        <div className="text-[10px] font-bold text-slate-400 mt-1 flex items-center gap-2">
                           <span className="text-primary font-mono">{mov.inventory?.product?.sku}</span>
                           <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                           <span>BIN: {mov.inventory?.bin?.barcode || 'UNASSIGNED'}</span>
                        </div>
                      </td>
                      <td className="px-8 py-6 text-right">
                        <span className={`text-sm font-bold ${mov.quantity > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                          {mov.quantity > 0 ? '+' : ''}{mov.quantity}
                        </span>
                      </td>
                    </tr>
                  ))}
        </TableState>
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-20 text-center">
            <div className="w-16 h-16 bg-slate-50 rounded-3xl flex items-center justify-center mx-auto mb-4 text-slate-300">
               <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
            </div>
            <p className="font-bold text-ink">Inventory Balance Report</p>
            <p className="text-sm text-inkSoft mt-1">Aggregating live stock levels across all facility bins.</p>
            <Button variant="outline" size="sm" className="mt-6 font-bold tracking-widest text-[10px]" onClick={async () => {
              try {
                setError('');
                const res = await api.get('/inventory/ledger?page=1&limit=1000');
                const data = res.data?.data || [];
                if (data.length === 0) {
                  setError('No data to export');
                  return;
                }

                // Construct CSV with CWE-1236 formula-injection sanitization
                const headers = ['Transaction ID', 'Type', 'SKU', 'Product Name', 'Bin Barcode', 'Quantity Change', 'Timestamp'];
                const rows = data.map((mov: any) => [
                  csvCell(mov.id),
                  csvCell(mov.transactionType),
                  csvCell(mov.inventory?.product?.sku || ''),
                  csvCell(mov.inventory?.product?.name || ''),
                  csvCell(mov.inventory?.bin?.barcode || ''),
                  csvCell(mov.quantityChange ?? mov.quantity ?? 0),
                  csvCell(mov.createdAt)
                ]);

                const csvContent = [headers.map(csvCell).join(','), ...rows.map((r: string[]) => r.join(','))].join('\n');
                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.setAttribute('href', url);
                link.setAttribute('download', `inventory_snapshot_${new Date().toISOString().split('T')[0]}.csv`);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
              } catch (err) {
                console.error('Failed to export snapshot', err);
                setError('Failed to export snapshot');
              }
            }}>EXPORT TO CSV</Button>
          </div>
        )}
      </Card>

      {!loading && total > limit && (
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-slate-100">
          <span className="text-sm text-slate-500">
            Page {page} of {totalPages} ({total} items)
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
      {isAdjModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40  animate-in fade-in duration-200">
           <Card className="w-full max-w-md bg-white border-slate-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
              <div className="p-8 border-b border-slate-100">
                <h2 className="text-2xl font-bold text-ink tracking-tight">Stock Adjustment</h2>
                <p className="text-sm text-inkSoft mt-1 font-medium">Manually correct inventory levels.</p>
              </div>

              <form onSubmit={handleAdjustment} className="p-8">
                 <div className="space-y-5">
                    <Input label="Target SKU" required value={adjForm.sku} onChange={e => setAdjForm({...adjForm, sku: e.target.value})} placeholder="e.g. IP15PM-256" />
                    <Input label="Quantity Change (+/-)" type="number" required value={adjForm.qty} onChange={e => setAdjForm({...adjForm, qty: e.target.value})} placeholder="e.g. -5" />
                    <div className="space-y-1.5">
                       <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest ml-1">Reason for Adjustment</label>
                       <textarea 
                        required
                        value={adjForm.reason}
                        onChange={e => setAdjForm({...adjForm, reason: e.target.value})}
                        className="w-full bg-white  border border-slate-200 text-ink text-sm rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200 h-24 resize-none"
                        placeholder="e.g. Damage reported during cycle count"
                       ></textarea>
                    </div>
                 </div>

                 <div className="mt-10 flex gap-4">
                    <Button type="button" variant="ghost" onClick={() => setIsAdjModalOpen(false)} disabled={savingAdj} className="flex-1 font-bold uppercase tracking-widest text-[10px]">
                      Cancel
                    </Button>
                    <Button type="submit" isLoading={savingAdj} disabled={savingAdj} className="flex-1 font-bold uppercase tracking-widest text-[10px]">
                      {savingAdj ? 'SAVING...' : 'AUTHORIZE ADJ'}
                    </Button>
                 </div>
              </form>
           </Card>
        </div>
      )}

      {/* Receive Inbound Modal */}
      {isReceiveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40  animate-in fade-in duration-200">
           <Card className="w-full max-w-md bg-white border-slate-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
              <div className="p-8 border-b border-slate-100 relative">
                <button 
                  onClick={() => !savingReceive && setIsReceiveModalOpen(false)} 
                  disabled={savingReceive}
                  className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 disabled:opacity-50"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
                <h2 className="text-2xl font-bold text-ink tracking-tight flex items-center gap-2">
                   <svg className="w-6 h-6 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4"/></svg>
                   Receive Inbound
                </h2>
                <p className="text-sm text-inkSoft mt-1 font-medium">Record new stock arriving at the warehouse.</p>
              </div>

              <form onSubmit={handleReceive} className="p-8 space-y-5">
                 <Input label="Target SKU" required value={receiveForm.sku} onChange={e => setReceiveForm({...receiveForm, sku: e.target.value})} placeholder="e.g. S24U-512" />
                 <Input label="Quantity Received" type="number" required value={receiveForm.qty} onChange={e => setReceiveForm({...receiveForm, qty: e.target.value})} placeholder="e.g. 100" />
                 <Input label="Destination Bin Barcode" required value={receiveForm.bin} onChange={e => setReceiveForm({...receiveForm, bin: e.target.value})} placeholder="e.g. A1-01" />

                 <div className="mt-8">
                    <Button type="submit" isLoading={savingReceive} disabled={savingReceive} className="w-full font-bold uppercase tracking-widest text-[10px]">
                      {savingReceive ? 'PROCESSING...' : 'CONFIRM RECEIPT'}
                    </Button>
                 </div>
              </form>
           </Card>
        </div>
      )}

      {/* Transfer Location Modal (Barcode Scanner) */}
      {isTransferModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40  animate-in fade-in duration-200">
           <Card className="w-full max-w-lg bg-white border-slate-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
              <div className="p-8 border-b border-indigo-50 bg-indigo-50/30 relative">
                <button 
                  onClick={() => !savingTransfer && setIsTransferModalOpen(false)} 
                  disabled={savingTransfer}
                  className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 disabled:opacity-50"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
                <h2 className="text-2xl font-bold text-indigo-900 tracking-tight flex items-center gap-2">
                   <svg className="w-6 h-6 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/></svg>
                   Transfer Bin Location
                </h2>
                <p className="text-sm text-indigo-900/60 mt-1 font-medium">Move inventory across the warehouse via barcode.</p>
              </div>

              <form onSubmit={handleTransfer} className="p-8">
                 <div className="mb-6">
                   <label className="text-[11px] font-bold text-indigo-900/60 uppercase tracking-widest ml-1 mb-1.5 block">Scan Barcode (SKU/LPN)</label>
                   <div className="relative">
                     <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                       <svg className="h-5 w-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm14 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"/></svg>
                     </div>
                     <input 
                      ref={barcodeInputRef}
                      required
                      value={transferForm.barcode}
                      onChange={e => setTransferForm({...transferForm, barcode: e.target.value})}
                      className="w-full bg-indigo-50/50 border-2 border-indigo-100 text-indigo-900 text-lg rounded-xl pl-12 pr-4 py-3 focus:outline-none focus:ring-0 focus:border-indigo-400 transition-all font-mono font-bold tracking-wider placeholder:text-indigo-200"
                      placeholder="SCAN BARCODE..."
                     />
                   </div>
                 </div>

                 <div className="grid grid-cols-2 gap-4 mb-6">
                    <Input label="Source Bin" required value={transferForm.sourceBin} onChange={e => setTransferForm({...transferForm, sourceBin: e.target.value.toUpperCase()})} placeholder="e.g. A1-01" />
                    <Input label="Destination Bin" required value={transferForm.destBin} onChange={e => setTransferForm({...transferForm, destBin: e.target.value.toUpperCase()})} placeholder="e.g. B2-05" />
                 </div>
                 
                 <Input label="Quantity to Move" type="number" required value={transferForm.qty} onChange={e => setTransferForm({...transferForm, qty: e.target.value})} placeholder="e.g. 10" />

                 <div className="mt-8">
                    <Button type="submit" isLoading={savingTransfer} disabled={savingTransfer} className="w-full bg-indigo-600 hover:bg-indigo-700 font-bold uppercase tracking-widest text-[10px]">
                      {savingTransfer ? 'TRANSFERRING...' : 'EXECUTE TRANSFER'}
                    </Button>
                 </div>
              </form>
           </Card>
        </div>
      )}

    </div>
  );
}

