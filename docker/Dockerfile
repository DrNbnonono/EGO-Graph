FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
COPY scenarios ./scenarios
COPY datasets ./datasets
COPY scripts ./scripts

RUN corepack enable && pnpm install --frozen-lockfile && pnpm build

ENTRYPOINT ["node", "apps/ego-cli/dist/index.js"]
