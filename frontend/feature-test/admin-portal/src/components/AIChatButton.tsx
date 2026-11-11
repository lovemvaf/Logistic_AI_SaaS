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
      setMessages((m) => [...m, { role: 'assistant', content: 'Please upload an image (jpg, png, gif).' }]);
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setMessages((m) => [...m, { role: 'assistant', content: 'Image is too large (>5MB). Please choose a smaller one.' }]);
      return;
    }
    try {
      const base64 = await fileToBase64(file);
      setPendingImages([base64]);
      setMessages((m) => [...m, { role: 'user', content: `Sent image: ${file.name} (${Math.round(file.size / 1024)}KB). Describe the content of this image to explain it to me.`, images: [base64] }]);
    } catch (err) {
      setMessages((m) => [...m, { role: 'assistant', content: 'Error uploading image: ' + (err as Error)?.message }]);
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
        context: 'You are the SmartLogi AI logistics assistant, answering with data from orders, stock and shipments.',
        images: userMsg.images,
      });
      const data = res.data;
      const reply = typeof data?.content === 'string'
        ? data.content
        : (data?.message || 'No reply received.');
      setMessages((m) => [...m, { role: 'assistant', content: reply }]);
    } catch (e: any) {
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: 'Connection error: ' + (e?.message || 'unknown') + '. Please try again.' },
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
        className="fixed bottom-5 right-5 z-50 h-10 border border-line bg-surface px-3 text-[12px] font-semibold text-accent transition-colors hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
        aria-label="Open AI assistant"
      >
        Ask AI
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex h-[580px] w-[420px] flex-col rounded-lg border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <span className="text-[13px] font-semibold text-ink">AI assistant — SmartLogi</span>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setMessages([]);
            setPendingImages([]);
          }}
          className="h-8 w-8 rounded-md text-[13px] font-medium text-ink-soft hover:bg-surface-alt hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 ? (
          <div className="space-y-2">
            <p className="text-[12px] text-ink-soft">
              Hello! I am your AI logistics analytics assistant. I can help you:
            </p>
            <ul className="text-[12px] text-ink-soft space-y-1 list-disc list-inside">
              <li>Explain the platform: orders, stock, shipments and admin.</li>
              <li>Analyze data, forecast demand and delivery times.</li>
              <li>Read images (upload one to analyze).</li>
            </ul>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className="space-y-1">
              <div
                className={
                  m.role === 'user'
                    ? 'ml-auto max-w-[85%] rounded-md bg-line-strong px-3 py-2 text-[13px] text-ink'
                    : 'mr-auto max-w-[85%] rounded-md bg-surface-alt px-3 py-2 text-[13px] text-ink'
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
                      alt="Uploaded image"
                      className="mt-1 max-w-[120px] max-h-[80px] rounded-md object-cover border border-line"
                    />
                  ))}
                </div>
              )}
            </div>
          ))
        )}
        {loading && (
          <div className="mr-auto max-w-[85%] rounded-md bg-surface-alt px-3 py-2 text-[13px] text-inkSoft">
            <span className="inline-flex items-center gap-1">
              <span className="animate-pulse">Analyzing</span>
            </span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-line px-3 py-2">
        {pendingImages.length > 0 && (
          <div className="mb-2 flex gap-2 overflow-x-auto">
            {pendingImages.map((img, i) => (
              <img
                key={`pending-${i}`}
                src={img}
                alt="Preview"
                className="h-16 w-16 rounded-md object-cover border border-line"
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
            aria-label="Upload image"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading || pendingImages.length >= 3}
            className="h-9 w-9 rounded-md border border-line bg-surface-alt p-0 text-ink-soft hover:text-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 disabled:opacity-50"
            aria-label="Upload image"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 9c.75 0 1.53.16 2.24.46A5.94 5.94 0 0012 3.96c1.42 0 2.73.5 3.76 1.34A5.99 5.99 0 0021 9c0 .6-.09 1.17-.26 1.71A3 3 0 0119 15h-2.24A5.95 5.95 0 0112 20.04c-2.56 0-4.75-1.66-5.5-4.04A6.01 6.01 0 013 15V9z" />
            </svg>
          </button>
          <input
            className="flex-1 rounded-md border border-line bg-surface-alt px-3 py-2 text-[13px] text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/20"
            placeholder="Ask a question..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (pendingImages.length > 0 || input.trim()) && send()}
            disabled={loading}
          />
          <button
            type="button"
            onClick={send}
            disabled={loading || (!input.trim() && pendingImages.length === 0)}
            className="rounded-md bg-accent px-3 py-2 text-[13px] font-medium text-white transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 disabled:opacity-50"
          >
            {loading ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
