# Preprocess Service Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY pnpm-workspace.yaml ./
COPY tsconfig.base.json ./
COPY packages/ ./packages/
COPY preproc-svc/ ./preproc-svc/

RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @insurai/types build
RUN pnpm --filter @insurai/preproc-svc build

FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache tini curl

COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/types/package.json ./packages/types/
COPY --from=builder /app/preproc-svc/dist ./preproc-svc/dist
COPY --from=builder /app/preproc-svc/package.json ./preproc-svc/
COPY --from=builder /app/node_modules ./node_modules

WORKDIR /app/preproc-svc

EXPOSE 4004

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
