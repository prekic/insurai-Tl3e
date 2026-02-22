---
name: infrastructure-guard
description: Mandatory rules to protect Railway, Sanity, and MongoDB infrastructure.
---

## Goal
Ensure the agent NEVER modifies existing infrastructure schemas or deployment settings.

## Instructions
- ALWAYS check `sanity.config.ts` or schema files before suggesting changes.
- NEVER modify files in `schemas/` (Sanity) or database connection logic.
- NEVER run `sanity deploy` or `railway up`.
- If a task requires a schema change, STOP and ask the user for permission first.

## Constraints
- DO NOT run any command that starts with `railway`.
- DO NOT modify `mongodb` connection strings or environment variable files (`.env`).
- Stay within the `src/` or `components/` directories for logic changes.