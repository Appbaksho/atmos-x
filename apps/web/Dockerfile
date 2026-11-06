# Production image: Next.js standalone server. NEXT_PUBLIC_* values are inlined at build time, so
# they arrive as build args; secrets (OPENAI_API_KEY) are runtime-only and never enter the image.
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:24-slim AS build
WORKDIR /app
ARG ATMOS_BUILD_ID=
ARG NEXT_PUBLIC_APP_URL=
ARG NEXT_PUBLIC_MAP_STYLE_URL=
ARG NEXT_PUBLIC_MAP_STYLE_URL_DARK=
ARG NEXT_PUBLIC_DEMO_LAT=
ARG NEXT_PUBLIC_DEMO_LNG=
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-slim AS run
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
# Docker sets HOSTNAME to the container id; server.js must bind to all interfaces.
ENV HOSTNAME=0.0.0.0
ENV ATMOS_CACHE_DIR=/data/cache
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# Created before USER so a fresh named volume inherits the node user's ownership.
RUN mkdir -p /data/cache && chown -R node:node /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/sw.js').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "server.js"]
