FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat openssl && corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app

# Copy các file cấu hình workspace
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc tsconfig.base.json ./
COPY packages/prisma-schemas/package.json ./packages/prisma-schemas/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/wms-engine/package.json ./packages/wms-engine/
COPY backend/core-api/package.json ./backend/core-api/

# Copy mã nguồn các gói cần thiết
COPY packages/ ./packages/
COPY backend/core-api/ ./backend/core-api/

# Sử dụng --no-frozen-lockfile để pnpm có thể tự điều chỉnh khi thiếu các workspace members không liên quan
RUN pnpm install --no-frozen-lockfile

# Build các dependency nội bộ trước
RUN pnpm --filter shared-types build
RUN pnpm --filter wms-engine build
RUN pnpm --filter prisma-schemas exec prisma generate

RUN pnpm --filter core-api build
RUN pnpm deploy --filter core-api --prod /prod/app
RUN cp -r /app/packages/prisma-schemas/prisma /prod/app/prisma && \
    cd /prod/app && pnpm exec prisma generate

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl

COPY --from=builder /prod/app ./

EXPOSE 3000
CMD ["node", "dist/main.js"]
