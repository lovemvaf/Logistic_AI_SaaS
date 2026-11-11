'use client';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { useScale } from '@/hooks/useHardware';
import { Can } from '@/components/auth/Can';

export default function PackStationPage() {
  const [orderId, setOrderId] = useState('');
  const { weight: scaleWeight, isReading, readWeight, isConnected } = useScale();
  const [manualWeight, setManualWeight] = useState('');
  const [dims, setDims] = useState('');
  
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [sealModalOpen, setSealModalOpen] = useState(false);

  const handlePrintPackingSlip = () => {
    setPrintModalOpen(true);
  };

  const handleFinalize = () => {
    setSealModalOpen(true);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto  h-[calc(100vh-64px)] flex flex-col">
      <div className="mb-10 shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <Badge variant={isConnected ? 'success' : 'info'}>
            {isConnected ? 'SCALE ONLINE' : 'LOGISTICS HUB'}
          </Badge>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Active Station: P-01</span>
        </div>
        <h1 className="text-4xl font-bold text-ink tracking-tight">Pack Station</h1>
        <p className="text-sm text-inkSoft mt-2 font-medium">Verify contents, capture weight, and generate shipping labels.</p>
      </div>

      {/* ... (orders queue card) ... */}

        <Card className="lg:col-span-2 p-8 border-slate-200 shadow-2xl flex flex-col">
           <div className="flex justify-between items-center mb-10">
              <h3 className="text-sm font-bold text-ink uppercase tracking-widest">Dimensions & Weight</h3>
              <div className="flex gap-2">
                <Button 
                  size="sm" 
                  variant={isConnected ? 'secondary' : 'outline'} 
                  onClick={readWeight} 
                  isLoading={isReading}
                  className="text-[10px] font-bold h-8"
                >
                  <svg className="w-3 h-3 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                  {isConnected ? 'READ SCALE' : 'CONNECT SCALE'}
                </Button>
                <Badge variant="neutral">Auto-Sync Enabled</Badge>
              </div>
           </div>

           {/* ... (inputs and live scale display) ... */}

           <div className="mt-auto grid grid-cols-2 gap-4 pt-8 border-t border-slate-50">
              <Button variant="outline" className="py-6 font-black uppercase tracking-[0.2em] text-[10px]" onClick={handlePrintPackingSlip}>Print Packing Slip</Button>
              <Can permission="inventory:adjust" fallback={
                <div className="flex items-center justify-center p-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                   <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Adjustment Access Required</p>
                </div>
              }>
                <Button variant="primary" className="py-6 font-black uppercase tracking-[0.2em] text-[10px] shadow-lg " onClick={handleFinalize}>Finalize & Seal</Button>
              </Can>
           </div>
        </Card>

      {/* Print Modal */}
      {printModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40  ">
          <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl p-8 text-center border-t-4 border-t-emerald-500">
            <div className="w-16 h-16 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-100">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
            </div>
            <h2 className="text-xl font-bold text-ink mb-2">Printing Slip</h2>
            <p className="text-slate-500 text-sm mb-6">Generating PDF document and sending to default station printer P-01-PRN...</p>
            <Button variant="primary" className="w-full" onClick={() => setPrintModalOpen(false)}>Done</Button>
          </div>
        </div>
      )}

      {/* Seal Modal */}
      {sealModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40  ">
          <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl p-8 text-center border-t-4 border-t-primary">
            <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto mb-4 border border-primary/20">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            </div>
            <h2 className="text-xl font-bold text-ink mb-2">Order Sealed</h2>
            <p className="text-slate-500 text-sm mb-6">
              Package successfully sealed and tracking label generated. Captured weight: <span className="font-bold text-ink">{scaleWeight || manualWeight || '0'} kg</span>
            </p>
            <Button variant="primary" className="w-full" onClick={() => setSealModalOpen(false)}>Continue Packing</Button>
          </div>
        </div>
      )}
    </div>
  );
}

