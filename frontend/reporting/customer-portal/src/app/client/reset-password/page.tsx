'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import api from '@/lib/api';
import {
  EditorialPageHeader,
  EditorialSection,
  StatusLabel,
} from 'ui-kit';
import { Input, Button } from 'ui-components';

/** Đặt lại mật khẩu bằng token nhận được qua email. */

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const email = searchParams.get('email') ?? '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('Mật khẩu mới không khớp.');
      return;
    }
    if (password.length < 8) {
      setError('Mật khẩu mới phải có ít nhất 8 ký tự.');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post('/client/auth/reset-password', { email, token, password });
      if (res.data?.ok) {
        setSuccess(true);
      } else {
        setError(res.data?.message || 'Không thể xác thực yêu cầu.');
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Liên kết đã hết hạn, vui lòng yêu cầu lại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <EditorialSection>
      <div className="space-y-4">
        {success ? (
          <EditorialPageHeader
            title="Đã đặt lại mật khẩu"
            description="Mật khẩu của bạn đã được cập nhật. Hãy đăng nhập lại."
          />
        ) : (
          <EditorialPageHeader
            title="Đặt lại mật khẩu"
            description={`Đặt lại mật khẩu cho tài khoản ${email}.`}
          />
        )}
        {!success ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error ? (
              <div className="flex items-center gap-2 rounded-md border-l-2 border-danger bg-surface px-3 py-2">
                <StatusLabel tone="danger">{error}</StatusLabel>
              </div>
            ) : null}
            <Input
              id="new-password"
              type="password"
              label="Mật khẩu mới"
              placeholder="Tối thiểu 8 ký tự"
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={loading}
            />
            <Input
              id="confirm-password"
              type="password"
              label="Xác nhận mật khẩu mới"
              placeholder="Nhập lại mật khẩu"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              disabled={loading}
            />
            <Button
              type="submit"
              variant="primary"
              className="h-11 w-full text-[13px] font-semibold rounded-lg"
              disabled={loading}
            >
              {loading ? 'Đang đặt lại…' : 'Đặt lại mật khẩu'}
            </Button>
          </form>
        ) : null}
        <div>
          <Link
            href={success ? '/client/login' : '/client/forgot-password'}
            className="text-[12px] font-medium text-ink-soft hover:text-ink"
          >
            {success ? 'Về trang đăng nhập' : 'Yêu cầu liên kết mới'}
          </Link>
        </div>
      </div>
    </EditorialSection>
  );
}

export default function ClientResetPassword() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const email = searchParams.get('email') ?? '';

  if (!token || !email) {
    return (
      <EditorialSection>
        <div className="space-y-4">
          <EditorialPageHeader title="Liên kết không hợp lệ" description="Liên kết đặt lại mật khẩu này đã hết hạn hoặc không hợp lệ." />
          <div>
            <Link href="/client/forgot-password" className="text-[12px] font-medium text-accent underline decoration-accent/30 underline-offset-2 hover:decoration-accent">
              Yêu cầu liên kết đặt lại mật khẩu mới
            </Link>
          </div>
        </div>
      </EditorialSection>
    );
  }

  return <ResetPasswordForm />;
}
