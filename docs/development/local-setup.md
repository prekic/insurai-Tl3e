# insurai - Local Development Setup Guide (Zero to Hero)

Welcome to the insurai project! This guide will take you from cloning the repository to running the full stack locally.

## Prerequisites
- **Node.js**: v20.0.0 or higher
- **npm**: v9 or higher
- **Git**
- **Docker** (Required for Supabase CLI local database and edge functions, optional if connecting to a hosted staging DB)
- **Supabase CLI**: Follow [Supabase CLI installation](https://supabase.com/docs/guides/cli/getting-started)

## Step 1: Clone and Install
```bash
git clone https://github.com/prekic/insurai.git
cd insurai
npm install
```

## Step 2: Environment Variables
Copy the `.env.example` file to create your `.env` file:
```bash
cp .env.example .env
```

You must configure the following in your `.env` file:
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`: Your Supabase API credentials.
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase service role credentials (needed for admin endpoints).
- `ADMIN_JWT_SECRET`: Generate a random hex string (e.g., `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`).
- `OPENAI_API_KEY`: Required for AI extraction. (Or configure Anthropic/Google).
- **Push Notifications (Optional locally)**: `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` (Generate with `npx web-push generate-vapid-keys`).

## Step 3: Supabase Local Development (Database & Edge Functions)
To test Database migrations, RLS, and Edge Functions (like `notify-expiring`) locally:

1. **Start the local Supabase stack**:
```bash
npx supabase start
```
This will spin up a local Postgres database, Auth server, Studio UI, and edge runtime using Docker container instances.

2. **Apply Migrations and Seed Data**:
```bash
npx supabase db reset
```

3. **Serve Edge Functions Locally** (In a new terminal window):
```bash
npx supabase functions serve --env-file .env
```

*Note: If you prefer to connect to the Staging/Production Supabase project directly during development, ensure your `.env` points to that project's URL and you are cautious with real data.*

## Step 4: Start the Dev Servers
insurai consists of a React/Vite frontend and an Express backend. Start both concurrently:

```bash
# Starts both frontend (port 5173) and backend (port 4001)
npm run dev:all
```

- **Frontend App**: [http://localhost:5173](http://localhost:5173)
- **Backend API**: [http://localhost:4001](http://localhost:4001)

Changes will hot-reload for both the Vite frontend and the `tsx`-watched Express server.

## Step 5: Testing
- **Unit Tests**: `npm run test` (Vitest run suite)
- **E2E Tests**: Make sure your `.env` or GitHub Secrets configuration has the necessary test credentials (`STAGING_SUPABASE_URL`, etc.), then `npm run test:e2e:ui`.
