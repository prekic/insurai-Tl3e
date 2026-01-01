# =============================================================================
# InsurAI Multi-Stage Dockerfile
# Builds both frontend and backend for production deployment
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Base - Common dependencies
# -----------------------------------------------------------------------------
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat

# -----------------------------------------------------------------------------
# Stage 2: Dependencies - Install npm packages
# -----------------------------------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --include=dev

# -----------------------------------------------------------------------------
# Stage 3: Build Frontend
# -----------------------------------------------------------------------------
FROM base AS build-frontend
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build arguments for frontend configuration
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_API_PROXY_URL
ARG VITE_APP_URL
ARG VITE_SENTRY_DSN
ARG VITE_APP_VERSION

# Set environment variables for build
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ENV VITE_API_PROXY_URL=$VITE_API_PROXY_URL
ENV VITE_APP_URL=$VITE_APP_URL
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN
ENV VITE_APP_VERSION=$VITE_APP_VERSION

RUN npm run build

# -----------------------------------------------------------------------------
# Stage 4: Build Backend
# -----------------------------------------------------------------------------
FROM base AS build-backend
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build:server

# -----------------------------------------------------------------------------
# Stage 5: Production - Frontend (Nginx)
# -----------------------------------------------------------------------------
FROM nginx:alpine AS frontend
COPY --from=build-frontend /app/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/nginx.conf

# Security headers and compression
RUN rm /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

# -----------------------------------------------------------------------------
# Stage 6: Production - Backend (Node.js)
# -----------------------------------------------------------------------------
FROM node:20-alpine AS backend
WORKDIR /app

# Install production dependencies only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy built server code
COPY --from=build-backend /app/dist-server ./dist-server
COPY --from=build-backend /app/server ./server

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001
USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${API_PORT:-3001}/health || exit 1

ENV NODE_ENV=production
ENV API_PORT=3001

EXPOSE 3001
CMD ["node", "dist-server/index.js"]

# -----------------------------------------------------------------------------
# Stage 7: Full Stack - Combined for simpler deployment
# -----------------------------------------------------------------------------
FROM node:20-alpine AS fullstack
WORKDIR /app

# Install nginx
RUN apk add --no-cache nginx

# Copy frontend build
COPY --from=build-frontend /app/dist /usr/share/nginx/html
COPY docker/nginx-fullstack.conf /etc/nginx/nginx.conf

# Install production dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy backend build
COPY --from=build-backend /app/dist-server ./dist-server

# Create startup script
COPY docker/start.sh /start.sh
RUN chmod +x /start.sh

ENV NODE_ENV=production
ENV API_PORT=3001

EXPOSE 80 3001
CMD ["/start.sh"]
