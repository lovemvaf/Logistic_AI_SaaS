'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from 'ui-components';
import { EditorialPageHeader, EditorialSection } from 'ui-kit';
import api from '@/lib/api';
import { create, isMockDataSource, Order, initStore } from '@/lib/local-store';

type DraftOrder = {
  trackingCode: string;
  clientOrderRef: string;
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string;
  origin: string;
  destination: string;
  status: Order['status'];
  codAmount: string;
  shippingFee: string;
  sku: string;
  qty: string;
};

type BulkUploadResult = {
  total: number;
  success: number;
  failed: number;
  errors: { row: number; message: string }[];
};

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'NEW', label: 'New' },
  { value: 'UNASSIGNED', label: 'Unassigned' },
  { value: 'PENDING_PICKUP', label: 'Pending pickup' },
  { value: 'IN_TRANSIT', label: 'In transit' },
  { value: 'OUT_FOR_DELIVERY', label: 'Out for delivery' },
  { value: 'DELIVERED', label: 'Delivered' },
  { value: 'RETURNED', label: 'Returned' },
  { value: 'RETURN_REQUESTED', label: 'Return requested' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

function emptyRow(): DraftOrder {
  return {
    trackingCode: '',
    clientOrderRef: '',
    recipientName: '',
    recipientPhone: '',
    recipientAddress: '',
    origin: '',
    destination: '',
    status: 'NEW',
    codAmount: '',
    shippingFee: '',
    sku: '',
    qty: '1',
  };
}

function parseCsvRows(content: string): string[][] {
  const clean = content.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"' && clean[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field.trim());
      field = '';
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && clean[i + 1] === '\n') i++;
      row.push(field.trim());
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  row.push(field.trim());
  if (row.some((c) => c !== '')) rows.push(row);
  return rows;
}

function encodeCsvCell(value: unknown): string {
  const raw = String(value ?? '');
  const guarded = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${guarded.replace(/"/g, '""')}"`;
}

export default function BulkUploadPage() {
  const router = useRouter();
  const [drafts, setDrafts] = useState<DraftOrder[]>([emptyRow()]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<BulkUploadResult | null>(null);

  const addRow = () => {
    setDrafts([...drafts, emptyRow()]);
  };

  const removeRow = (index: number) => {
    setDrafts(drafts.filter((_, i) => i !== index));
  };

  const updateRow = (index: number, field: keyof DraftOrder, value: string) => {
    setDrafts((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = String(event.target?.result || '');
        const rows = parseCsvRows(text);
        const headers = rows[0]?.map((h) => h.trim().toLowerCase()) ?? [];

        if (headers.length === 0) {
          setError('CSV file is empty or has no headers.');
          return;
        }

        const parsed: DraftOrder[] = [];
        for (let i = 1; i < rows.length; i++) {
          const cols = rows[i];
          const row: Record<string, string> = {};
          headers.forEach((h, idx) => {
            row[h] = cols[idx] ?? '';
          });

          parsed.push({
            trackingCode: row['tracking_code'] || row['trackingcode'] || '',
            clientOrderRef: row['client_order_ref'] || row['clientorderref'] || row['orderref'] || '',
            recipientName: row['recipient_name'] || row['recipientname'] || row['recipient name'] || row['name'] || '',
            recipientPhone: row['recipient_phone'] || row['recipientphone'] || row['phone'] || '',
            recipientAddress: row['recipient_address'] || row['recipientaddress'] || row['address'] || '',
            origin: row['origin'] || '',
            destination: row['destination'] || '',
            status: (row['status'] as Order['status']) || 'NEW',
            codAmount: row['cod_amount'] || row['codamount'] || row['cod'] || '',
            shippingFee: row['shipping_fee'] || row['shippingfee'] || row['fee'] || '',
            sku: row['sku'] || '',
            qty: row['qty'] || row['quantity'] || '1',
          });
        }

        setDrafts(parsed.length > 0 ? parsed : [emptyRow()]);
        setError(null);
        setUploadResult(null);
      } catch (err: any) {
        setError(err?.message || 'Failed to parse CSV file.');
      }
    };
    reader.readAsText(file);
  };

  const handleUpload = async () => {
    setError(null);
    setUploadResult(null);

    if (isMockDataSource) {
      const validDrafts = drafts.filter(
        (d) => d.recipientName && d.recipientAddress && d.origin && d.destination && d.codAmount,
      );

      if (validDrafts.length === 0) {
        setError('At least one row must be filled with recipient name, address, origin, destination, and COD amount.');
        return;
      }

      setUploading(true);
      try {
        initStore();
        validDrafts.forEach((draft) => {
          const order: Order = {
            id: `ord_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            trackingCode: draft.trackingCode || `TRK-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
            clientOrderRef: draft.clientOrderRef,
            recipientName: draft.recipientName,
            recipientPhone: draft.recipientPhone || undefined,
            recipientAddress: draft.recipientAddress,
            origin: draft.origin,
            destination: draft.destination,
            status: draft.status || 'NEW',
            codAmount: Number(draft.codAmount) || 0,
            shippingFee: Number(draft.shippingFee) || 0,
            createdAt: new Date().toISOString(),
          };
          create('orders', order as any);
        });
        setDrafts([emptyRow()]);
        router.push('/admin/orders');
      } catch (err: any) {
        setError(err?.message || 'Failed to upload orders.');
      } finally {
        setUploading(false);
      }
      return;
    }

    const validDrafts = drafts.filter(
      (d) => d.recipientName.trim() && d.recipientPhone.trim() && d.recipientAddress.trim(),
    );

    if (validDrafts.length === 0) {
      setError('At least one row must include recipient name, recipient phone, and recipient address.');
      return;
    }

    setUploading(true);
    try {
      const csvHeader = ['Recipient Name', 'Phone', 'Address', 'COD', 'Fee', 'OrderRef', 'SKU', 'Qty'].join(',');
      const csvRows = validDrafts.map((d) =>
        [
          encodeCsvCell(d.recipientName.trim()),
          encodeCsvCell(d.recipientPhone.trim()),
          encodeCsvCell(d.recipientAddress.trim()),
          encodeCsvCell(Number(d.codAmount || 0)),
          encodeCsvCell(Number(d.shippingFee || 0)),
          encodeCsvCell(d.clientOrderRef.trim()),
          encodeCsvCell(d.sku.trim()),
          encodeCsvCell(d.sku.trim() ? Math.max(1, Number(d.qty || 1)) : ''),
        ].join(','),
      );
      const csvBlob = new Blob([[csvHeader, ...csvRows].join('\n')], { type: 'text/csv;charset=utf-8' });
      const formData = new FormData();
      formData.append('file', csvBlob, 'bulk-orders.csv');

      const res = await api.post('/orders/bulk/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const result: BulkUploadResult = {
        total: Number(res.data?.total ?? validDrafts.length),
        success: Number(res.data?.success ?? 0),
        failed: Number(res.data?.failed ?? 0),
        errors: Array.isArray(res.data?.errors) ? res.data.errors : [],
      };
      setUploadResult(result);

      if (result.failed === 0 && result.success > 0) {
        setDrafts([emptyRow()]);
        router.push('/admin/orders');
      } else if (result.failed > 0) {
        setError(`Uploaded ${result.success}/${result.total} orders; ${result.failed} row(s) failed.`);
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to upload orders.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <EditorialPageHeader
        eyebrow="Dashboard"
        title="Bulk upload orders"
        description="Upload orders via CSV or add rows manually. Required fields: recipient name, phone, and address."
        actions={
          <Button variant="ghost" size="sm" onClick={() => router.push('/admin/orders')}>
            Back to orders
          </Button>
        }
      />

      <EditorialSection eyebrow="Order" title="Upload table">
        {error && (
          <div className="mb-4 rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-[12px] text-danger">
            {error}
          </div>
        )}

        {uploadResult && uploadResult.errors.length > 0 && (
          <div className="mb-4 rounded-md border border-warning/40 bg-warning/5 px-3 py-2 text-[12px] text-ink-soft">
            <p className="font-medium text-ink">
              Batch result: {uploadResult.success} succeeded, {uploadResult.failed} failed
            </p>
            <ul className="mt-1 list-disc pl-5">
              {uploadResult.errors.slice(0, 10).map((item, idx) => (
                <li key={idx}>
                  Row {item.row}: {item.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <label className="inline-flex items-center gap-3 rounded-lg border border-dashed border-line-strong px-4 py-2.5 text-[12px] font-medium text-ink-soft hover:bg-surface-alt transition-colors cursor-pointer">
            <span>Upload CSV</span>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileUpload}
              className="sr-only"
            />
          </label>
          <Button variant="outline" size="sm" onClick={addRow}>
            Add row
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">Draft rows for bulk upload</caption>
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="h-8 pr-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Tracking</th>
                <th scope="col" className="h-8 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Client ref</th>
                <th scope="col" className="h-8 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Recipient</th>
                <th scope="col" className="h-8 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Phone</th>
                <th scope="col" className="h-8 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Address</th>
                <th scope="col" className="h-8 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Origin</th>
                <th scope="col" className="h-8 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Destination</th>
                <th scope="col" className="h-8 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">SKU</th>
                <th scope="col" className="h-8 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Qty</th>
                <th scope="col" className="h-8 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Status</th>
                <th scope="col" className="h-8 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">COD</th>
                <th scope="col" className="h-8 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Fee</th>
                <th scope="col" className="h-8 pl-3 text-right text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Actions</th>
              </tr>
            </thead>
            <tbody>
              {drafts.length === 0 ? (
                <tr>
                  <td colSpan={13} className="h-[42px] text-center text-[12px] text-ink-faint">No rows to display.</td>
                </tr>
              ) : (
                drafts.map((row, index) => (
                  <tr key={index} className="h-[42px] border-b border-line/80 transition-colors hover:bg-surface-alt/60">
                    <td className="pr-3">
                      <input
                        type="text"
                        value={row.trackingCode}
                        onChange={(e) => updateRow(index, 'trackingCode', e.target.value)}
                        disabled={!isMockDataSource}
                        className="h-8 w-full rounded-md border border-line bg-white px-2 text-[12px] outline-none focus:border-accent focus:ring-2 focus:ring-accent/15 disabled:opacity-50"
                        placeholder={isMockDataSource ? 'TRK-2024-xxxx' : 'Auto'}
                      />
                    </td>
                    <td className="px-3">
                      <input
                        type="text"
                        value={row.clientOrderRef}
                        onChange={(e) => updateRow(index, 'clientOrderRef', e.target.value)}
                        className="h-8 w-full rounded-md border border-line bg-white px-2 text-[12px] outline-none focus:border-accent focus:ring-2 focus:ring-accent/15"
                        placeholder="PO-2024-xxxx"
                      />
                    </td>
                    <td className="px-3">
                      <input
                        type="text"
                        value={row.recipientName}
                        onChange={(e) => updateRow(index, 'recipientName', e.target.value)}
                        className="h-8 w-full rounded-md border border-line bg-white px-2 text-[12px] outline-none focus:border-accent focus:ring-2 focus:ring-accent/15"
                        placeholder="Recipient name"
                      />
                    </td>
                    <td className="px-3">
                      <input
                        type="text"
                        value={row.recipientPhone}
                        onChange={(e) => updateRow(index, 'recipientPhone', e.target.value)}
                        className="h-8 w-full rounded-md border border-line bg-white px-2 text-[12px] outline-none focus:border-accent focus:ring-2 focus:ring-accent/15"
                        placeholder="+84 901 234 567"
                      />
                    </td>
                    <td className="px-3">
                      <input
                        type="text"
                        value={row.recipientAddress}
                        onChange={(e) => updateRow(index, 'recipientAddress', e.target.value)}
                        className="h-8 w-full rounded-md border border-line bg-white px-2 text-[12px] outline-none focus:border-accent focus:ring-2 focus:ring-accent/15"
                        placeholder="Full address"
                      />
                    </td>
                    <td className="px-3">
                      <input
                        type="text"
                        value={row.origin}
                        onChange={(e) => updateRow(index, 'origin', e.target.value)}
                        className="h-8 w-full rounded-md border border-line bg-white px-2 text-[12px] outline-none focus:border-accent focus:ring-2 focus:ring-accent/15"
                        placeholder="Warehouse"
                      />
                    </td>
                    <td className="px-3">
                      <input
                        type="text"
                        value={row.destination}
                        onChange={(e) => updateRow(index, 'destination', e.target.value)}
                        className="h-8 w-full rounded-md border border-line bg-white px-2 text-[12px] outline-none focus:border-accent focus:ring-2 focus:ring-accent/15"
                        placeholder="Destination"
                      />
                    </td>
                    <td className="px-3">
                      <input
                        type="text"
                        value={row.sku}
                        onChange={(e) => updateRow(index, 'sku', e.target.value)}
                        className="h-8 w-24 rounded-md border border-line bg-white px-2 text-[12px] outline-none focus:border-accent focus:ring-2 focus:ring-accent/15"
                        placeholder="SKU"
                      />
                    </td>
                    <td className="px-3">
                      <input
                        type="number"
                        min={1}
                        value={row.qty}
                        onChange={(e) => updateRow(index, 'qty', e.target.value)}
                        className="h-8 w-16 rounded-md border border-line bg-white px-2 text-[12px] outline-none focus:border-accent focus:ring-2 focus:ring-accent/15"
                        placeholder="1"
                      />
                    </td>
                    <td className="px-3">
                      <select
                        value={row.status}
                        onChange={(e) => updateRow(index, 'status', e.target.value)}
                        disabled={!isMockDataSource}
                        className="h-8 w-full rounded-md border border-line bg-white px-2 text-[11px] font-medium text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/15 disabled:opacity-50"
                      >
                        {STATUS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3">
                      <input
                        type="number"
                        value={row.codAmount}
                        onChange={(e) => updateRow(index, 'codAmount', e.target.value)}
                        className="h-8 w-full rounded-md border border-line bg-white px-2 text-[12px] outline-none focus:border-accent focus:ring-2 focus:ring-accent/15"
                        placeholder="2450000"
                      />
                    </td>
                    <td className="px-3">
                      <input
                        type="number"
                        value={row.shippingFee}
                        onChange={(e) => updateRow(index, 'shippingFee', e.target.value)}
                        className="h-8 w-full rounded-md border border-line bg-white px-2 text-[12px] outline-none focus:border-accent focus:ring-2 focus:ring-accent/15"
                        placeholder="85000"
                      />
                    </td>
                    <td className="pl-3 text-right">
                      <button
                        type="button"
                        onClick={() => removeRow(index)}
                        className="text-[11px] font-medium text-ink-soft underline decoration-ink-faint/30 underline-offset-2 hover:text-danger hover:decoration-danger"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
          <Button variant="outline" size="sm" onClick={addRow}>
            Add row
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => router.push('/admin/orders')}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={() => void handleUpload()} disabled={uploading} isLoading={uploading}>
              {uploading ? 'Uploading…' : 'Upload orders'}
            </Button>
          </div>
        </div>
      </EditorialSection>
    </div>
  );
}
