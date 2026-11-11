'use client';

import { useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import api from '@/lib/api';
import { setToken, setUser } from '@/lib/auth';
import { useRouter } from 'next/navigation';

interface GoogleLoginButtonProps {
  tenantSlug?: string;
  onError?: (msg: string) => void;
}

const ROLE_REDIRECT: Record<string, string> = {
  TENANT_ADMIN: '/dashboard',
  WAREHOUSE_MANAGER: '/dashboard',
  WAREHOUSE_STAFF: '/dashboard',
};

export function GoogleLoginButton({ tenantSlug, onError }: GoogleLoginButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
              '/tenant/auth/google',
              { credential: credentialResponse.credential },
              {
                headers: {
                  'x-tenant-slug': tenantSlug,
                  'x-portal': 'pack-station',
                },
              },
            );

            if (!res.data?.accessToken) {
              fail(res.data?.message || 'Google authentication failed.');
              return;
            }

            const role = res.data.role || 'WAREHOUSE_STAFF';
            setToken(res.data.accessToken);
            setUser({ role, slug: tenantSlug });
            router.push(ROLE_REDIRECT[role] || '/dashboard');
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
