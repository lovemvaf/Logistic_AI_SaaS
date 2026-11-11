'use client';

import { useState, useRef, useEffect } from 'react';
import api from '@/lib/api';

type ChatMsg = { role: string; content: string; images?: string[] };

export default function AIChatButton() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file.type.startsWith('image/')) {
      setMessages((m) => [...m, { role: 'assistant', content: 'Vui lòng tải lên file ảnh (jpg, png, gif).' }]);
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setMessages((m) => [...m, { role: 'assistant', content: 'Anh qua lon (>5MB). Vui long chon anh nho hon.' }]);
      return;
    }
    try {
      const base64 = await fileToBase64(file);
      setPendingImages([base64]);
      setMessages((m) => [...m, { role: 'user', content: `Da tai anh: ${file.name} (${Math.round(file.size / 1024)}KB). Mo ta noi dung anh nay giu toi hieu hon.`, images: [base64] }]);
    } catch (err) {
      setMessages((m) => [...m, { role: 'assistant', content: 'Loi khi tai anh: ' + (err as Error)?.message }]);
    }
    e.target.value = '';
  };

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    const userMsg: ChatMsg = { role: 'user', content: text };
    if (pendingImages.length > 0) {
      userMsg.images = [...pendingImages];
    }
    setPendingImages([]);
    setMessages((m) => [...m, userMsg]);
    setLoading(true);
    try {
      const res = await api.post('/ai/v1/chat', {
        messages: [{ role: 'user', content: text }],
        context: 'Ban la tro ly AI phan tich logistics. Tra loi ngan gon, dua tren du lieu don hang, ton kho va van chuyen cua tenant nay.',
        images: userMsg.images,
      });
      const data = res.data;
      const reply = typeof data?.content === 'string' ? data.content : (data?.message || 'Khong nhan duoc phan hoi.');
      setMessages((m) => [...m, { role: 'assistant', content: reply }]);
    } catch (e: any) {
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: 'Loi ket noi AI: ' + (e?.message || 'unknown') + '. Vui long thu lai.' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-50 h-10 rounded-md border border-accent/30 bg-surface px-3 text-[12px] font-semibold text-accent shadow-floating transition-colors hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
        aria-label="Mở trợ lý AI phân tích"
        title="Trợ lý AI phân tích logistics"
      >
        Hỏi AI
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex h-[580px] w-[420px] flex-col rounded-2xl border border-slate-200 bg-background shadow-floating">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <span className="text-sm font-semibold text-ink">Tro ly AI — Pack Station</span>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setMessages([]);
            setPendingImages([]);
          }}
          className="rounded-lg p-1 text-ink-soft hover:text-ink hover:bg-surface-alt focus-visible:ring-2 focus-visible:ring-primary outline-none"
          aria-label="Dong"
        >
          x
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 no-scrollbar">
        {messages.length === 0 ? (
          <div className="space-y-2">
            <p className="text-xs text-ink-soft">
              Xin chao! Toi la tro ly AI phan tich logistics. Toi co the giup ban:
            </p>
            <ul className="text-xs text-inkSoft space-y-1 list-disc list-inside">
              <li>Giải thích các chức năng: đơn hàng, tồn kho, vận chuyển, admin</li>
              <li>Phan tich du lieu, du bao nhu cau & thoi gian giao hang</li>
              <li>Doc hieu hinh anh (tai anh len de phan tich)</li>
            </ul>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className="space-y-1">
              <div
                className={
                  m.role === 'user'
                    ? 'ml-auto max-w-[85%] rounded-2xl bg-primary/5 px-3 py-2 text-sm text-ink'
                    : 'mr-auto max-w-[85%] rounded-2xl bg-surface-alt px-3 py-2 text-sm text-ink'
                }
              >
                {m.content}
              </div>
              {m.images && m.images.length > 0 && (
                <div className="ml-auto max-w-[85%]">
                  {m.images.map((img, j) => (
                    <img
                      key={j}
                      src={img}
                      alt="Anh tai len"
                      className="mt-1 max-w-[120px] max-h-[80px] rounded-lg object-cover border border-slate-200"
                    />
                  ))}
                </div>
              )}
            </div>
          ))
        )}
        {loading && (
          <div className="mr-auto max-w-[85%] rounded-2xl bg-surface-alt px-3 py-2 text-sm text-inkSoft">
            <span className="inline-flex items-center gap-1">
              <span className="animate-bounce">•</span>
              <span className="animate-bounce" style={{ animationDelay: '0.2s' }}>•</span>
              <span className="animate-bounce" style={{ animationDelay: '0.4s' }}>•</span>
              Dang phan tich
            </span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-slate-200 p-3">
        {pendingImages.length > 0 && (
          <div className="mb-2 flex gap-2 overflow-x-auto no-scrollbar">
            {pendingImages.map((img, i) => (
              <img
                key={i}
                src={img}
                alt="Preview"
                className="h-16 w-16 rounded-lg object-cover border border-slate-200"
              />
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            capture="environment"
            onChange={handleImageUpload}
            className="hidden"
            aria-label="Tai anh len"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading || pendingImages.length >= 3}
            className="rounded-xl border border-slate-200 bg-surface-alt p-2 text-ink-soft hover:text-ink hover:bg-surface focus-visible:ring-2 focus-visible:ring-primary outline-none disabled:opacity-50"
            aria-label="Tai anh"
            title="Quet ma / tai anh len de AI phan tich"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 9c.75 0 1.53.16 2.24.46A5.94 5.94 0 0012 3.96c1.42 0 2.73.5 3.76 1.34A5.99 5.99 0 0021 9c0 .6-.09 1.17-.26 1.71A3 3 0 0119 15h-2.24A5.95 5.95 0 0112 20.04c-2.56 0-4.75-1.66-5.5-4.04A6.01 6.01 0 013 15V9z" />
            </svg>
          </button>
          <input
            className="flex-1 rounded-xl border border-slate-200 bg-surface-alt px-3 py-2 text-sm text-ink placeholder-inkSoft/60 focus:outline-none focus:ring-2 focus:ring-primary/20"
            placeholder="Hoi ve don hang, ton kho, van chuyen..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (pendingImages.length > 0 || input.trim()) && send()}
            disabled={loading}
          />
          <button
            type="button"
            onClick={send}
            disabled={loading || (!input.trim() && pendingImages.length === 0)}
            className="rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary outline-none disabled:opacity-50"
          >
            {loading ? '…' : 'Gui'}
          </button>
        </div>
      </div>
    </div>
  );
}
