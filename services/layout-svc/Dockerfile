# Layout Service Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY pnpm-workspace.yaml ./
COPY tsconfig.base.json ./
COPY packages/ ./packages/
COPY layout-svc/ ./layout-svc/

RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @insurai/types build
RUN pnpm --filter @insurai/layout-svc build

FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache tini curl

COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/types/package.json ./packages/types/
COPY --from=builder /app/layout-svc/dist ./layout-svc/dist
COPY --from=builder /app/layout-svc/package.json ./layout-svc/
COPY --from=builder /app/node_modules ./node_modules

WORKDIR /app/layout-svc

EXPOSE 4005

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
