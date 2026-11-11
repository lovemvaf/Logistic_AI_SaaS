FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat openssl && corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc tsconfig.base.json ./
COPY packages/prisma-schemas/package.json ./packages/prisma-schemas/
COPY packages/shared-types/package.json ./packages/shared-types/

COPY packages/prisma-schemas/ ./packages/prisma-schemas/
COPY packages/shared-types/src ./packages/shared-types/src

RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter prisma-schemas exec prisma generate

# Runner stage
FROM node:20-alpine AS runner
ENV NODE_ENV=production
RUN apk add --no-cache openssl postgresql-client && corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/package.json ./
COPY --from=builder /app/tsconfig.base.json ./

WORKDIR /app/packages/prisma-schemas
CMD ["sh", "./docker-entrypoint.sh"]
