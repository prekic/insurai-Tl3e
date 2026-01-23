# Extract Service Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY pnpm-workspace.yaml ./
COPY tsconfig.base.json ./
COPY packages/ ./packages/
COPY extract-svc/ ./extract-svc/

RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @insurai/types build
RUN pnpm --filter @insurai/extract-svc build

FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache tini curl

COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/types/package.json ./packages/types/
COPY --from=builder /app/extract-svc/dist ./extract-svc/dist
COPY --from=builder /app/extract-svc/package.json ./extract-svc/
COPY --from=builder /app/node_modules ./node_modules

WORKDIR /app/extract-svc

EXPOSE 4010

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
