/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  async rewrites() {
    // All API traffic is proxied to the API Gateway. This keeps SSR requests
    // working inside Docker (where 127.0.0.1 points at the portal container,
    // not at the backend services).
    const gateway = process.env.API_INTERNAL_URL || 'http://api-gateway:3000';
    return [
      {
        source: '/api/v1/:path*',
        destination: `${gateway}/api/v1/:path*`,
      },
    ];
  },

};

export default nextConfig;
