import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-8">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6 text-slate-300">
          <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="text-6xl font-bold text-ink mb-4">404</h1>
        <h2 className="text-xl font-bold text-ink mb-2">Page Not Found</h2>
        <p className="text-slate-500 mb-8">The page you are looking for does not exist or has been moved.</p>
        <Link href="/dashboard" className="inline-flex items-center px-6 py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary/90 transition-colors">
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}
