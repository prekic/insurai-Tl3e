# Workflow Service Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace files
COPY package*.json ./
COPY pnpm-workspace.yaml ./
COPY tsconfig.base.json ./

# Copy packages
COPY packages/ ./packages/

# Copy service
COPY workflow/ ./workflow/

# Install dependencies
RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile

# Build
RUN pnpm --filter @insurai/types build
RUN pnpm --filter @insurai/workflow-svc build

# Production stage
FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache tini

# Copy built artifacts
COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/types/package.json ./packages/types/
COPY --from=builder /app/workflow/dist ./workflow/dist
COPY --from=builder /app/workflow/package.json ./workflow/
COPY --from=builder /app/node_modules ./node_modules

WORKDIR /app/workflow

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
