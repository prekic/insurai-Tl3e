# Supabase Deployment Guide

This guide covers deploying the InsurAI database schema to Supabase and configuring all required services.

## Prerequisites

- A Supabase account at [supabase.com](https://supabase.com)
- Supabase CLI installed: `npm install -g supabase`

## Step 1: Create a Supabase Project

1. Go to [app.supabase.com](https://app.supabase.com)
2. Click "New Project"
3. Choose your organization
4. Enter project details:
   - **Name**: `insurai` (or your preferred name)
   - **Database Password**: Generate a strong password and save it securely
   - **Region**: Choose closest to your users (e.g., `eu-central-1` for Turkey)
5. Click "Create new project" and wait for setup (~2 minutes)

## Step 2: Get Your API Keys

After project creation, go to **Project Settings** > **API**:

1. Copy the following values:
   - **Project URL**: `https://your-project-id.supabase.co`
   - **anon public** key: Used in frontend
   - **service_role** key: Used in backend (keep secret!)

2. Add to your `.env` file:

```bash
# Frontend (Vite)
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Backend (optional, for admin operations)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Step 3: Deploy the Database Schema

### Option A: Using Supabase Dashboard (Recommended for first deployment)

1. Go to **SQL Editor** in your Supabase dashboard
2. Copy the contents of `supabase/schema.sql`
3. Paste into the SQL Editor
4. Click "Run"

### Option B: Using Supabase CLI

```bash
# Link your local project to Supabase
supabase link --project-ref your-project-id

# Push the schema
supabase db push

# Or run migrations
supabase db reset --linked
```

## Step 4: Deploy Advanced Features

After the base schema, run the enhanced schema:

1. Go to **SQL Editor**
2. Copy the contents of `supabase/migrations/001_initial_schema.sql`
3. Paste and run

This adds:
- Full-text search with `tsvector`
- Policy versioning system
- Enhanced indexes
- Custom search functions

## Step 5: Configure Storage

### Create the Documents Bucket

1. Go to **Storage** in Supabase dashboard
2. Click "Create a new bucket"
3. Configure:
   - **Name**: `documents`
   - **Public**: No (private bucket)
   - **File size limit**: 50MB
   - **Allowed MIME types**: `application/pdf,image/png,image/jpeg`

### Set Storage Policies

Run this SQL in the SQL Editor:

```sql
-- Allow authenticated users to upload documents
CREATE POLICY "Users can upload their own documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents' AND
  (storage.foldername(name))[1] = 'policy-documents'
);

-- Allow users to view their own documents
CREATE POLICY "Users can view their own documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents' AND
  EXISTS (
    SELECT 1 FROM public.policy_documents pd
    JOIN public.policies p ON pd.policy_id = p.id
    WHERE pd.file_path = name AND p.user_id = auth.uid()
  )
);

-- Allow users to delete their own documents
CREATE POLICY "Users can delete their own documents"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'documents' AND
  EXISTS (
    SELECT 1 FROM public.policy_documents pd
    JOIN public.policies p ON pd.policy_id = p.id
    WHERE pd.file_path = name AND p.user_id = auth.uid()
  )
);
```

## Step 6: Configure Authentication

### Enable Email/Password Auth

1. Go to **Authentication** > **Providers**
2. Ensure "Email" is enabled
3. Configure settings:
   - **Enable Sign Up**: Yes
   - **Confirm email**: Recommended for production
   - **Secure email change**: Yes

### Configure Email Templates (Optional)

1. Go to **Authentication** > **Email Templates**
2. Customize:
   - Confirm signup email
   - Reset password email
   - Magic link email

### Add Redirect URLs

1. Go to **Authentication** > **URL Configuration**
2. Add your app URLs:
   - Site URL: `https://your-domain.com`
   - Redirect URLs:
     - `http://localhost:5173` (development)
     - `https://your-domain.com/auth/callback` (production)

## Step 7: Generate TypeScript Types

After deploying, generate updated types:

```bash
# Install Supabase CLI if not already installed
npm install -g supabase

# Generate types
npx supabase gen types typescript \
  --project-id your-project-id \
  > src/lib/supabase/generated-types.ts
```

Note: The project already has manually maintained types in `src/lib/supabase/types.ts` that match the schema. Only regenerate if you modify the schema.

## Step 8: Verify Deployment

### Test Database Connection

```bash
# Run the app
npm run dev

# Check browser console for Supabase connection logs
```

### Test RLS Policies

1. Sign up a test user in your app
2. Create a test policy
3. Verify the policy appears in the dashboard
4. Sign out and sign in as a different user
5. Verify you cannot see the first user's policies

### Test Storage

1. Upload a PDF document through the app
2. Verify the file appears in Supabase Storage > documents bucket
3. Verify the policy_documents table has the metadata

## Troubleshooting

### "relation does not exist" Error

The schema hasn't been deployed. Run the schema.sql in SQL Editor.

### "permission denied" Error

RLS policies are blocking access. Check:
1. User is authenticated
2. User ID matches the policy's user_id
3. RLS is enabled on the table

### Storage Upload Fails

1. Check bucket exists and is named "documents"
2. Verify storage policies are configured
3. Check file size limits

### Authentication Issues

1. Verify VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set
2. Check redirect URLs are configured in Supabase dashboard
3. For email confirmation issues, check spam folder

## Production Checklist

Before going to production:

- [ ] Enable email confirmation for new users
- [ ] Configure custom SMTP for emails (Settings > Auth)
- [ ] Enable Rate Limiting (Settings > API)
- [ ] Set up database backups (Settings > Database)
- [ ] Configure proper CORS settings
- [ ] Enable SSL enforcement (enabled by default)
- [ ] Review and test all RLS policies
- [ ] Set up monitoring/alerts
- [ ] Configure custom domain (optional)

## Schema Reference

### Tables

| Table | Description |
|-------|-------------|
| `users` | User profiles (extends auth.users) |
| `policies` | Insurance policies |
| `policy_documents` | Uploaded PDF documents |
| `policy_versions` | Policy change history |

### Key Functions

| Function | Description |
|----------|-------------|
| `search_policies(query)` | Full-text search across policies |
| `get_policy_history(policy_id)` | Get version history for a policy |
| `handle_new_user()` | Auto-creates profile on signup |
| `update_policy_status()` | Auto-updates status based on expiry |

### Indexes

- `idx_policies_user_id` - Fast user filtering
- `idx_policies_status` - Status filtering
- `idx_policies_expiry_date` - Expiry-based queries
- `idx_policies_search_vector` - Full-text search (GIN)

## Next Steps

After successful deployment:

1. **Test the integration** - Upload policies and verify CRUD operations
2. **Monitor usage** - Check Supabase dashboard for API calls and storage
3. **Scale as needed** - Upgrade Supabase plan when approaching limits
