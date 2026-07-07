# ─── Sandbox image for isolated shell execution ────────────────────────
FROM node:22-bookworm-slim AS ego-sandbox

RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    grep \
    findutils \
    coreutils \
    curl \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable

# Non-root user for extra safety.
RUN useradd --create-home sandbox
USER sandbox
WORKDIR /workspace

ENTRYPOINT ["/bin/sh"]

# ─── Full application image ─────────────────────────────────────────────
FROM node:22-bookworm-slim AS ego-app

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
COPY scenarios ./scenarios
COPY datasets ./datasets
COPY scripts ./scripts

RUN corepack enable && pnpm install --frozen-lockfile && pnpm build

ENTRYPOINT ["node", "apps/ego-cli/dist/index.js"]
