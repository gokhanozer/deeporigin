# =============================================================================
# Frontend image — Next.js (standalone output).
#
# `output: 'standalone'` in next.config.mjs emits a self-contained server plus
# only the node_modules actually reached at runtime, so the final stage never
# needs a full `node_modules` tree.
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: install dependencies
# -----------------------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

# -----------------------------------------------------------------------------
# Stage 2: build
# -----------------------------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# IMPORTANT: NEXT_PUBLIC_* values are inlined into the client bundle at BUILD
# time, not read at runtime. They must therefore be supplied as build args —
# setting them only in `environment:` would leave the browser calling the
# default localhost URL.
ARG NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
ARG NEXT_PUBLIC_SHORT_DOMAIN=localhost:3000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SHORT_DOMAIN=$NEXT_PUBLIC_SHORT_DOMAIN

# Opt out of anonymous build-time telemetry.
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# -----------------------------------------------------------------------------
# Stage 3: runtime
# -----------------------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Bind to all interfaces; the default localhost binding is unreachable from
# outside the container.
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN apk add --no-cache dumb-init

USER node

# `public/` is copied leniently because the directory may not exist — this app
# has no static assets, and a missing path would otherwise fail the build.
COPY --from=builder --chown=node:node /app/public ./public
# The standalone bundle contains server.js and its minimal dependency tree.
COPY --from=builder --chown=node:node /app/.next/standalone ./
# Static assets are excluded from the standalone bundle and must be copied
# separately, or every page loads without CSS or JavaScript.
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
