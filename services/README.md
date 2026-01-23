# InsurAI OCR Microservices Architecture

## Overview

This document describes the enterprise-grade OCR pipeline designed to solve Turkish insurance document processing challenges, including the OCR artifacts and spacing issues demonstrated in the original problem.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DOCUMENT API (doc-api)                            │
│                            Port 4002, REST API                              │
│  POST /v1/documents, GET /v1/documents/{id}/text|fields|audit              │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      WORKFLOW ORCHESTRATOR (Temporal)                       │
│                                                                             │
│  doc.ingested → render → preprocess → layout → ocr → reconcile             │
│                              → normalize → validate → extract → finalize   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
          ┌───────────────────────────┼───────────────────────────┐
          ▼                           ▼                           ▼
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│   Render SVC    │       │  Preproc SVC    │       │   Layout SVC    │
│  PDF → Images   │       │  A/B/C/D        │       │  Region detect  │
│  600/900 DPI    │       │  variants       │       │  text/table/qr  │
└─────────────────┘       └─────────────────┘       └─────────────────┘
                                      │
          ┌───────────────────────────┼───────────────────────────┐
          ▼                           ▼                           ▼
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│  ABBYY Adapter  │       │ GCP DocAI       │       │  Azure DI       │
│                 │       │ Adapter         │       │  Adapter        │
│  OCR Engine 1   │       │  OCR Engine 2   │       │  OCR Engine 3   │
└─────────────────┘       └─────────────────┘       └─────────────────┘
          │                           │                           │
          └───────────────────────────┼───────────────────────────┘
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         RECONCILE SERVICE                                   │
│                                                                             │
│  • Align tokens by bounding box (IoU matching)                             │
│  • Confidence-weighted voting across engines                               │
│  • Dispute detection → trigger targeted re-OCR at 900 DPI                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         NORMALIZE SERVICE                                   │
│                                                                             │
│  Locale Pack (tr-TR):                                                      │
│  • Unicode NFKC normalization                                              │
│  • Split-letter merge: "B İ RLE Şİ K" → "BİRLEŞİK"                         │
│  • 50+ custom Turkish OCR patterns                                         │
│  • Barcode artifact removal: B^^^B, a!!!a                                  │
│  • Glued word splitting: "Sigortaşirket" → "Sigorta Şirketi"              │
│                                                                             │
│  NO LLM - 100% deterministic, auditable rules                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         VALIDATE SERVICE                                    │
│                                                                             │
│  Policy Pack (motor_kasko):                                                │
│  • Field validators: plate format, VIN checksum, TC Kimlik                 │
│  • Document validators: OCR artifacts, page sequence                       │
│  • Quarantine logic: critical failures → QUARANTINED                       │
│  • Targeted re-OCR trigger: validation failures                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

## How This Fixes Your OCR Issues

### Problem 1: Spaced Turkish Characters

**Before**: `B İ RLE Şİ K KASKO S İ GORTA POL İÇ ES İ "GEN İŞ LET İ LM İŞ KASKO"`

**Solution**: The Turkish locale pack (`tr-TR.ts`) contains:

1. **Split-letter merge patterns** that detect and merge sequences:
   ```typescript
   // Pattern: Single uppercase letters with spaces
   regex: '(?<![\\p{L}])([\\p{Lu}])(?:\\s+([\\p{Lu}])){2,}(?![\\p{Ll}])'
   action: 'mergeRemoveSpacesIfAllCaps'
   ```

2. **50+ explicit word patterns** for common Turkish insurance terms:
   ```typescript
   { pattern: 'S\\s*İ\\s*G\\s*O\\s*R\\s*T\\s*A', replacement: 'SİGORTA' },
   { pattern: 'P\\s*O\\s*L\\s*İ\\s*Ç\\s*E', replacement: 'POLİÇE' },
   { pattern: 'B\\s*İ\\s*R\\s*L\\s*E\\s*Ş\\s*İ\\s*K', replacement: 'BİRLEŞİK' },
   { pattern: 'G\\s*E\\s*N\\s*İ\\s*Ş\\s*L\\s*E\\s*T\\s*İ\\s*L\\s*M\\s*İ\\s*Ş', replacement: 'GENİŞLETİLMİŞ' },
   // ... 46 more patterns
   ```

**After**: `BİRLEŞİK KASKO SİGORTA POLİÇESİ "GENİŞLETİLMİŞ KASKO"`

### Problem 2: Barcode/Garbage Artifacts

**Before**:
```
B^^^Bj54<O[ MtWfE<q&vB^^^B <:8@+2ZSM0xpN|7t2A ((23$ 4^-NbV{MM.GZz$$`dA8ju+Yp
a!!!!!a!AAAaA!AA!!!aaAA!aAaAA!!
```

**Solution**: Multiple layers of garbage removal:

1. **Custom rules in locale pack**:
   ```typescript
   { pattern: 'B[\\^<>]+B[^\\s\\n]*', replacement: '' },  // B^^^B and variants
   { pattern: 'a!{2,}[aA!]*', replacement: '' },           // a!!!a patterns
   { pattern: '[!^~_<>|]{3,}[^\\s\\n]*', replacement: '' }, // Punctuation runs
   ```

2. **Validation service checks** flag remaining artifacts as errors:
   ```typescript
   const artifacts = [
     { pattern: /B\^\^\^B/gi, name: 'B^^^B barcode artifact' },
     { pattern: /a!{3,}a/gi, name: 'a!!!a barcode artifact' },
   ]
   // Flags as ERROR if found after normalization
   ```

**After**: Clean text with artifacts completely removed.

### Problem 3: Glued Words

**Before**: `Sigortaşirket`, `sigortalıAdı`, `HUSUSİOTOMOBİL`, `SANAYİVE`

**Solution**: Glued word splitting patterns:
```typescript
{ pattern: 'Sigorta(ş|Ş)irket(i)?', replacement: 'Sigorta Şirketi' },
{ pattern: 'sigortalıAdı', replacement: 'Sigortalı Adı' },
{ pattern: 'HUSUSİOTOMOBİL', replacement: 'HUSUSİ OTOMOBİL' },
{ pattern: 'SANAYİVE', replacement: 'SANAYİ VE' },
```

**After**: `Sigorta Şirketi`, `Sigortalı Adı`, `HUSUSİ OTOMOBİL`, `SANAYİ VE`

### Problem 4: Lowercase Spaced Words

**Before**: `M üş teri Numarası`, `D ü zenleme Tarihi`

**Solution**: Lowercase spaced word patterns:
```typescript
{ pattern: 'M\\s*ü\\s*ş\\s*t\\s*e\\s*r\\s*i', replacement: 'Müşteri' },
{ pattern: 'D\\s*ü\\s*z\\s*e\\s*n\\s*l\\s*e\\s*m\\s*e', replacement: 'Düzenleme' },
```

**After**: `Müşteri Numarası`, `Düzenleme Tarihi`

## Directory Structure

```
services/
├── doc-api/               # Document REST API
│   ├── src/
│   │   └── index.ts       # Express server
│   └── openapi.yaml       # OpenAPI 3.1 spec
├── workflow/              # Temporal workflow definitions
├── render-svc/            # PDF → images
├── preproc-svc/           # Image preprocessing (A/B/C/D variants)
├── layout-svc/            # Region detection
├── ocr-orch/              # OCR orchestrator
├── ocr-adapters/          # Per-engine adapters
│   ├── abbyy/
│   ├── gcp-docai/
│   └── azure-di/
├── reconcile-svc/         # Multi-engine voting
│   └── src/index.ts       # Reconciler implementation
├── normalize-svc/         # Deterministic normalization
│   └── src/index.ts       # Normalizer implementation
├── validate-svc/          # Validation gates
│   └── src/index.ts       # Validator implementation
├── extract-svc/           # Field extraction
└── audit-svc/             # Audit bundle generation

packages/
├── types/                 # Shared TypeScript types
│   └── src/index.ts       # All type definitions
├── rule-packs/            # Locale and policy packs
│   └── src/
│       ├── index.ts       # Registry and detection
│       └── packs/
│           ├── locales/
│           │   ├── tr-TR.ts     # Turkish (50+ patterns)
│           │   ├── de-DE.ts     # German
│           │   ├── en-GB.ts     # English
│           │   └── fallback.ts  # Fallback
│           └── policies/
│               ├── motor-kasko-tr.ts    # Kasko validators
│               ├── motor-traffic-tr.ts  # ZMSS validators
│               ├── property-fire-tr.ts  # Fire validators
│               ├── dask-tr.ts           # Earthquake validators
│               └── fallback.ts          # Fallback
└── shared/                # Shared utilities

supabase/migrations/
└── 010_ocr_pipeline_schema.sql  # Complete database schema
```

## Database Schema

Key tables for the OCR pipeline:

| Table | Purpose |
|-------|---------|
| `ocr_documents` | Document tracking with status, locale, policy type |
| `ocr_pages` | Page renders and variants |
| `ocr_regions` | Detected regions (text, table, QR, etc.) |
| `ocr_runs` | Per-engine OCR results |
| `ocr_tokens` | Individual tokens from OCR |
| `reconcile_decisions` | How tokens were merged |
| `reconciled_tokens` | Final merged tokens |
| `normalization_transforms` | Applied rules with audit trail |
| `validation_results` | Validation issues |
| `extracted_fields` | Structured fields with evidence |
| `rule_packs` | Locale and policy rule configurations |
| `audit_bundles` | Complete provenance packages |

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/v1/documents` | POST | Upload document |
| `/v1/documents/{id}` | GET | Get status and details |
| `/v1/documents/{id}/text` | GET | Get final normalized text |
| `/v1/documents/{id}/fields` | GET | Get extracted fields |
| `/v1/documents/{id}/audit` | GET | Get full audit bundle |
| `/v1/documents/{id}/reprocess` | POST | Reprocess with overrides |
| `/v1/rulepacks` | GET | List rule packs |
| `/v1/rulepacks/{id}` | GET | Get rule pack details |

## Key Design Principles

1. **No LLM for normalization** - All text cleanup is deterministic and auditable
2. **Ensemble OCR** - Multiple engines increase accuracy
3. **Rule packs** - Locale and policy-specific rules are versioned and manageable
4. **Evidence preservation** - Every transformation is tracked for audit
5. **Quarantine logic** - Critical failures stop processing, not corrupt data
6. **Targeted re-OCR** - Only re-process disputed regions at higher resolution

## Usage

### Quick Start

```typescript
import { createDefaultRegistry, normalizeText } from '@insurai/rule-packs'
import { Normalizer } from '@insurai/normalize-svc'

// Get Turkish locale pack
const registry = createDefaultRegistry()
const localePack = registry.getLocalePack('tr-TR')!

// Normalize OCR text
const normalizer = new Normalizer({
  localePack,
  docId: 'test-doc',
})

const result = normalizer.normalize(rawOCRText)
console.log(result.normalizedText)
// BİRLEŞİK KASKO SİGORTA POLİÇESİ "GENİŞLETİLMİŞ KASKO"
// (garbage removed, words merged correctly)
```

### Validating Extracted Fields

```typescript
import { Validator } from '@insurai/validate-svc'

const validator = new Validator({
  docId: 'test-doc',
  localePack,
  policyPack: registry.getPolicyPack('motor_kasko')!,
  text: normalizedText,
  extractedFields: fields,
})

const result = validator.validate()

if (!result.passed) {
  console.log('Critical issues:', result.criticalIssues)
  // Could trigger quarantine or targeted re-OCR
}
```

## Next Steps

1. **Deploy Temporal** for workflow orchestration
2. **Integrate OCR adapters** (ABBYY, GCP DocAI, Azure DI)
3. **Add more Turkish patterns** as new OCR artifacts are discovered
4. **Build monitoring** with Prometheus metrics
5. **Scale horizontally** with Kubernetes
