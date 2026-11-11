'use client';

import { useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { setSession } from '@/lib/auth';

interface GoogleLoginButtonProps {
  tenantSlug?: string;
  onError?: (message: string) => void;
}

const ROLE_REDIRECT: Record<string, string> = {
  TENANT_ADMIN: '/dashboard',
  TENANT_USER: '/dashboard',
  WAREHOUSE_MANAGER: '/dashboard',
  WAREHOUSE_STAFF: '/dashboard',
  LOGISTICS_MANAGER: '/logistics/dispatch',
  DRIVER: '/drivers/my-trips',
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
            fail('Please enter your tenant ID before signing in with Google.');
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
                  'x-portal': 'tenant',
                },
              },
            );

            if (!res.data?.accessToken) {
              fail(res.data?.message || 'Google authentication failed.');
              return;
            }

            setSession(res.data.accessToken);
            localStorage.setItem('smartlogi_tenant_slug', tenantSlug);
            const role = res.data.role || 'TENANT_USER';
            router.replace(ROLE_REDIRECT[role] || '/dashboard');
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
