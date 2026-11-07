FROM node:24-bookworm-slim AS base

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
COPY docker/app/entrypoint.sh /usr/local/bin/partners-entrypoint
RUN chmod 0555 /usr/local/bin/partners-entrypoint

FROM base AS deps

COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS builder

COPY . .
ARG APP_BASE_URL
ENV APP_BASE_URL=${APP_BASE_URL} \
    NODE_ENV=production
RUN DATABASE_URL=mysql://build:build@127.0.0.1:3306/europodlahy \
    MIGRATE_DATABASE_URL=mysql://build:build@127.0.0.1:3306/europodlahy \
    AUTH_SECRET=build-only-placeholder-secret-not-for-runtime \
    AUTH_TRUST_HOST=true \
    LOCAL_QUICK_LOGIN_ENABLED=false \
    npm run build

FROM base AS runner

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    TZ=UTC \
    LOCAL_QUICK_LOGIN_ENABLED=false

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/partners-entrypoint"]
CMD ["node", "server.js"]
