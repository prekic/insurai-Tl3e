# Validate Service Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY pnpm-workspace.yaml ./
COPY tsconfig.base.json ./
COPY packages/ ./packages/
COPY validate-svc/ ./validate-svc/

RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @insurai/types build
RUN pnpm --filter @insurai/rule-packs build
RUN pnpm --filter @insurai/validate-svc build

FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache tini curl

COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/types/package.json ./packages/types/
COPY --from=builder /app/packages/rule-packs/dist ./packages/rule-packs/dist
COPY --from=builder /app/packages/rule-packs/package.json ./packages/rule-packs/
COPY --from=builder /app/validate-svc/dist ./validate-svc/dist
COPY --from=builder /app/validate-svc/package.json ./validate-svc/
COPY --from=builder /app/node_modules ./node_modules

WORKDIR /app/validate-svc

EXPOSE 4009

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
