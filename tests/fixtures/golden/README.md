# Phase 3 — Audit-Judge Golden Corpus

Curated fixtures for `npm run audit:judge` (`scripts/audit-judge-corpus.ts`). The judge critiques structured extractions for quality issues that wouldn't fail extraction validation but harm reviewer trust (duplications, missing line items, framing inaccuracies, render gaps, omitted sub-limits).

## Manifest schema

`golden.json` is the source of truth. Each fixture entry:

| Field | Type | Required | Notes |
|---|---|---|---|
| `fixtureId` | string | yes | Stable identifier — written to `audit_judgements.fixture_id`. |
| `sourcePath` | string | yes | Path to the PDF, relative to this directory. Reuse from `tests/fixtures/kasko/` is encouraged. |
| `insurer` | string | yes | Provider name. Will be normalised for typology hashing. |
| `insuranceLine` | string | yes | Branch (`kasko`, `traffic`, …). |
| `country` | string | yes | ISO 3166-1 alpha-2. Defaults to `TR`. |
| `yearBucket` | number | yes | 2-year bucket, e.g. `2024` covers MY 2024+2025. |
| `expectedCoverages` | string[] | yes | Substring expectations for the structured `coverages[]` output. |
| `expectedConditionalDeductibles` | string[] | yes | Substring expectations for `conditionalDeductibles[]`. |
| `expectedExclusions` | string[] | yes | Substring expectations for `exclusions[]`. |
| `expectedBundleProducts` | string[] | yes | Substring expectations for `bundleProducts[]` if the policy is a bundle. |
| `expectedNamedScenarios` | string[] | yes | Phase 1 named-scenario labels expected to fire. |
| `forbiddenPhrases` | string[] | yes | Cross-insurer leak guard. |
| `criticalFlags` | string[] | yes | Phase 1 trigger codes the fixture is expected to generate. Empty = no critical findings expected. |
| `notes` | string | yes | Human-readable context. |

## Adding a new fixture

1. Drop the PDF into `tests/fixtures/kasko/` (committed) or this directory if golden-only.
2. Add a manifest entry with all fields populated.
3. Run `npm run audit:judge` to generate a baseline `audit_judgements` row.
4. Inspect the resulting `reports/judge-<timestamp>.md` — if the judge raises critical findings the fixture should expect, add the corresponding `criticalFlags`.

## Initial corpus (4 fixtures)

The first cut reuses the kasko smoke fixtures — same PDFs, different prompt. The corpus deliberately includes two Anadolu Sigorta fixtures from the same year-bucket so the typology-cache hit path is exercised on the second one (the cache should short-circuit; only the first run hits Anthropic).

The fourth fixture (`anadolu-birlesik-kasko`, added May 2026) is the reviewer-flagged April 30 case — an Anadolu BİRLEŞİK KASKO SİGORTA / GENİŞLETİLMİŞ KASKO product with a high-impact 80% co-insurance deductible scenario triggered by commercial use (taxi/dolmuş/pirate-taxi). Year-bucket 2014 (policy dated Oct 2015) — distinct from the other Anadolu fixtures so it lands on its own typology hash and exercises Migration 049's named-deductible attribution rules end-to-end.

Future expansion: add an AXA AS+ kasko, a Ray Sigorta, and one of HDI/Sompo/Quick.
