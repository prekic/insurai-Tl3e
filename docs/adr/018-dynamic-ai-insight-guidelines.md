# 018: Dynamic AI Insight Guidelines

## Status
Accepted

## Context
When extracting policy insights, the AI sometimes hallucinates incorrect or overly critical missing coverages (e.g., flagging "collision" missing on a comprehensive Kasko policy, when it is inherently included). Previously, developers hardcoded `if`/`else` logic and string concatenations into the `/api/ai/sense-check` endpoint system prompts to counteract these AI behaviors. 
This led to:
- A growing, unmanageable block of hardcoded instructions in backend source code.
- Frequent code deployments required simply to tune AI behavior for a specific policy or region.
- Lack of centralized administrative control over what the AI considers "valid" vs "invalid".

## Decision
We moved the AI sense-checking instructions into a dynamic, database-driven system. We created a new Supabase table `ai_insight_guidelines` capable of storing rules scoped to a specific `policy_type` and `region_code` (or globally using `*`). 

We updated the `/api/ai/sense-check` endpoint to dynamically query these active guidelines at runtime and inject them into the AI system prompt before processing the extraction.

Finally, we built a comprehensive Admin Dashboard UI (`InsightsTab.tsx`) within the existing InsurAI admin panel, allowing non-developers to create, read, update, and toggle these guidelines in real-time.

## Consequences
- **Positive:** System prompts can now be updated and tuned instantly via the Admin dashboard without requiring a full code deployment cycle.
- **Positive:** Improved AI accuracy and reduction in false-positive "missing coverage" alerts by providing targeted context per policy type.
- **Positive:** Better admin visibility into how the AI is being steered.
- **Negative:** Adds a slight latency overhead (one database read query) the the `/api/ai/sense-check` endpoint before calling the LLM.

## Notes
The `InsightsTab.tsx` uses the frontend Supabase client directly since it's an admin-only secure route, ensuring rapid UI updates without creating dedicated CRUD proxy endpoints in `server/routes/admin`.
