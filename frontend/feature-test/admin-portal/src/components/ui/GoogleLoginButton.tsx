import { GoogleLogin } from '@react-oauth/google';

interface GoogleLoginButtonProps {
  onSuccess: (credential: string) => void;
  onError?: (error: string) => void;
  loading?: boolean;
  fullWidth?: boolean;
}

export function GoogleLoginButton({
  onSuccess,
  onError,
  loading,
  fullWidth = true,
}: GoogleLoginButtonProps) {
  return (
    <div className={fullWidth ? 'w-full' : ''}>
      <GoogleLogin
        shape="rectangular"
        theme="outline"
        size="large"
        containerProps={fullWidth ? { className: 'w-full' } : undefined}
        onSuccess={(credentialResponse) => {
          if (credentialResponse?.credential) {
            onSuccess(credentialResponse.credential);
          }
        }}
        onError={() => {
          onError?.('Google login failed');
        }}
      />
      {loading && (
        <div className="mt-2 flex items-center justify-center gap-2 text-sm text-slate-500">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          </svg>
          Signing in…
        </div>
      )}
    </div>
  );
}
