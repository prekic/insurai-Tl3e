# Reconcile Service Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY pnpm-workspace.yaml ./
COPY tsconfig.base.json ./
COPY packages/ ./packages/
COPY reconcile-svc/ ./reconcile-svc/

RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @insurai/types build
RUN pnpm --filter @insurai/reconcile-svc build

FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache tini curl

COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/types/package.json ./packages/types/
COPY --from=builder /app/reconcile-svc/dist ./reconcile-svc/dist
COPY --from=builder /app/reconcile-svc/package.json ./reconcile-svc/
COPY --from=builder /app/node_modules ./node_modules

WORKDIR /app/reconcile-svc

EXPOSE 4007

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
