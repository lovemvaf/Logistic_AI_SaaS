'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Select } from 'ui-components';
import { EditorialPageHeader, EditorialSection } from 'ui-kit';
import api from '@/lib/api';
import { create, isMockDataSource, Order, initStore } from '@/lib/local-store';

type ProductOption = { id: string; sku: string; name: string };

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'NEW', label: 'New' },
  { value: 'UNASSIGNED', label: 'Unassigned' },
  { value: 'PENDING_PICKUP', label: 'Pending pickup' },
  { value: 'PICKING', label: 'Picking' },
  { value: 'PACKED', label: 'Packed' },
  { value: 'DISPATCHED', label: 'Dispatched' },
  { value: 'IN_TRANSIT', label: 'In transit' },
  { value: 'OUT_FOR_DELIVERY', label: 'Out for delivery' },
  { value: 'DELIVERED', label: 'Delivered' },
  { value: 'PARTIAL_DELIVERED', label: 'Partial delivered' },
  { value: 'RETURNED', label: 'Returned' },
  { value: 'RETURN_REQUESTED', label: 'Return requested' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

export default function NewOrderPage() {
  const router = useRouter();
  const [trackingCode, setTrackingCode] = useState('');
  const [clientOrderRef, setClientOrderRef] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [recipientAddress, setRecipientAddress] = useState('');
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [status, setStatus] = useState<Order['status']>('NEW');
  const [codAmount, setCodAmount] = useState('');
  const [shippingFee, setShippingFee] = useState('');
  const [clientName, setClientName] = useState('');
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    initStore();
    const year = new Date().getFullYear();
    const num = Math.floor(1000 + Math.random() * 9000);
    setTrackingCode(isMockDataSource ? `TRK-${year}-${num}` : 'Server-generated');
    setClientOrderRef(`PO-${year}-${num + 1}`);

    if (!isMockDataSource) {
      api
        .get('/products?limit=100')
        .then((res) => {
          const payload = res.data;
          const rows: any[] = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];
          const options = rows
            .filter((p) => p?.id)
            .map((p) => ({ id: String(p.id), sku: String(p.sku || ''), name: String(p.name || p.id) }));
          setProducts(options);
          if (options.length > 0 && !productId) {
            setProductId(options[0].id);
          }
        })
        .catch(() => {
          // Roles without inventory:read can still type productId manually.
        });
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!recipientName.trim() || !recipientAddress.trim()) {
      setError('Recipient name and recipient address are required.');
      return;
    }

    if (!isMockDataSource) {
      if (!recipientPhone.trim()) {
        setError('Recipient phone is required when creating an order via the API.');
        return;
      }
      if (!productId.trim()) {
        setError('Product ID is required by POST /orders (items: [{ productId, quantity }]).');
        return;
      }
      const qtyNum = Number(quantity);
      if (!Number.isInteger(qtyNum) || qtyNum < 1) {
        setError('Quantity must be an integer >= 1.');
        return;
      }
    }

    setSaving(true);
    try {
      if (isMockDataSource) {
        const newOrder: Order = {
          id: `ord_${Date.now()}`,
          trackingCode: trackingCode || `TRK-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
          clientOrderRef,
          recipientName: recipientName.trim(),
          recipientPhone: recipientPhone.trim() || undefined,
          recipientAddress: recipientAddress.trim(),
          origin,
          destination,
          status,
          codAmount: Number(codAmount) || 0,
          shippingFee: Number(shippingFee) || 0,
          createdAt: new Date().toISOString(),
          client: clientName ? { name: clientName } : undefined,
        };
        create('orders', newOrder as any);
      } else {
        await api.post('/orders', {
          recipientName: recipientName.trim(),
          recipientPhone: recipientPhone.trim(),
          recipientAddress: recipientAddress.trim(),
          clientOrderRef: clientOrderRef.trim() || undefined,
          codAmount: Number(codAmount) || 0,
          shippingFee: Number(shippingFee) || 0,
          items: [
            {
              productId: productId.trim(),
              quantity: Math.max(1, Number(quantity) || 1),
            },
          ],
        });
      }
      router.push('/admin/orders');
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to create order.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    router.push('/admin/orders');
  };

  return (
    <div>
      <EditorialPageHeader
        eyebrow="Dashboard"
        title="New order"
        description="Create a new shipping order for one of your tenants' customers."
        actions={
          <Button variant="ghost" size="sm" onClick={handleCancel}>
            Back to orders
          </Button>
        }
      />

      <EditorialSection eyebrow="Order" title="Create order">
        <div className="max-w-3xl">
          {error && (
            <div className="mb-4 rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-[12px] text-danger">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <Input
                  label="Tracking code"
                  value={trackingCode}
                  onChange={(e) => setTrackingCode(e.target.value)}
                  placeholder="TRK-2024-xxxx"
                  disabled={!isMockDataSource}
                  required={isMockDataSource}
                />
              </div>
              <div>
                <Input label="Client order ref" value={clientOrderRef} onChange={(e) => setClientOrderRef(e.target.value)} placeholder="PO-2024-xxxx" />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
              <div>
                <Input label="Recipient name" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="e.g. Acme Logistics" required />
              </div>
              <div>
                <Input label="Recipient phone" value={recipientPhone} onChange={(e) => setRecipientPhone(e.target.value)} placeholder="e.g. +84 901 234 567" required={!isMockDataSource} />
              </div>
              <div>
                <Input label="Client name" value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="e.g. Acme Logistics" />
              </div>
            </div>

            <div>
              <Input label="Recipient address" value={recipientAddress} onChange={(e) => setRecipientAddress(e.target.value)} placeholder="e.g. 123 Main St, Hanoi" required />
            </div>

            {!isMockDataSource && (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  {products.length > 0 ? (
                    <Select
                      label="Product"
                      options={products.map((p) => ({ value: p.id, label: p.sku ? `${p.sku} — ${p.name}` : p.name }))}
                      value={productId}
                      onChange={(e) => setProductId(e.target.value)}
                    />
                  ) : (
                    <Input
                      label="Product ID"
                      value={productId}
                      onChange={(e) => setProductId(e.target.value)}
                      placeholder="UUID of product in catalog"
                      required
                    />
                  )}
                </div>
                <div>
                  <Input
                    label="Quantity"
                    type="number"
                    min={1}
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    required
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
              <div>
                <Input label="Origin" value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="e.g. Bien Hoa Warehouse" required={isMockDataSource} />
              </div>
              <div>
                <Input label="Destination" value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="e.g. District 1, Ho Chi Minh" required={isMockDataSource} />
              </div>
              <div>
                <Select label="Status" options={STATUS_OPTIONS} value={status} onChange={(e) => setStatus(e.target.value as Order['status'])} disabled={!isMockDataSource} />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <Input label="COD amount (VND)" value={codAmount} onChange={(e) => setCodAmount(e.target.value)} placeholder="e.g. 2450000" type="number" required />
              </div>
              <div>
                <Input label="Shipping fee (VND)" value={shippingFee} onChange={(e) => setShippingFee(e.target.value)} placeholder="e.g. 85000" type="number" />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-line pt-4">
              <Button variant="ghost" type="button" onClick={handleCancel}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={saving} isLoading={saving}>
                {saving ? 'Saving…' : 'Create order'}
              </Button>
            </div>
          </form>
        </div>
      </EditorialSection>
    </div>
  );
}
