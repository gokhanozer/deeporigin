# =============================================================================
# Backend image — NestJS + Prisma.
#
# Multi-stage: the toolchain (TypeScript, the Nest CLI, dev dependencies) is
# needed to *build* but is dead weight at runtime. Only the compiled output and
# production dependencies are copied into the final stage, which keeps the
# shipped image small and shrinks the attack surface.
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: install dependencies
# -----------------------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app

# Copy manifests only. Docker caches this layer, so `npm ci` re-runs when the
# dependencies change — not on every source edit.
COPY package.json package-lock.json* ./
RUN npm ci

# -----------------------------------------------------------------------------
# Stage 2: build
# -----------------------------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Prisma Client is generated code; it must exist before tsc type-checks against it.
RUN npx prisma generate
RUN npm run build

# Drop dev dependencies now that compilation is done. `prisma generate` is
# re-run afterwards because pruning removes the generated client along with
# the dev-only `prisma` CLI package.
RUN npm prune --omit=dev && npx prisma generate

# -----------------------------------------------------------------------------
# Stage 3: runtime
# -----------------------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# `dumb-init` becomes PID 1 so SIGTERM reaches Node. Without it, Node runs as
# PID 1, ignores the default signal handlers, and `docker stop` has to wait for
# the 10-second timeout before killing the container.
RUN apk add --no-cache dumb-init

# Run as a non-root user. `node` already exists in the base image.
USER node

COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/prisma ./prisma
COPY --from=builder --chown=node:node /app/package.json ./package.json

EXPOSE 4000

# Lets Docker/compose distinguish "started" from "actually serving".
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
