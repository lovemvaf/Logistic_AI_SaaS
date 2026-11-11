'use client';

import { TableState } from 'ui-components';
import { useState, useEffect, useCallback } from 'react';
import {formatDateTime} from '@/lib/date-utils';
import { useAuth } from '@/lib/auth-context';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { useDropzone } from 'react-dropzone';
import api from '@/lib/api';

type Order = {
  id: string;
  trackingCode: string;
  status: string;
  recipientName: string;
  recipientAddress: string;
  codAmount: number;
  shippingFee: number;
  createdAt: string;
};

export default function OrdersPage() {
  const { user, token } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [trackingModalOpen, setTrackingModalOpen] = useState(false);
  const [trackingData, setTrackingData] = useState<any[]>([]);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [orderToCancel, setOrderToCancel] = useState<string | null>(null);
  
  // Single Order Form State (Multi-step)
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    customerName: '',
    phone: '',
    address: '',
    amount: ''
  });

  const [error, setError] = useState('');

  // Upload Excel State
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  // Dropzone setup with validation
  const onDrop = useCallback((acceptedFiles: File[], fileRejections: any[]) => {
    setUploadError('');
    if (fileRejections.length > 0) {
      setUploadError('Invalid file. Please upload an Excel/CSV file under 10MB.');
      return;
    }
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      // BƯỚC 1/4: Phòng thủ - Check MIME type & Size (Double check despite Dropzone rules)
      if (file.size > 10 * 1024 * 1024) {
        setUploadError('File exceeds 10MB limit.');
        return;
      }
      setUploadFile(file);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv']
    },
    maxSize: 10485760, // 10MB
    disabled: isUploading
  });

  useEffect(() => {
    fetchOrders();
  }, [token]);

  const fetchOrders = async () => {
    if (!token) return;
    setError('');
    try {
      const res = await api.get('/orders');
      const data = res.data;
      setOrders(Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []));
      setLoading(false);
    } catch (err) {
      if (err instanceof Error) {
        setError(`Failed to fetch orders: ${err.message}. Please check connection or try again.`);
      } else {
        setError('Failed to fetch orders. Please check connection or try again.');
      }
      setOrders([]);
      setLoading(false);
    }
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (step === 1) {
      if (!form.customerName || !form.phone) return;
      setStep(2);
      return;
    }
    
    setSaving(true);
    try {
       await api.post('/orders', {
         recipientName: form.customerName,
         recipientPhone: form.phone,
         recipientAddress: form.address,
         codAmount: Number(form.amount) || 0,
         clientId: '',
         items: []
       });
       setIsModalOpen(false);
       setStep(1);
       setForm({ customerName: '', phone: '', address: '', amount: '' });
       fetchOrders();
    } catch (err) {
       console.error("Error creating order", err);
       setError('Failed to create order');
    } finally {
       setSaving(false);
    }
  };

  const handleUploadExcel = async () => {
    if (!uploadFile) return;
    setIsUploading(true);
    setUploadProgress(0);
    setUploadError('');

    try {
      const formData = new FormData();
      formData.append('file', uploadFile);

      // Simulate Progress because api doesn't easily expose axios onUploadProgress here without extending the client
      const interval = setInterval(() => setUploadProgress(p => Math.min(p + 10, 90)), 200);

      await api.post('/orders/bulk/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      
      clearInterval(interval);
      setUploadProgress(100);
      await new Promise(r => setTimeout(r, 400));
      
      setIsUploadModalOpen(false);
      setUploadFile(null);
      fetchOrders();
    } catch (error) {
      setUploadError('Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleCancelOrder = async () => {
    if (!orderToCancel) return;
    try {
      await api.post(`/orders/${orderToCancel}/cancel`);
      setConfirmCancelOpen(false);
      setOrderToCancel(null);
      fetchOrders();
    } catch (error) {
      console.error('Failed to cancel order.', error);
      setError('Failed to cancel order');
    }
  };

  const handleViewDetails = async (orderId: string) => {
    try {
      const res = await api.get(`/orders/${orderId}/tracking`);
      setTrackingData(res.data?.data || res.data || []);
      setTrackingModalOpen(true);
    } catch (error) {
      console.error('Failed to fetch tracking details.', error);
      setError('Failed to fetch tracking details');
    }
  };

  const getStatusVariant = (status: string) => {
    switch(status) {
      case 'NEW': return 'warning';
      case 'UNASSIGNED': return 'neutral';
      case 'PENDING_PICKUP': return 'neutral';
      case 'IN_TRANSIT': return 'info';
      case 'DELIVERED': return 'success';
      case 'RETURNED': return 'error';
      case 'RETURN_REQUESTED': return 'warning';
      case 'CANCELLED': return 'error';
      default: return 'neutral';
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto ">
      {error && <ErrorBanner message={error} onRetry={fetchOrders} />}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-10">
        <div>
          <h1 className="text-4xl font-bold text-ink tracking-tight">
            Order Management
          </h1>
          <p className="text-sm text-inkSoft mt-2 font-medium">Manage single requests and bulk supply chain throughput.</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" size="md" onClick={() => setIsUploadModalOpen(true)} className="font-bold text-[10px] tracking-widest gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
            BULK UPLOAD
          </Button>
          <Button variant="primary" size="md" onClick={() => { setIsModalOpen(true); setStep(1); }} className="gap-2 shadow-lg ">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4"/></svg>
            Create New Order
          </Button>
        </div>
      </div>

      <Card className="">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-border">
                <th className="px-8 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-widest">Order ID</th>
                <th className="px-8 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-widest">Status</th>
                <th className="px-8 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-widest">Customer Details</th>
                <th className="px-8 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-widest">Amount</th>
                <th className="px-8 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <TableState
          loading={loading}
          empty={!loading && orders.length === 0}
          error={error ? new Error(error) : undefined}
          onRetry={fetchOrders}
          colSpan={6}
          emptyContent={<tr>
                  <td colSpan={5} className="px-8 py-20 text-center text-slate-400 font-medium">No active orders found.</td>
                </tr>}
        >
          {orders.map(order => {
                  // BƯỚC 1/4: Defensive logic for Cancel button
                  const canCancel = order.status === 'NEW' || order.status === 'PENDING_PICKUP' || order.status === 'UNASSIGNED';

                  return (
                    <tr key={order.id} className="hover:bg-slate-50/80 transition-all group">
                      <td className="px-8 py-6">
                        <div className="font-bold text-ink">{order.trackingCode}</div>
                      </td>
                      <td className="px-8 py-6">
                        <Badge variant={getStatusVariant(order.status)}>
                          {order.status}
                        </Badge>
                      </td>
                      <td className="px-8 py-6">
                        <div className="font-semibold text-ink leading-tight">{order.recipientName}</div>
                        <div className="text-xs text-inkSoft flex items-center gap-1.5 mt-1.5">
                          <svg className="w-3.5 h-3.5 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                          <span className="truncate max-w-[240px]">{order.recipientAddress}</span>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <div className="text-sm font-bold text-ink">${Number(order.codAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                      </td>
                      <td className="px-8 py-6 text-right">
                        <div className="flex justify-end gap-3 items-center">
                          <Button variant="ghost" size="sm" className="font-bold text-primary tracking-wide" onClick={() => handleViewDetails(order.id)}>
                            DETAILS
                          </Button>
                          <button 
                            onClick={() => { setOrderToCancel(order.id); setConfirmCancelOpen(true); }}
                            disabled={!canCancel}
                            className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${
                              canCancel 
                                ? 'text-red-500 hover:bg-red-50 active:bg-red-100' 
                                : 'text-slate-300 cursor-not-allowed'
                            }`}
                          >
                            CANCEL
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
        </TableState>
            </tbody>
          </table>
        </div>
      </Card>

      {/* Multi-step Create Order Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40  animate-in fade-in duration-200">
          <Card className="w-full max-w-lg bg-white border-slate-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
             <div className="p-8 border-b border-slate-100 relative">
               <button 
                 onClick={() => !saving && setIsModalOpen(false)} 
                 disabled={saving}
                 className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 disabled:opacity-50"
               >
                 <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12"/></svg>
               </button>
               <h2 className="text-2xl font-bold text-ink tracking-tight">Create New Order</h2>
               <p className="text-sm text-inkSoft mt-1 font-medium">Step {step} of 2 - {step === 1 ? 'Customer Details' : 'Logistics Info'}</p>
               
               {/* Progress indicator */}
               <div className="flex gap-2 mt-4">
                 <div className={`h-1.5 flex-1 rounded-full ${step >= 1 ? 'bg-primary' : 'bg-slate-100'}`}></div>
                 <div className={`h-1.5 flex-1 rounded-full ${step >= 2 ? 'bg-primary' : 'bg-slate-100'}`}></div>
               </div>
             </div>

             <form onSubmit={handleCreateOrder} className="p-8 relative min-h-[300px]">
                {step === 1 && (
                  <div className="grid grid-cols-1 gap-5 animate-in slide-in-from-right-4">
                    <Input label="Customer / Recipient Name" required value={form.customerName} onChange={e => setForm({...form, customerName: e.target.value})} placeholder="e.g. Global Tech Solutions" />
                    <Input label="Contact Phone" required value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="+84 901 234 567" />
                  </div>
                )}

                {step === 2 && (
                  <div className="grid grid-cols-1 gap-5 animate-in slide-in-from-right-4">
                    <Input label="Order Total ($)" type="number" required value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} placeholder="0.00" />
                    <Input label="Delivery Address" required value={form.address} onChange={e => setForm({...form, address: e.target.value})} placeholder="Full street address, city" />
                  </div>
                )}

                <div className="absolute bottom-8 left-8 right-8 flex gap-4">
                  {step === 2 && (
                    <Button type="button" variant="outline" onClick={() => setStep(1)} disabled={saving} className="flex-1 font-bold uppercase tracking-widest text-[10px]">
                      Back
                    </Button>
                  )}
                  <Button type="submit" isLoading={saving} disabled={saving} className="flex-1 font-bold uppercase tracking-widest text-[10px]">
                    {step === 1 ? 'CONTINUE' : saving ? 'PROCESSING...' : 'INITIATE ORDER'}
                  </Button>
                </div>
             </form>
          </Card>
        </div>
      )}

      {/* Bulk Upload Dropzone Modal */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60  animate-in fade-in duration-200">
          <div className="absolute inset-0" onClick={() => !isUploading && setIsUploadModalOpen(false)}></div>
          
          <Card className="w-full max-w-xl bg-white border-slate-200 shadow-2xl relative z-10 animate-in zoom-in-95 duration-300">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-ink tracking-tight">Bulk Upload Orders</h2>
                <p className="text-sm text-inkSoft mt-1">Upload a CSV or Excel file to process multiple orders.</p>
              </div>
              <button 
                onClick={() => !isUploading && setIsUploadModalOpen(false)} 
                disabled={isUploading}
                className="text-slate-400 hover:text-slate-600 disabled:opacity-50 transition-all"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>

            <div className="p-8">
              {!uploadFile ? (
                <div 
                  {...getRootProps()} 
                  className={`
                    border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center text-center cursor-pointer transition-all
                    ${isDragActive ? 'border-primary bg-primary/5' : 'border-slate-300 hover:border-primary/50 hover:bg-slate-50'}
                    ${uploadError ? 'border-red-400 bg-red-50/50' : ''}
                  `}
                >
                  <input {...getInputProps()} />
                  <div className={`p-4 rounded-full mb-4 ${isDragActive ? 'bg-primary/20 text-primary' : 'bg-slate-100 text-slate-500'}`}>
                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>
                  </div>
                  <h3 className="font-bold text-ink mb-1">Drag & Drop your file here</h3>
                  <p className="text-sm text-slate-500 mb-4">or click to browse from your computer</p>
                  
                  <div className="text-xs font-medium text-slate-400 bg-slate-100 px-3 py-1 rounded-full">
                    Supported: .xlsx, .xls, .csv (Max 10MB)
                  </div>
                  
                  {uploadError && (
                    <p className="mt-4 text-sm font-semibold text-red-500 animate-in slide-in-from-bottom-2">{uploadError}</p>
                  )}
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl p-6">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="p-3 bg-emerald-100 text-emerald-600 rounded-lg">
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <h4 className="font-bold text-ink truncate">{uploadFile.name}</h4>
                      <p className="text-xs text-slate-500">{(uploadFile.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                    {!isUploading && (
                      <button onClick={() => setUploadFile(null)} className="text-slate-400 hover:text-red-500 p-2">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                      </button>
                    )}
                  </div>

                  {isUploading && (
                    <div className="mb-4">
                      <div className="flex justify-between text-xs font-bold text-slate-500 mb-2">
                        <span>Uploading & Parsing...</span>
                        <span className="text-primary">{uploadProgress}%</span>
                      </div>
                      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-primary transition-all duration-300 ease-out"
                          style={{ width: `${uploadProgress}%` }}
                        ></div>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-3 mt-6">
                    <Button 
                      variant="outline" 
                      onClick={() => setUploadFile(null)} 
                      disabled={isUploading}
                      className="flex-1"
                    >
                      Change File
                    </Button>
                    <Button 
                      variant="primary" 
                      onClick={handleUploadExcel} 
                      disabled={isUploading}
                      isLoading={isUploading}
                      className="flex-1"
                    >
                      {isUploading ? 'PROCESSING' : 'UPLOAD & PROCESS'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Tracking Details Modal */}
      {trackingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40  ">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
            <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h2 className="text-xl font-bold text-ink tracking-tight">Tracking History</h2>
              <button onClick={() => setTrackingModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="p-8 overflow-y-auto">
              {trackingData.length === 0 ? (
                <div className="text-center text-slate-400 font-medium py-8">No tracking events found for this order.</div>
              ) : (
                <div className="space-y-6">
                  {trackingData.map((event, idx) => (
                    <div key={idx} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className="w-3 h-3 rounded-full bg-primary mt-1"></div>
                        {idx !== trackingData.length - 1 && <div className="w-0.5 h-full bg-slate-200 my-1"></div>}
                      </div>
                      <div className="pb-6">
                        <div className="text-sm font-bold text-ink">{event.status}</div>
                        <div className="text-xs text-slate-500 mt-1">{formatDateTime(event.timestamp)}</div>
                        <div className="text-sm text-slate-600 mt-1">{event.description}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end">
              <Button variant="outline" onClick={() => setTrackingModalOpen(false)}>Close</Button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Cancel Modal */}
      {confirmCancelOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40  ">
          <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl p-8 text-center">
            <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
            </div>
            <h2 className="text-xl font-bold text-ink mb-2">Cancel Order?</h2>
            <p className="text-slate-500 text-sm mb-8">Are you sure you want to cancel this order? This action cannot be undone.</p>
            <div className="flex gap-3 justify-center">
              <Button variant="outline" onClick={() => setConfirmCancelOpen(false)}>No, Keep it</Button>
              <Button variant="primary" onClick={handleCancelOrder} className="bg-red-500 hover:bg-red-600">Yes, Cancel Order</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

