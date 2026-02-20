# InsurAI Deployment Guide — Alternative Options

> **⚠️ This is a legacy guide** for Docker-based and alternative platform deployments (Vercel, Fly.io, AWS).
> For the **current Railway monorepo production deployment**, see [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md).

This guide covers alternative ways to deploy InsurAI beyond the primary Railway setup.

## Table of Contents

- [Quick Start](#quick-start)
- [Environments](#environments)
- [Docker Deployment](#docker-deployment)
- [Cloud Platforms](#cloud-platforms)
- [CI/CD Pipeline](#cicd-pipeline)
- [Environment Variables](#environment-variables)
- [Monitoring](#monitoring)

---

## Quick Start

### Local Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

### Docker (Local)

```bash
# Build and run with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f app
```

### Staging

```bash
# Build for staging
docker-compose -f docker-compose.staging.yml build

# Deploy
docker-compose -f docker-compose.staging.yml up -d
```

---

## Environments

| Environment | URL | Purpose |
|------------|-----|---------|
| Development | `http://localhost:5173` | Local development |
| Staging | `https://staging.insurai.app` | Pre-production testing |
| Production | `https://insurai.app` | Live application |

### Environment Files

- `.env.local` - Local development (not committed)
- `.env.staging` - Staging template (secrets in CI/CD)
- `.env.production` - Production template (secrets in CI/CD)

---

## Docker Deployment

### Build Targets

The Dockerfile supports multiple build targets:

```bash
# Frontend only (Nginx)
docker build --target frontend -t insurai-frontend .

# Backend only (Node.js)
docker build --target backend -t insurai-backend .

# Full stack (Nginx + Node.js)
docker build --target fullstack -t insurai .
```

### Build Arguments

Pass Vite environment variables at build time:

```bash
docker build \
  --build-arg VITE_SUPABASE_URL=https://xxx.supabase.co \
  --build-arg VITE_SUPABASE_ANON_KEY=xxx \
  --build-arg VITE_API_PROXY_URL=https://api.example.com \
  --build-arg VITE_APP_VERSION=1.0.0 \
  --target fullstack \
  -t insurai .
```

### Running Containers

```bash
# Frontend only
docker run -p 80:80 insurai-frontend

# Backend only
docker run -p 4001:4001 \
  -e OPENAI_API_KEY=sk-xxx \
  -e ANTHROPIC_API_KEY=sk-ant-xxx \
  insurai-backend

# Full stack
docker run -p 80:80 -p 4001:4001 \
  -e OPENAI_API_KEY=sk-xxx \
  -e ANTHROPIC_API_KEY=sk-ant-xxx \
  insurai
```

---

## Cloud Platforms

### Vercel (Frontend)

1. Connect GitHub repository
2. Set Framework Preset to "Vite"
3. Configure environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_API_PROXY_URL`
   - `VITE_SENTRY_DSN`

### Railway (Backend)

1. Create new project from GitHub
2. Configure service settings:
   - Build Command: `npm run build:server`
   - Start Command: `npm run start:server`
3. Set environment variables:
   - `OPENAI_API_KEY`
   - `ANTHROPIC_API_KEY`
   - `FRONTEND_URL`

### Fly.io (Full Stack)

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Launch new app
fly launch

# Deploy
fly deploy

# Set secrets
fly secrets set OPENAI_API_KEY=sk-xxx ANTHROPIC_API_KEY=sk-ant-xxx
```

### AWS (ECS/Fargate)

1. Push image to ECR:
   ```bash
   aws ecr get-login-password | docker login --username AWS --password-stdin ECR_URL
   docker tag insurai:latest ECR_URL/insurai:latest
   docker push ECR_URL/insurai:latest
   ```

2. Create ECS task definition with environment variables

3. Configure Application Load Balancer for ports 80/4001

---

## CI/CD Pipeline

### GitHub Actions

The `.github/workflows/staging.yml` workflow:

1. **Validate** - Runs on every push
   - Linting (`npm run lint`)
   - Type checking (`npm run typecheck`)
   - Tests (`npm test`)

2. **Build** - On main branch
   - Builds Docker image
   - Pushes to container registry

3. **Deploy** - On main branch (after build)
   - Deploys frontend to Vercel
   - Deploys backend to Railway/Fly.io

### Required Secrets

Configure in GitHub Settings → Secrets:

| Secret | Description |
|--------|-------------|
| `STAGING_SUPABASE_URL` | Supabase project URL (staging) |
| `STAGING_SUPABASE_ANON_KEY` | Supabase anonymous key (staging) |
| `STAGING_API_URL` | Backend API URL (staging) |
| `STAGING_APP_URL` | Frontend URL (staging) |
| `VERCEL_TOKEN` | Vercel deployment token |
| `VERCEL_ORG_ID` | Vercel organization ID |
| `VERCEL_PROJECT_ID` | Vercel project ID |
| `RAILWAY_TOKEN` | Railway deployment token |
| `OPENAI_API_KEY` | OpenAI API key |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `SENTRY_DSN` | Sentry error tracking DSN |
| `SENTRY_AUTH_TOKEN` | Sentry auth token for source maps |
| `SENTRY_ORG` | Sentry organization slug |
| `SENTRY_PROJECT` | Sentry project slug |

---

## Environment Variables

### Frontend (Vite)

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase anonymous key |
| `VITE_API_PROXY_URL` | Yes | Backend API URL |
| `VITE_APP_URL` | No | Frontend URL (for CORS) |
| `VITE_SENTRY_DSN` | No | Sentry error tracking DSN |
| `VITE_SENTRY_ENVIRONMENT` | No | Sentry environment tag |
| `VITE_APP_VERSION` | No | App version for tracking |
| `VITE_DEBUG_MODE` | No | Enable debug features |

### Backend (Node.js)

| Variable | Required | Description |
|----------|----------|-------------|
| `NODE_ENV` | Yes | `development`, `staging`, `production` |
| `API_PORT` | No | Server port (default: 4001) |
| `FRONTEND_URL` | Yes | Frontend URL for CORS |
| `OPENAI_API_KEY` | No* | OpenAI API key |
| `ANTHROPIC_API_KEY` | No* | Anthropic API key |
| `GOOGLE_CLOUD_API_KEY` | No* | Google Cloud API key |
| `SENTRY_DSN` | No | Sentry error tracking DSN |
| `SENTRY_ENVIRONMENT` | No | Sentry environment tag |
| `APP_VERSION` | No | App version for Sentry releases |

*At least one AI provider key required for AI features.

### Rate Limiting

| Variable | Default | Description |
|----------|---------|-------------|
| `RATE_LIMIT_WINDOW_MS` | 900000 | Rate limit window (15 min) |
| `RATE_LIMIT_MAX` | 100 | Max requests per window |
| `RATE_LIMIT_AI_WINDOW_MS` | 3600000 | AI rate limit window (1 hr) |
| `RATE_LIMIT_AI_MAX` | 20 | Max AI requests per window |

---

## Monitoring

### Health Checks

- Frontend: `GET /health` → Returns HTML with status
- Backend: `GET /health` → Returns `{ status: 'ok' }`

### Logging

Docker containers use JSON logging:
```bash
# View logs
docker logs insurai-app

# Follow logs
docker logs -f insurai-app

# JSON format for log aggregation
docker logs insurai-app 2>&1 | jq .
```

### Sentry Integration

Error tracking is enabled when `VITE_SENTRY_DSN` is set:
- Frontend errors automatically captured
- Source maps uploaded during build
- Environment tagged for filtering

### Metrics

Basic metrics available at backend endpoints:
- `/health` - Health status
- `/api/stats` - System statistics (authenticated)

---

## Troubleshooting

### Common Issues

**Container fails to start**
```bash
# Check logs
docker logs insurai-app

# Verify environment
docker exec insurai-app env | grep -E "(VITE_|NODE_)"
```

**API connection refused**
- Verify `VITE_API_PROXY_URL` matches backend URL
- Check CORS configuration (`FRONTEND_URL`)
- Ensure firewall allows port 4001

**Supabase connection fails**
- Verify Supabase URL and key are correct
- Check RLS policies allow the operation
- Ensure user is authenticated for protected operations

**Build fails with memory error**
```bash
# Increase Node memory limit
NODE_OPTIONS=--max-old-space-size=4096 npm run build
```

### Support

- Check existing issues: https://github.com/anthropics/insurai/issues
- Review logs and error messages
- Verify environment variables are set correctly
