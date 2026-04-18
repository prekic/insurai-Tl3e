# ADR-0004: Env-Var-Gated Admin Features for Privacy-Sensitive Operations

- **Status**: Accepted
- **Date**: 2026-04-18
- **Deciders**: Owner (Erdem), via Claude Code session
- **Supersedes / Superseded by**: None

## Context

The Phase E pilot scale-up work required an admin UI for managing `user_segments` membership (the `kasko_pilot_reviewers` set that gates KASKO pilot access). Segment rows hold user UUIDs, which super-admins typically don't have memorized — they know users by email. A natural UX is to paste emails and have the server resolve them to UUIDs via `supabase.auth.admin.listUsers()`.

This is **privacy-sensitive** in two ways:

1. It exposes `auth.users.email` to any caller with super-admin credentials. That's a legitimate admin capability, but it's broader than the existing admin surface (prior admin routes only read `admin_users`, not `auth.users`).
2. It creates an endpoint whose mere existence — even unused — signals that email enumeration is supported. Any server with this route running must have gone through some form of privacy review.

We need a mechanism that (a) ships the feature so it's ready, (b) makes it clear the feature is off by default, (c) makes enabling it a conscious deploy-time decision rather than an admin-panel click, and (d) doesn't add migration overhead for a capability that may never be enabled in every environment.

Relevant existing mechanisms we considered:

- **DB feature flag** (`feature_flags` table, category `admin`). Toggleable via the admin panel.
- **Hardcoded `true` in a config constant**. Would require a code change + deploy to toggle.
- **Always-on with audit logging**. Transparent but shifts privacy concerns to monitoring.
- **Server env var**. Binary, deploy-time, not toggleable from the running app.

## Decision

We gate the feature behind a **server environment variable** `ENABLE_ADMIN_EMAIL_RESOLVER`. Default is unset/empty, which the endpoint treats as `false` and returns HTTP 403 with error code `RESOLVER_DISABLED`. Operators set it to `"true"` only after a privacy review.

For this feature and **all future privacy-sensitive admin capabilities** (e.g., bulk user data export, cross-user audit queries, anything that surfaces PII beyond an admin's normal working set), we adopt this pattern as the default gating mechanism.

### Shape of the pattern

1. A `server/routes/admin/<feature>.ts` route that:
   - Checks `process.env.ENABLE_<FEATURE>_<NAME> === 'true'` as the first guard
   - Returns `403 { code: 'RESOLVER_DISABLED' | '<similar>', hint: '...' }` when disabled
   - Applies `requireSuperAdmin()` and input validation normally when enabled
   - Calls `logAdminAction()` for every invocation for audit
2. A client-side helper in `src/lib/admin/api.ts` that:
   - Surfaces a typed `<Feature>DisabledError` class when the 403 code arrives
   - Lets UI callers catch and render a clear "disabled — enable the env var after review" message
3. UI components that:
   - Show an amber/warning banner in the feature's surface area saying it's disabled
   - Cite the env var name by text so the operator can search docs
   - Link (in runbook or inline) to this ADR

### What gets surfaced where

- `.env.example` — the env var with a comment explaining it's opt-in and privacy-sensitive
- `CLAUDE.md` — a gotcha entry describing the pattern + linking to this ADR
- Relevant runbook (e.g., `04-phase-e-production-scaleup.md`) — how to enable per-feature
- ADR (this file) — the decision rationale

## Alternatives Considered

### DB feature flag (`feature_flags` table)
**Pros**: existing infrastructure; UI-toggleable; supports rollout percentages.
**Cons**: A super-admin UI toggle is too low-friction for a decision that should require a privacy/compliance review. Rollout percentages are meaningless for a binary capability. Adds a migration to seed the flag. Admins could flip it back after a review is done without a deploy trail, meaning there's no durable record of the "it was enabled on date X after review Y" fact.
**Verdict**: Rejected. Reserved for behavioral feature flags (e.g., `kasko_ai_extraction_pilot`), not capability flags.

### Hardcoded `true` behind a code change
**Pros**: Simple. Guaranteed deploy-level audit trail (the code change is reviewable).
**Cons**: Requires every environment (dev, staging, prod) to make the same enable decision at the same time. Can't enable in staging-only for validation without branching. Requires a redeploy to change.
**Verdict**: Too inflexible for an environment-specific capability.

### Always-on with logging
**Pros**: Maximally usable. No gating means no forgotten opt-in blocking UX.
**Cons**: Ships the PII exposure by default. Makes this feature's risk equivalent to baseline admin permissions, which may not be acceptable in every deployment target. Relies on runtime monitoring to catch abuse rather than preventing it.
**Verdict**: Rejected. Principle of least privilege by default.

### Env var (chosen)
**Pros**: Binary, explicit. Enabling requires a server-side env change, which in most deployment systems creates a deploy audit trail. Different environments can make different decisions. Zero migration cost. Can't be toggled by a running admin without server access.
**Cons**: Less convenient than a UI toggle. Requires operators to know the env var name (mitigated by surfacing it in `.env.example`, CLAUDE.md, and the feature's UI surface).
**Verdict**: Accepted.

## Consequences

### Positive
- Clear "off by default" stance for all privacy-sensitive admin capabilities
- Enabling creates deployment-system audit trail (env change = deploy event)
- Per-environment flexibility without code branching
- Zero migration or DB config overhead
- UI can render precise "disabled — set `<VAR_NAME>=true` after review" guidance

### Negative
- Operators must know the env var exists (mitigated by `.env.example` + CLAUDE.md + runbook cross-references)
- Toggling requires a redeploy (acceptable given privacy-review-level decisions)
- Pattern diverges from the behavioral feature-flag pattern used elsewhere — requires developer awareness of when to use which

### Scope boundary
- **In scope for this pattern**: PII enumeration (email/name/phone resolution), cross-user data export, features that expose non-self data beyond what a normal super-admin workflow already shows.
- **Out of scope**: Behavioral feature flags, gradual rollouts, performance toggles, UX variants. Those stay in `feature_flags` with DB toggleability.

## References

- Implementation: `server/routes/admin/segments.ts` (`isResolverEnabled()` + `POST /app-users/resolve-emails`)
- Client wrapper: `src/lib/admin/api.ts` (`resolveEmailsToUuids`, `EmailResolverDisabledError`)
- UI: `src/components/admin/tabs/SegmentsTab.tsx` (UUID / Email mode toggle)
- Runbook: `docs/runbooks/04-phase-e-production-scaleup.md` §4
- Env docs: `.env.example` line ~ `ENABLE_ADMIN_EMAIL_RESOLVER`
- CLAUDE.md gotcha #75 — quick-reference summary
