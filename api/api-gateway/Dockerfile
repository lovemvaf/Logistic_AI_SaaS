FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat openssl && corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app

# Copy các file cấu hình workspace
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc tsconfig.base.json ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY api/api-gateway/package.json ./api/api-gateway/

# Copy mã nguồn các gói cần thiết
COPY packages/ ./packages/
COPY api/api-gateway/ ./api/api-gateway/

# Sử dụng --no-frozen-lockfile để pnpm có thể tự điều chỉnh khi thiếu các workspace members không liên quan
RUN pnpm install --no-frozen-lockfile

# Build các dependency nội bộ trước
RUN pnpm --filter shared-types build

RUN pnpm --filter api-gateway build
RUN pnpm deploy --filter api-gateway --prod /prod/app

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /prod/app ./

EXPOSE 3000
CMD ["node", "dist/main.js"]
