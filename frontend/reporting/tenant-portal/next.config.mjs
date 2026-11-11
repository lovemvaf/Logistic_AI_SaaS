/** @type {import('next').NextConfig} */
const isVercel = process.env.VERCEL === '1';

const nextConfig = {
  ...(isVercel ? {} : { output: 'standalone' }),
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: true },
  reactStrictMode: true,
  async rewrites() {
    const rawGateway = process.env.API_INTERNAL_URL || (isVercel ? '' : 'http://api-gateway:3000');
    const gateway = rawGateway.replace(/\/api\/v1\/?$/, '').replace(/\/+$/, '');
    if (!gateway) return [];
    return [
      {
        source: '/api/v1/:path*',
        destination: `${gateway}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
