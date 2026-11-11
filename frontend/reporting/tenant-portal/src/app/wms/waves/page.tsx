'use client';
import { useState } from 'react';
import {formatDate, formatTime} from '@/lib/date-utils';
import useSWR from 'swr';
import api from '@/lib/api';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';

const fetcher = (url: string) => api.get(url).then((res) => res.data);

export default function WavePickingPage() {
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const limit = 20;
  const { data, isLoading, mutate } = useSWR(`/waves?page=${page}&limit=${limit}&search=${search}`, fetcher);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  
  const [manifestModalOpen, setManifestModalOpen] = useState(false);
  const [selectedWaveId, setSelectedWaveId] = useState<string | null>(null);

  const waves = data?.data || [];
  const meta = data?.meta || { total: 0 };
  const totalPages = Math.max(1, Math.ceil((meta?.total || 0) / limit));
  const filteredWaves = waves.filter((wave: any) =>
    wave.waveNumber?.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreateWave = async () => {
     setError('');
     setCreating(true);
     try {
        await api.post('/waves/generate', {
          warehouseId: "wh_1",
          orderIds: []
        });
        mutate();
        setIsModalOpen(false);
     } catch (err) {
        console.error("Error creating wave", err);
        setError('Failed to create wave');
     } finally {
        setCreating(false);
     }
  };

  const handleViewManifest = (waveId: string) => {
    setSelectedWaveId(waveId);
    setManifestModalOpen(true);
  };

  const getStatusVariant = (status: string) => {
    switch(status) {
      case 'NEW': return 'info';
      case 'IN_PROGRESS': return 'warning';
      case 'COMPLETED': return 'success';
      default: return 'neutral';
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto ">
      {error && <ErrorBanner message={error} onRetry={() => mutate()} />}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-10">
        <div>
          <h1 className="text-4xl font-bold text-ink tracking-tight">
            Wave Picking
          </h1>
          <p className="text-sm text-inkSoft mt-2 font-medium">Batch and orchestrate outbound orders for efficient fulfillment.</p>
        </div>
        <Button variant="primary" size="md" onClick={() => setIsModalOpen(true)} className="gap-2 shadow-lg ">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4"/></svg>
          Create New Wave
        </Button>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-8">
        <div className="relative w-full max-w-md group">
          <Input 
            placeholder="Search wave number..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            icon={<svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>}
          />
        </div>
      </div>

      <Card className="">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-border">
                <th className="px-8 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-widest">Wave Identification</th>
                <th className="px-8 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-widest">Current Status</th>
                <th className="px-8 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-widest">Volume (Ord/Tsk)</th>
                <th className="px-8 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-widest">Initialization</th>
                <th className="px-8 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-widest text-right">Control</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-8 py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Syncing Wave Data...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredWaves.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-8 py-20 text-center text-slate-400 font-bold uppercase tracking-widest text-xs">No active picking waves found.</td>
                </tr>
              ) : (
                filteredWaves.map((wave: any) => (
                  <tr key={wave.id} className="hover:bg-slate-50/80 transition-all group">
                    <td className="px-8 py-6">
                      <div className="font-bold text-ink font-mono tracking-tight">{wave.waveNumber}</div>
                      <div className="text-[10px] text-slate-400 mt-1 font-bold uppercase tracking-wider">Facility ID: {wave.warehouseId?.split('-')[0]}</div>
                    </td>
                    <td className="px-8 py-6">
                       <Badge variant={getStatusVariant(wave.status)}>{wave.status}</Badge>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-3">
                        <div className="text-center">
                           <div className="text-sm font-bold text-ink">{wave.totalOrders}</div>
                           <div className="text-[9px] font-bold text-slate-400 uppercase">Orders</div>
                        </div>
                        <div className="w-px h-6 bg-slate-200"></div>
                        <div className="text-center">
                           <div className="text-sm font-bold text-ink">{wave.tasks?.length ?? 0}</div>
                           <div className="text-[9px] font-bold text-slate-400 uppercase">Tasks</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="text-[11px] font-bold text-ink">{formatDate(wave.createdAt)}</div>
                      <div className="text-[10px] font-medium text-slate-400 mt-0.5">{formatTime(wave.createdAt)}</div>
                    </td>
                    <td className="px-8 py-6 text-right">
                       <Button variant="ghost" size="sm" className="font-bold text-primary tracking-widest text-[10px]" onClick={() => handleViewManifest(wave.id)}>
                          VIEW MANIFEST
                       </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {!isLoading && total > limit && (
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-slate-100">
          <span className="text-sm text-slate-500">
            Page {page} of {totalPages} ({total} waves)
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

      {/* Create Wave Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40  animate-in fade-in duration-200">
          <Card className="w-full max-w-md bg-white border-slate-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
             <div className="p-8 border-b border-slate-100">
                <h2 className="text-2xl font-bold text-ink tracking-tight">Initiate Wave</h2>
                <p className="text-sm text-inkSoft mt-1 font-medium">Batch pending orders into a new picking cycle.</p>
             </div>

             <div className="p-8">
                <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 mb-8">
                   <div className="flex justify-between items-center mb-4">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Pending Orders</span>
                      <Badge variant="info">14 Ready</Badge>
                   </div>
                   <p className="text-xs text-inkSoft font-medium leading-relaxed">
                      Our AI engine has identified 14 orders that can be optimized into a single picking wave for Zone A and B.
                   </p>
                </div>

                <div className="flex gap-4">
                  <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)} className="flex-1 font-bold uppercase tracking-widest text-[10px]">
                    Cancel
                  </Button>
                  <Button onClick={handleCreateWave} isLoading={creating} variant="primary" className="flex-1 font-bold uppercase tracking-widest text-[10px]">
                    {creating ? 'BATCHING...' : 'CONFIRM WAVE'}
                  </Button>
                </div>
             </div>
          </Card>
        </div>
      )}

      {/* Manifest Modal */}
      {manifestModalOpen && selectedWaveId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40  ">
          <Card className="w-full max-w-lg bg-white p-0 overflow-hidden shadow-2xl">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div>
                <h2 className="text-xl font-bold text-ink">Wave Manifest</h2>
                <p className="text-xs text-inkSoft mt-1">Wave ID: <span className="font-mono">{selectedWaveId}</span></p>
              </div>
              <button onClick={() => setManifestModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="p-8 space-y-4">
              <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl flex items-start gap-3">
                 <svg className="w-5 h-5 text-primary mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                 <div>
                   <p className="text-sm font-bold text-ink">Manifest Loading Optimized Paths</p>
                   <p className="text-xs text-inkSoft mt-1">The system is calculating the most efficient picking path for the warehouse staff through VRP Solver. Task details will be grouped by zone automatically.</p>
                 </div>
              </div>
              {/* Dummy List to show UI */}
              <div className="border border-slate-100 rounded-xl divide-y divide-slate-100">
                 <div className="p-3 text-xs flex justify-between">
                   <span className="font-bold text-slate-500">Task #1</span>
                   <span className="text-slate-400">Zone A - Rack 2</span>
                 </div>
                 <div className="p-3 text-xs flex justify-between">
                   <span className="font-bold text-slate-500">Task #2</span>
                   <span className="text-slate-400">Zone B - Rack 1</span>
                 </div>
              </div>
            </div>
            <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setManifestModalOpen(false)}>Close</Button>
              <Button variant="primary">Print PDF</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}


