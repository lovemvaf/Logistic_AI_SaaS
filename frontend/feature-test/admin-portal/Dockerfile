FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat openssl && corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app

# Copy configuration files
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc tsconfig.base.json ./
COPY packages/prisma-schemas/package.json ./packages/prisma-schemas/
COPY packages/ui-components/package.json ./packages/ui-components/
COPY packages/ui-kit/package.json ./packages/ui-kit/
COPY frontend/feature-test/admin-portal/package.json ./frontend/feature-test/admin-portal/

# Copy source code
COPY packages/ ./packages/
COPY frontend/feature-test/admin-portal/ ./frontend/feature-test/admin-portal/

RUN pnpm install --no-frozen-lockfile --filter admin-portal...

# NEXT_PUBLIC_* values are inlined into the client bundle at BUILD time,
# so they must be build args (runtime env has no effect on the browser bundle).
ARG NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_GOOGLE_CLIENT_ID=$NEXT_PUBLIC_GOOGLE_CLIENT_ID

RUN pnpm --filter ui-components build
RUN pnpm --filter ui-kit build
RUN pnpm --filter admin-portal build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_PUBLIC_GOOGLE_CLIENT_ID=${NEXT_PUBLIC_GOOGLE_CLIENT_ID}

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Next.js standalone mode output
COPY --from=builder /app/frontend/feature-test/admin-portal/public ./frontend/feature-test/admin-portal/public
COPY --from=builder --chown=nextjs:nodejs /app/frontend/feature-test/admin-portal/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/frontend/feature-test/admin-portal/.next/static ./frontend/feature-test/admin-portal/.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "frontend/feature-test/admin-portal/server.js"]
