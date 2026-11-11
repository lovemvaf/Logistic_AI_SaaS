'use client';

import { useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

interface GoogleLoginButtonProps {
  tenantSlug?: string;
  onError?: (msg: string) => void;
}

export function GoogleLoginButton({ tenantSlug, onError }: GoogleLoginButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { login } = useAuth();
  const router = useRouter();

  const fail = (message: string) => {
    setError(message);
    onError?.(message);
  };

  return (
    <div className={loading ? 'pointer-events-none opacity-60' : undefined}>
      <GoogleLogin
        shape="rectangular"
        theme="outline"
        size="large"
        width={360}
        onSuccess={async (credentialResponse) => {
          if (!credentialResponse?.credential) return;
          if (!tenantSlug) {
            fail('Please enter your workspace slug before signing in with Google.');
            return;
          }

          setLoading(true);
          setError(null);
          try {
            const res = await api.post(
              '/client/auth/google',
              { credential: credentialResponse.credential },
              {
                headers: {
                  'x-tenant-slug': tenantSlug,
                  'x-portal': 'customer',
                },
              },
            );

            if (!res.data?.accessToken) {
              fail(res.data?.message || 'Google authentication failed.');
              return;
            }

            login(res.data.accessToken);
            router.push('/client/dashboard');
          } catch (err: any) {
            fail(
              err?.response?.data?.message ||
                'Google authentication failed. Please try again.',
            );
          } finally {
            setLoading(false);
          }
        }}
        onError={() => fail('Google sign-in was cancelled or failed.')}
      />

      {error && (
        <p className="mt-2 text-center text-xs text-rose-600">{error}</p>
      )}
    </div>
  );
}
