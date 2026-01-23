# Normalize Service Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY pnpm-workspace.yaml ./
COPY tsconfig.base.json ./
COPY packages/ ./packages/
COPY normalize-svc/ ./normalize-svc/

RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @insurai/types build
RUN pnpm --filter @insurai/rule-packs build
RUN pnpm --filter @insurai/normalize-svc build

FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache tini curl

COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/types/package.json ./packages/types/
COPY --from=builder /app/packages/rule-packs/dist ./packages/rule-packs/dist
COPY --from=builder /app/packages/rule-packs/package.json ./packages/rule-packs/
COPY --from=builder /app/normalize-svc/dist ./normalize-svc/dist
COPY --from=builder /app/normalize-svc/package.json ./normalize-svc/
COPY --from=builder /app/node_modules ./node_modules

WORKDIR /app/normalize-svc

EXPOSE 4008

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
