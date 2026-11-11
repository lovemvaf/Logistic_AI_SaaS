/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: true },
  reactStrictMode: true,
  output: 'standalone',
  async rewrites() {
    const gateway = process.env.API_INTERNAL_URL || 'http://api-gateway:3000';
    return [
      {
        source: '/api/v1/:path*',
        destination: `${gateway}/api/v1/:path*`,
      },
    ];
  },
}

module.exports = nextConfig
