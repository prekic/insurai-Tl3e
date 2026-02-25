# Supabase Data & Security Layer

This document outlines our PostgreSQL database schema, Row Level Security (RLS) enforcement, and background job architecture powered by Edge Functions.

---

## 1. Database Schema

The core domain model is stored in isolated PostgreSQL tables within Supabase.

### A. Core Tables
*   **`policies`**: The primary entity tracking extracted insurance policies.
    *   *Keys*: `policy_number`, `provider`, `type`, `coverage`, `premium`, `deductible`, `start_date`, `expiry_date`, `status`.
    *   *Search*: Uses a GIN-indexed `tsvector` column (`search_vector`) for rapid full-text search.
    *   *Relations*: `user_id` links to `auth.users(id)`.
*   **`policy_documents`**: Tracks metadata and bucket storage paths for PDF files.
    *   *Relations*: `policy_id` links to `policies(id)`.
*   **`policy_versions`**: Audit trail mapping the history of a policy.
    *   *Behavior*: Automatically populated via Postgres triggers (`create_policy_version()`) upon inserts/updates to the `policies` table.

### B. Storage Buckets
*   **`documents` Bucket**: A private (`public: false`) bucket designated for storing the raw PDF files uploaded by users.

---

## 2. Row Level Security (RLS) Policies

We assume a zero-trust architecture. Data isolation is strictly enforced at the Postgres database level, preventing cross-tenant data leaks even in the event of application logic flaws.

*   **Policies Table Isolation**: Users can only manipulate policies tied directly to their UID.
    *   `SELECT`/`UPDATE`/`DELETE`: `USING (auth.uid() = user_id)`
    *   `INSERT`: `WITH CHECK (auth.uid() = user_id)`
*   **Cascading Security (Related Tables)**: Access to children tables (`policy_documents`, `policy_versions`) requires ownership of the parent policy.
    *   `USING (EXISTS (SELECT 1 FROM policies WHERE policies.id = policy_id AND policies.user_id = auth.uid()))`
*   **Storage Access rules**: The storage path convention correlates the folder with the user ID:
    *   `policy-documents/{user_id}/{policy_id}/{timestamp}.{ext}`
*   **Admin Exceptions**: Supabase Service Role Keys (used uniquely on our server-side Node.js API) natively bypass RLS to perform system-wide asynchronous analytics.

---

## 3. Architecture: `notify-expiring` Edge Function

Background scheduled processes rely on Supabase's Edge Functions executing Deno runtime code. This separates execution environments securely.

### The Notification Flow
The `notify-expiring` function pushes PWA web notifications to users for policies nearing expiration (7, 14, or 30 days).

1.  **Scheduled Trigger**: Triggered daily at 08:00 UTC natively by the Postgres `pg_cron` extension.
2.  **Date Resolution**: Checks the Postgres `policies` table for target `expiry_date` offsets.
3.  **Target Identifications**: Looks up web push subscriptions in `push_subscriptions`.
4.  **Dispatch**: Utilizes `web-push` to dispatch targeted PWA alerts.
5.  **Self-Healing**: Cleans up stale or revoked endpoints (e.g., Error 410, 404).

### Required Environment Dependencies
The Edge runtime must have the following secrets bound to evaluate and push successfully. In production, these are configured via `npx supabase secrets set`:
*   `SUPABASE_URL`
*   `SUPABASE_SERVICE_ROLE_KEY`
*   `VAPID_PUBLIC_KEY` & `VAPID_PRIVATE_KEY`
*   `VAPID_SUBJECT` (e.g., mailto:contact@insurai.com)
