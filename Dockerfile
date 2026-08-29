# ============================================================================
# WebPilot AI — All-in-One Dockerfile
# Enthält: Next.js App + Playwright/Chromium Browser-Engine
# ============================================================================

# --- Build-Stage -------------------------------------------------------------
FROM node:20-bookworm AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund

COPY . .
RUN npm run build

# --- Runtime-Stage -----------------------------------------------------------
FROM node:20-bookworm AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    BROWSER_HEADLESS=true

# Vollständige App inkl. node_modules übernehmen
# (Playwright wird bewusst nicht gebündelt, sondern zur Laufzeit geladen)
COPY --from=builder /app ./

# Chromium + Systemabhängigkeiten installieren (~450 MB)
RUN npx playwright install --with-deps chromium \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

EXPOSE 3000

# Tabellen werden beim Start automatisch angelegt (instrumentation.ts)
CMD ["npm", "run", "start"]
