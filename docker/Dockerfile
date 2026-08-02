# ─── Stage 1: Build ──────────────────────────────────────────────
FROM node:22-slim AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy workspace config
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/siyuan-sdk/package.json packages/siyuan-sdk/tsconfig.json packages/siyuan-sdk/tsup.config.ts ./packages/siyuan-sdk/
COPY packages/siyuan-mcp/package.json packages/siyuan-mcp/tsconfig.json packages/siyuan-mcp/tsup.config.ts ./packages/siyuan-mcp/

# Install dependencies
RUN pnpm install --frozen-lockfile || pnpm install

# Copy source code
COPY packages/ ./packages/

# Build all packages
RUN pnpm -r run build

# ─── Stage 2: Runtime ────────────────────────────────────────────
FROM node:22-slim AS runtime

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy workspace config
COPY package.json pnpm-workspace.yaml ./
COPY packages/siyuan-sdk/package.json ./packages/siyuan-sdk/
COPY packages/siyuan-mcp/package.json ./packages/siyuan-mcp/

# Install production dependencies only
RUN pnpm install --prod || pnpm install --prod

# Copy built output
COPY --from=builder /app/packages/siyuan-sdk/dist ./packages/siyuan-sdk/dist
COPY --from=builder /app/packages/siyuan-mcp/dist ./packages/siyuan-mcp/dist

# Copy .env.example as reference
COPY .env.example ./

# Set environment
ENV NODE_ENV=production
ENV TRANSPORT=sse
ENV PORT=3000
ENV LOG_LEVEL=info

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

EXPOSE 3000

CMD ["node", "packages/siyuan-mcp/dist/index.js"]
