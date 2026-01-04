# InsurAI Production Deployment Guide

This guide walks you through all critical steps to deploy InsurAI to production.

---

## Table of Contents

1. [Sentry Error Tracking](#1-sentry-error-tracking)
2. [Supabase Setup](#2-supabase-setup)
3. [API Keys Configuration](#3-api-keys-configuration)
4. [CORS Configuration](#4-cors-configuration)
5. [SSL/TLS Setup](#5-ssltls-setup)
6. [Deployment Checklist](#6-deployment-checklist)

---

## 1. Sentry Error Tracking

### Step 1.1: Create Sentry Project

1. Go to [https://sentry.io](https://sentry.io) and sign up/login
2. Create a new project:
   - Platform: **React**
   - Project name: `insurai` or `insurai-frontend`
3. Note your **DSN** (looks like `https://xxx@xxx.ingest.sentry.io/xxx`)

### Step 1.2: Configure Frontend Sentry

Add to your `.env` file:

```bash
# Frontend Sentry (error tracking + performance)
VITE_SENTRY_DSN=https://your-key@sentry.io/your-project-id
VITE_APP_VERSION=0.1.0
VITE_SENTRY_ENVIRONMENT=production
```

### Step 1.3: Configure Backend Sentry

Create a **second Sentry project** for the backend (Node.js platform), then add to `.env`:

```bash
# Backend Sentry (separate project recommended)
SENTRY_DSN=https://your-backend-key@sentry.io/your-backend-project-id
```

### Step 1.4: Source Maps (CI/CD Only)

For better error stack traces, upload source maps during builds:

1. Create a Sentry Auth Token at: Settings > Auth Tokens
2. Add to CI/CD secrets:

```bash
SENTRY_AUTH_TOKEN=your-auth-token
SENTRY_ORG=your-org-slug
SENTRY_PROJECT=insurai
```

The `@sentry/vite-plugin` will automatically upload source maps during `npm run build`.

### Step 1.5: Verify Sentry Works

After deployment, test by triggering an error:
- Open browser console and type: `throw new Error('Test Sentry')`
- Check Sentry dashboard for the error within 1-2 minutes

---

## 2. Supabase Setup

### Step 2.1: Create Supabase Project

1. Go to [https://supabase.com](https://supabase.com) and sign up/login
2. Click **New Project**
3. Choose a name (e.g., `insurai-prod`)
4. Select region closest to your users (e.g., `eu-central-1` for Turkey)
5. Set a strong database password (save it securely!)
6. Wait for project to be created (~2 minutes)

### Step 2.2: Get API Credentials

From your Supabase dashboard:

1. Go to **Settings > API**
2. Copy:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon public key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6...`

Add to `.env`:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### Step 2.3: Run Database Migrations

1. Go to **SQL Editor** in Supabase dashboard
2. Open and run these files in order:

**Migration 1: Initial Schema**
```sql
-- Copy entire contents from: supabase/migrations/001_initial_schema.sql
-- This creates: policies, policy_documents, policy_versions tables
-- Plus RLS policies, search functions, and triggers
```

**Migration 2: Storage Policies**
```sql
-- Copy entire contents from: supabase/migrations/002_storage_policies.sql
-- This sets up document storage bucket and access policies
```

### Step 2.4: Create Storage Bucket

1. Go to **Storage** in Supabase dashboard
2. Click **New bucket**
3. Name: `documents`
4. **Public bucket**: OFF (keep private)
5. The RLS policies from migration 2 will control access

### Step 2.5: Configure Authentication

1. Go to **Authentication > Providers**
2. Enable providers you want:

**Email/Password** (enabled by default):
- Confirm email: ON for production

**Google OAuth**:
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create OAuth credentials (Web application)
3. Add redirect URI: `https://your-project.supabase.co/auth/v1/callback`
4. Copy Client ID and Secret to Supabase

**GitHub OAuth**:
1. Go to GitHub > Settings > Developer settings > OAuth Apps
2. Create new OAuth App
3. Authorization callback URL: `https://your-project.supabase.co/auth/v1/callback`
4. Copy Client ID and Secret to Supabase

### Step 2.6: Configure Auth Redirect URLs

In Supabase **Authentication > URL Configuration**:

```
Site URL: https://your-domain.com
Redirect URLs:
  - https://your-domain.com
  - https://your-domain.com/auth/callback
  - https://your-domain.com/dashboard
```

---

## 3. API Keys Configuration

### Step 3.1: Backend API Keys (Server-Side Only)

These keys stay on your server and are NEVER exposed to browsers:

```bash
# OpenAI (for document extraction)
# Get at: https://platform.openai.com/api-keys
OPENAI_API_KEY=sk-proj-your-actual-key

# Anthropic/Claude (for multi-model consensus)
# Get at: https://console.anthropic.com/settings/keys
ANTHROPIC_API_KEY=sk-ant-your-actual-key

# Google Cloud Vision (for OCR on scanned PDFs)
# Enable at: https://console.cloud.google.com/apis/credentials
GOOGLE_CLOUD_API_KEY=AIza-your-actual-key
```

### Step 3.2: Frontend Configuration

The frontend only needs the proxy URL, not the actual keys:

```bash
# Points to your backend server
VITE_API_PROXY_URL=https://api.your-domain.com
```

### Step 3.3: Never Expose Keys

**DO NOT** use `VITE_OPENAI_API_KEY` or similar in production! The `VITE_` prefix exposes variables to the browser.

The app is designed to route all AI calls through the backend proxy at `/api/ai/*`.

### Step 3.4: Key Rotation

If keys are compromised:
1. Revoke the old key in the provider's dashboard
2. Generate a new key
3. Update your server's `.env` file
4. Restart the server

---

## 4. CORS Configuration

### Step 4.1: Update Server CORS

In `server/index.ts`, the CORS is configured via environment variable:

```bash
# In .env
FRONTEND_URL=https://your-domain.com
```

This automatically sets the CORS origin to your frontend domain.

### Step 4.2: Multiple Origins (If Needed)

If you need multiple origins (e.g., staging + production), modify `server/index.ts`:

```typescript
const allowedOrigins = [
  'https://insurai.com',
  'https://staging.insurai.com',
  'https://app.insurai.com',
]

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true)
    } else {
      callback(new Error('Not allowed by CORS'))
    }
  },
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}
```

### Step 4.3: Supabase CORS

Supabase handles CORS automatically for its APIs. No additional configuration needed.

---

## 5. SSL/TLS Setup

### Option A: Platform-Managed SSL (Recommended)

Most hosting platforms provide automatic SSL:

**Vercel** (Frontend):
- SSL is automatic for all deployments
- Custom domains get SSL within minutes

**Railway/Render/Fly.io** (Backend):
- SSL is automatic
- Custom domains get SSL automatically

**Supabase**:
- SSL is always enabled
- No configuration needed

### Option B: Manual SSL with Let's Encrypt

If self-hosting on a VPS:

1. Install Certbot:
```bash
sudo apt install certbot python3-certbot-nginx
```

2. Get certificate:
```bash
sudo certbot --nginx -d api.your-domain.com
```

3. Auto-renewal is configured automatically

### Step 5.1: Force HTTPS

Ensure your server redirects HTTP to HTTPS:

**Nginx example:**
```nginx
server {
    listen 80;
    server_name api.your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name api.your-domain.com;

    ssl_certificate /etc/letsencrypt/live/api.your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.your-domain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:4001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Step 5.2: HSTS Header

The server already includes HSTS via Helmet.js:
```typescript
helmet({
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
})
```

---

## 6. Deployment Checklist

### Pre-Deployment

- [ ] All tests pass: `npm run validate`
- [ ] Production build succeeds: `npm run build`
- [ ] No TypeScript errors
- [ ] No ESLint warnings
- [ ] Environment variables prepared

### Environment Variables Summary

Create a `.env` file (never commit this!):

```bash
# =============================================================================
# FRONTEND (VITE_* prefix - exposed to browser)
# =============================================================================
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
VITE_API_PROXY_URL=https://api.your-domain.com
VITE_APP_URL=https://your-domain.com
VITE_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
VITE_APP_VERSION=0.1.0

# =============================================================================
# BACKEND (Server-side only - NEVER exposed)
# =============================================================================
NODE_ENV=production
API_PORT=4001
FRONTEND_URL=https://your-domain.com

# AI Provider Keys (server-side only)
OPENAI_API_KEY=sk-proj-xxx
ANTHROPIC_API_KEY=sk-ant-xxx
GOOGLE_CLOUD_API_KEY=AIza-xxx

# Backend Sentry (optional, separate project)
SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
```

### Post-Deployment Verification

1. **Health Check**: Visit `https://api.your-domain.com/api/health`
2. **Frontend**: Visit your domain and check:
   - [ ] Landing page loads
   - [ ] Can sign up/login
   - [ ] Can upload a policy (demo mode if AI not configured)
   - [ ] Dashboard shows sample data
3. **Sentry**: Trigger a test error and verify it appears in dashboard
4. **Supabase**: Check Authentication > Users for new signups

### Monitoring

- **Uptime**: Use UptimeRobot, Pingdom, or Better Uptime
- **Errors**: Check Sentry dashboard daily for first week
- **Performance**: Monitor Core Web Vitals in Sentry
- **Database**: Monitor Supabase dashboard for usage

---

## Quick Reference: Deployment Commands

```bash
# Build frontend
npm run build

# Build backend
npm run build:server

# Start backend (production)
NODE_ENV=production npm run start:server

# Or use Docker (if Dockerfile exists)
docker build -t insurai .
docker run -p 4001:4001 --env-file .env insurai
```

---

## Need Help?

- **Supabase Issues**: [supabase.com/docs](https://supabase.com/docs)
- **Sentry Issues**: [docs.sentry.io](https://docs.sentry.io)
- **Deployment Issues**: Check server logs and Sentry errors

---

*This guide was generated for InsurAI v0.1.0*
