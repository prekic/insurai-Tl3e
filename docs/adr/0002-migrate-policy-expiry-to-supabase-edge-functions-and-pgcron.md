# Migrate Policy Expiry to Supabase Edge Functions and pg_cron

* Status: accepted
* Deciders: Erdem
* Date: 2026-02-24

## Context and Problem Statement

We need a structured way to run daily checks for expiring insurance policies to alert users via push notifications. Originally, this cron task was executed externally via GitHub Actions triggering an unauthenticated/lightly secured Railway endpoint. We need a more reliable, native, and secure mechanism for this background process.

## Decision Drivers

* Security: Reduce public surface area by internalizing background endpoints.
* Reliability: Using database-native scheduling ensures the job runs close to the data and relies on fewer moving parts (removing GitHub Actions from the execution loop).
* Performance: Serverless edge functions execute with minimal overhead compared to waking up the monolithic API server.

## Considered Options

* **Supabase pg_cron + Edge Functions**
* **Railway internal cron jobs (if available) or Node-cron**
* **GitHub Actions triggered webhook (Original approach)**
* **AWS EventBridge + Lambda**

## Decision Outcome

Chosen option: "**Supabase pg_cron + Edge Functions**", because we already heavily utilize Supabase for Postgres and Auth. Using `pg_cron` allows us to define the schedule directly in the database, and triggering a Supabase Edge Function keeps the architecture native to our primary data provider. It removes GitHub Actions as a dependency for daily operations and completely eliminates the need to expose an internal trigger endpoint on our Express server.

### Positive Consequences

* Increased security by closing the public Express cron endpoint.
* Reduced dependency on GitHub Actions for operational runtime tasks.
* Execution happens extremely close to the database (Supabase native).

### Negative Consequences

* Testing edge functions locally requires Docker and the Supabase CLI, making the local dev setup slightly heavier.
* Requires manual deployment of Edge Functions (`npx supabase functions deploy`) outside of the primary Railway CI pipeline, mapping environment variables (VAPID keys) as Supabase edge secrets.
