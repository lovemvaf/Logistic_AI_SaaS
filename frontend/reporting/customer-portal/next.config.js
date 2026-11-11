const path = require('path');

/** @type {import('next').NextConfig} */
const isVercel = process.env.VERCEL === '1';

const nextConfig = {
  ...(isVercel ? {} : { output: 'standalone' }),
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: true },
  reactStrictMode: true,
  serverExternalPackages: ['@prisma/client', 'prisma', 'bcryptjs'],
  outputFileTracingRoot: path.join(__dirname, '../../..'),
  outputFileTracingIncludes: {
    '/api/v1/[[...path]]': [
      '../../../node_modules/.prisma/client/**/*',
      '../../../node_modules/@prisma/client/**/*',
      '../../../node_modules/.pnpm/@prisma+client@*/node_modules/.prisma/client/**/*',
      '../../../node_modules/.pnpm/@prisma+client@*/node_modules/@prisma/client/**/*',
    ],
  },
  async rewrites() {
    const rawGateway = process.env.API_INTERNAL_URL || '';
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

module.exports = nextConfig;
