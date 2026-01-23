# Render Service Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY pnpm-workspace.yaml ./
COPY tsconfig.base.json ./
COPY packages/ ./packages/
COPY render-svc/ ./render-svc/

RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @insurai/types build
RUN pnpm --filter @insurai/render-svc build

FROM node:20-alpine

WORKDIR /app

# Install poppler for PDF rendering
RUN apk add --no-cache tini curl poppler-utils

COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/types/package.json ./packages/types/
COPY --from=builder /app/render-svc/dist ./render-svc/dist
COPY --from=builder /app/render-svc/package.json ./render-svc/
COPY --from=builder /app/node_modules ./node_modules

WORKDIR /app/render-svc

EXPOSE 4003

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
