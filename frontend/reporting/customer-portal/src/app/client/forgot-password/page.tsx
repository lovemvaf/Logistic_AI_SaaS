'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import {
  EditorialPageHeader,
  EditorialSection,
  EmptyNote,
  StatusLabel,
} from 'ui-kit';
import { Input, Button } from 'ui-components';

/** Gửi yêu cầu quên mật khẩu theo JWT lưu trong session khách hàng. */

export default function ClientForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (!email) {
      setError('Vui lòng nhập địa chỉ email.');
      return;
    }
    setLoading(true);
    try {
      await api.post('/client/auth/forgot-password', { email });
      setSent(true);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Không thể gửi yêu cầu.');
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <EditorialSection>
        <div className="space-y-4">
          <EditorialPageHeader
            title="Đã gửi email"
            description={
              <em>
                {email} — nếu tài khoản đăng ký với địa chỉ này, email liên kết đặt
                lại mật khẩu đã được gửi đến hộp thư.
              </em>
            }
          />
          <EmptyNote>
            Không nhận được? Hãy kiểm tra thư mục spam hoặc yêu cầu lại liên kết.
          </EmptyNote>
          <div>
            <Link
              href="/client/login"
              className="text-[12px] font-medium text-accent underline decoration-accent/30 underline-offset-2 hover:decoration-accent"
            >
              Về trang đăng nhập
            </Link>
          </div>
        </div>
      </EditorialSection>
    );
  }

  return (
    <EditorialSection>
      <div className="space-y-4">
        <EditorialPageHeader
          title="Đặt lại mật khẩu"
          description="Nhập địa chỉ email doanh nghiệp, chúng tôi sẽ gửi liên kết đặt lại mật khẩu."
        />
        <form onSubmit={handleSubmit} className="space-y-4">
          {error ? (
            <div className="flex items-center gap-2 rounded-md border-l-2 border-danger bg-surface px-3 py-2">
              <StatusLabel tone="danger">{error}</StatusLabel>
            </div>
          ) : null}
          <Input
            id="forgot-email"
            type="email"
            label="Email công ty"
            placeholder="you@company.com"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={loading}
          />
          <Button
            type="submit"
            variant="primary"
            className="h-11 w-full text-[13px] font-semibold rounded-lg"
            disabled={loading}
          >
            {loading ? 'Đang gửi…' : 'Gửi liên kết'}
          </Button>
        </form>
        <div>
          <Link
            href="/client/login"
            className="text-[12px] font-medium text-ink-soft hover:text-ink"
          >
            Đã nhớ mật khẩu? Về trang đăng nhập
          </Link>
        </div>
      </div>
    </EditorialSection>
  );
}
