/** @type {import('next').NextConfig} */
const isVercel = process.env.VERCEL === '1';

// `output: 'standalone'` is only needed for Docker self-hosting.
// On Vercel the platform's own build pipeline is used instead.
const nextConfig = {
  ...(isVercel ? {} : { output: 'standalone' }),
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: true },
  reactStrictMode: true,
  async rewrites() {
    // API Gateway proxy — only active when API_INTERNAL_URL is set.
    // In Docker:  API_INTERNAL_URL = http://api-gateway:3000 (docker service name)
    // On Vercel:  API_INTERNAL_URL = https://api.your-domain.com (must be set as env var)
    const gateway = process.env.API_INTERNAL_URL;
    if (!gateway) return [];
    return [
      {
        source: '/api/v1/:path*',
        destination: `${gateway}/api/v1/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
