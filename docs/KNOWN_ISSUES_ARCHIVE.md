# Known Issues & Solutions Archive

> **Archived from CLAUDE.md** — March 28, 2026
> 
> This file contains 178 historical known issues and their resolutions.
> For active developer gotchas, see `CLAUDE.md` → Developer Gotchas and Common Gotchas sections.

---

## Known Issues & Solutions

### 1. Port 3001 Conflicts
- **Problem**: Port 3001 often in use
- **Solution**: All ports changed to 4001
- **Files**: `server/index.ts`, `.env`, `vite.config.ts`

### 2. PDF.js Worker 404
- **Problem**: cdnjs.cloudflare.com doesn't have pdfjs-dist@5.4.530
- **Solution**: Use unpkg.com as primary CDN
- **File**: `src/lib/ai/pdf-parser.ts`

### 3. Schema ENUM vs TEXT
- **Problem**: PostgreSQL ENUM types are inflexible for Turkish policy types
- **Solution**: Use TEXT with CHECK constraints instead
- **File**: `supabase/schema.sql` - uses TEXT CHECK (type IN ('kasko', 'traffic', ...))

### 4. Multiple Elements in Tests
- **Problem**: `getByText()` fails when multiple elements match
- **Solution**: Use `getAllByText()` or more specific queries
- **Example**: `PolicyDetailView.test.tsx` - "Deductible" appears multiple times

### 5. UUID Format for Supabase
- **Problem**: Custom IDs like `policy-123-abc` rejected
- **Solution**: Use `crypto.randomUUID()`
- **File**: `src/lib/ai/policy-extractor.ts`

### 6. Turkish Character Encoding
- **Problem**: İ, Ş, Ğ, Ü, Ö, Ç display issues
- **Solution**: Always use UTF-8, test with Turkish chars
- **Fuzzy matching**: `normalizeForOCR()` handles Turkish characters

### 7. Cached Supabase Sessions
- **Problem**: Old auth state persists
- **Solution**: `localStorage.clear(); location.reload();`

### 8. OCR Character Confusion
- **Problem**: OCR confuses 0/O, 1/l/I, etc.
- **Solution**: Fuzzy matching with Levenshtein distance (0.85 threshold)
- **File**: `src/lib/policy-utils.ts`

### 9. Duplicate Detection False Positives (Fixed Jan 2026)
- **Problem**: Identical policies flagged as amendments due to minor formatting differences
- **Example**: "NO: 25 /1A" vs "NO: 25/1A" incorrectly flagged as different
- **Solution**: Added tolerant string comparison in `src/lib/policy-utils.ts`
- **Functions**: `normalizeStringTolerant()`, `arraysEqualTolerant()`
- **Behavior**: Collapses whitespace, normalizes punctuation around `:`, `/`, `,`, `.`

### 10. API Proxy Not Detected in Production (Fixed Jan 2026)
- **Problem**: "No AI service configured" error on Railway/Vercel deployments
- **Cause**: `VITE_API_PROXY_URL` baked at build time, not available in production
- **Solution**: Auto-detect from `window.location.origin` in production
- **Files**: `src/lib/env.ts`, `src/lib/ai/config.ts`

### 11. PDF.js Worker Blocked by CSP (Fixed Jan 2026)
- **Problem**: PDF parsing fails with "Setting up fake worker" warning
- **Cause**: CSP blocking `unpkg.com` where PDF.js worker is hosted
- **Solution**: Added CDN domains to CSP in `server/index.ts`
- **Domains**: `unpkg.com`, `cdn.jsdelivr.net`, `cdnjs.cloudflare.com`

### 12. ESM Module Resolution in Production
- **Problem**: `Cannot find module './routes/ai'` error on Railway
- **Cause**: Node.js ESM requires `.js` extensions in imports
- **Solution**: Changed `server/tsconfig.json` to `"module": "NodeNext"` and added `.js` extensions
- **Files**: `server/tsconfig.json`, `server/index.ts`, `server/routes/*.ts`

### 13. Kasko Coverage Display Issues (Fixed Jan 14, 2026)
- **Problem**: Multiple display issues with kasko policies:
  - Coverage limit incorrectly summed all limits instead of showing "Rayiç Değer" (market value)
  - "Artan Mali Sorumluluk" showed ₺0 instead of "Sınırsız" (unlimited)
  - "İkame Araç" showed ₺0 instead of "Dahil" (included)
  - False missing coverage alerts for implicit kasko coverages (Çarpma/Çarpışma, Hırsızlık, etc.)
  - Generic recommendations like "Improve Coverage" not actionable
- **Solution**:
  - Added `isUnlimited`, `isMarketValue` flags to Coverage type
  - Added `CoverageCategory` and `CoverageImportance` types
  - Created `KASKO_IMPLICIT_COVERAGES` list to skip false alerts
  - Updated `generateRecommendations()` with specific amounts and actionable advice
  - Added color coding: green (good), yellow (moderate), red (critical exclusions)
- **Files**: `src/types/policy.ts`, `src/lib/ai/policy-extractor.ts`, `src/components/PolicyDetailView.tsx`, `src/lib/policy-evaluation/evaluator.ts`

### 14. Mobile UX Improvements (Jan 16-17, 2026)
- **Problem**: PolicyDetailView and PolicyDashboard not optimized for mobile
  - Information hierarchy unclear on small screens
  - Coverages section too verbose
  - Score breakdown labels truncated ("Complia...")
  - Double checkmarks appearing in AI Insights
  - Grid/filter overflow on mobile

- **Solution (PolicyDetailView)**:
  - Reorganized header: Insurance type (Kasko) as title, provider as subtitle, plate number as third line
  - Removed redundant "Tür: Kasko" from Policy Overview
  - Made sections collapsible/expandable:
    - Score Breakdown: click to toggle mini/full view
    - AI Insights: show first 3, "+X more insights" button
    - Recommendations: show first 2, expand for all
    - Coverage Details: collapsible categories with preview (first 2 items + "+X more")
    - Exclusions: collapsed by default
  - Fixed double checkmarks by stripping existing "✓" from AI insight text
  - Created `CollapsibleCoverageCategory` component for mobile-friendly coverage display
  - Fixed ScoreBreakdown mini variant truncation

- **Solution (PolicyDashboard)**:
  - Fixed grid column overflow on mobile
  - Fixed filter row overflow
  - Redesigned stats cards with compact pill badges for mobile
  - Replaced full stats cards with horizontal scrollable badges on small screens

- **Files**:
  - `src/components/PolicyDetailView.tsx` - Major restructure
  - `src/components/evaluation/ScoreBreakdown.tsx` - Mini variant fix
  - `src/components/PolicyDashboard.tsx` - Mobile overflow fixes
  - `public/sw.js` - Cache version bumped to v6

### 15. Combined Document Processing Pipeline (Jan 18, 2026)
- **Feature**: Two-stage document processing combining deterministic and AI processing
- **Stage 1 - Clean-Room Processing** (`document-normalizer.ts`):
  - Deterministic Turkish OCR spacing fixes (B İ RLE Şİ K → BİRLEŞİK)
  - PII detection and redaction with standardized tokens
  - TC Kimlik, IBAN, phone, email, plate number validation
  - Produces audit-friendly, legally defensible output
  - Three outputs: CLEAN_COPY, REDACTED_COPY, PII_VAULT
- **Stage 2 - AI-Enhanced Processing** (`prompts.ts`):
  - Context-aware OCR correction using AI
  - Structured extraction with universal insurance schema
  - Validation against known Turkish insurance terms
- **New Functions** (`text-processor.ts`):
  - `processDocumentCombined()` - Full two-stage pipeline
  - `processDocumentQuick()` - Lightweight version for simple OCR
  - `processDocumentCleanRoom()` - Deterministic-only processing
- **Benefits**:
  - Deterministic processing handles mechanical fixes reliably
  - AI processing handles context-dependent corrections
  - PII vault preserves sensitive data for authorized access
  - Full audit trail with normalization logs
- **Files**:
  - `src/lib/ai/text-processor.ts` - Combined pipeline functions
  - `src/lib/ai/document-normalizer.ts` - Clean-room normalizer (870+ lines)
  - `src/lib/ai/prompts.ts` - AI prompts for OCR and extraction
  - Tests: 55 text-processor + 49 document-normalizer + 23 prompts = 127 new tests

### 16. Admin Auth 500 Error - Environment Variable Priority (Fixed Jan 20, 2026)
- **Problem**: Admin login returned 500 Internal Server Error on Railway
- **Root Cause**: Server code read `VITE_SUPABASE_URL` first (line 56 in `admin-auth.ts`), but `VITE_*` vars are only available at build time, not runtime on Railway
- **Solution**: Changed env var priority to `SUPABASE_URL` first, `VITE_SUPABASE_URL` as fallback
- **Additional Fix**: Added `getSupabaseWithError()` function for explicit error handling with fail-fast behavior
- **Files**:
  - `server/middleware/admin-auth.ts` - Fixed env var priority, added error-aware functions
  - `server/services/admin-db.ts` - Same fix applied
  - `server/routes/admin.ts` - Returns 503 `DB_NOT_CONFIGURED` when Supabase unavailable

### 17. crypto.randomUUID() Not Available in Production (Fixed Jan 20, 2026)
- **Problem**: `ReferenceError: crypto is not defined` on Railway
- **Root Cause**: `crypto.randomUUID()` was used without importing `crypto` module
- **Solution**: Added `import crypto from 'crypto'` to `server/routes/admin.ts`
- **Note**: While Node.js 19+ has global `crypto`, Railway environments may not expose it

### 18. require('crypto') in ESM Module (Fixed Jan 20, 2026)
- **Problem**: `hashToken()` function used `require('crypto')` which fails in ESM
- **Root Cause**: Server uses `"module": "NodeNext"` (ESM), but `require()` is CommonJS-only
- **Solution**: Changed to proper ES import: `import crypto from 'crypto'`
- **File**: `server/middleware/admin-auth.ts`

### 19. React Hooks Error #310 in AdminDashboard (Fixed Jan 20, 2026)
- **Problem**: `Minified React error #310` when loading admin dashboard
- **Root Cause**: `useCallback` and `useEffect` hooks were placed AFTER conditional returns (`if (authLoading)` and `if (!isAuthenticated)`), violating React Rules of Hooks
- **Solution**: Moved all hooks to top of component, before any conditional returns
- **Pattern**:
  ```tsx
  // WRONG: hooks after early return
  if (loading) return <Spinner />
  const data = useCallback(() => {...}, [])  // ERROR!

  // CORRECT: all hooks first, then conditional returns
  const data = useCallback(() => {...}, [])
  if (loading) return <Spinner />
  ```
- **File**: `src/components/admin/AdminDashboard.tsx`

### 20. Admin Prompts Tab Empty / 401 Errors (Fixed Jan 20, 2026)
- **Problem**: Admin Dashboard Prompts tab showed "No prompt templates found" even though prompts were in database
- **Root Causes**:
  1. Admin components used direct `fetch()` without Authorization headers
  2. API endpoint mismatch: client called `/prompts/templates` but server had routes at `/prompts`
  3. Express route ordering: `/prompts/:id` caught `/prompts/templates` before specific route
- **Solution**:
  1. Added `adminFetch()` wrapper function in `src/lib/admin/api.ts` that auto-includes auth token
  2. Changed API client to use `/prompts` endpoints instead of `/prompts/templates`
  3. Updated all admin tab components to use `adminFetch` instead of raw `fetch`
- **Files Changed**:
  - `src/lib/admin/api.ts` - Added `adminFetch()`, fixed endpoint paths
  - `src/components/admin/AdminDashboard.tsx` - Use adminFetch
  - `src/components/admin/tabs/*.tsx` - All tabs updated to use adminFetch
- **New Files**:
  - `server/services/prompt-service.ts` - Centralized prompt management
  - `supabase/migrations/006_seed_prompts.sql` - Seeds 16 AI prompts

### 21. Admin-Managed AI Prompts System (Added Jan 20, 2026)
- **Feature**: All AI prompts now managed through Admin Dashboard → Prompts tab
- **Database Tables**: `prompt_templates`, `prompt_versions` (created in migration 005)
- **Seeded Prompts** (16 total):
  - Extraction: Master, Type Detection, Kasko, Traffic, Home, Health, Life, DASK, Business, Nakliyat
  - Chat: Policy Chat Assistant
  - OCR: Lightweight Correction, Document Preprocessing, Document Normalization Full
  - Analysis: Coverage Gap Analysis, Extraction Quality Scoring
- **Architecture**:
  - `server/services/prompt-service.ts` - Fetches prompts from DB with in-memory cache (5-min TTL)
  - `server/routes/ai.ts` - Uses prompt-service for extraction/chat prompts with hardcoded fallback
  - Template variables: `{{var}}` and `{{#if var}}...{{/if}}` syntax

### 22. OCR Cleanup Pipeline Unicode Improvements (Fixed Jan 22, 2026)
- **Problem**: OCR pipeline had issues with:
  - Turkish uppercase chars like `İ` (U+0130) and `Ş` (U+015E) not matching in regex character classes
  - Garbage patterns like `a!!!!!a` with embedded control characters persisting
  - QA gates missing remnant detection for control characters
  - Spaced Turkish fragment merging incomplete for mixed-length patterns
- **Root Cause**: Regex character classes `[A-ZÇĞİÖŞÜ]` have encoding issues with Turkish Unicode chars
- **Solution**:
  - Added Unicode-safe `isTurkishUpperChar()` using explicit codepoint checking + `\p{Lu}` fallback
  - Added `isAllTurkishUpper()` function with NFC normalization
  - Added `stripControlChars()` for C0/C1 control character removal
  - New QA gate `no_control_chars` for remnant detection
  - Enhanced LLM cleanup prompt (v5) with detailed issue-specific instructions
  - Lowered high-ASCII detection threshold from 5+ to 3+ characters
- **Files Changed**:
  - `src/lib/pipeline/ocr-sanitizer.ts` - Unicode-safe matching, control char stripping
  - `src/lib/pipeline/qa-gates.ts` - New gate, improved detection, v5 LLM prompt
- **Key Functions**:
  ```typescript
  // Unicode-safe Turkish uppercase check
  function isTurkishUpperChar(char: string): boolean {
    const codepoint = char.codePointAt(0)
    if (TURKISH_UPPER_CODEPOINTS.has(codepoint)) return true
    return /^\p{Lu}$/u.test(char) // Fallback to Unicode property
  }

  // NFC normalization before matching
  const normalizedText = text.normalize('NFC')
  ```

### 23. Turkish Word Boundary Handling in OCR Patterns (Fixed Jan 22, 2026)
- **Problem**: OCR cleanup patterns had multiple issues:
  - TC Kimlik numbers with repeated digits (e.g., `10000000146` with 7 zeros) removed as "repetitive noise"
  - Turkish characters (`ı`,`ş`,`ğ`,`ü`,`ö`,`ç`) are NOT word characters in JS regex, causing `\b` to fail
  - `despaceLeadingSplits` matched lowercase letters, merging "e sigorta" → "esigorta"
  - Words without spacing changed case (e.g., "Anadolu" → "ANADOLU")
  - General Turkish char patterns crossed word boundaries
- **Root Causes**:
  - `/(.)\1{6,}/` pattern caught valid identifier numbers
  - `\b` (word boundary) doesn't work after Turkish chars because `\w` only matches `[A-Za-z0-9_]`
  - Pattern `[TR_ALL]` included both upper and lowercase letters
  - `fixOCRSpacing` replaced matches even without whitespace
- **Solution**:
  - Added exceptions for TC Kimlik/IBAN patterns and 10+ digit numbers in repetitive char detection
  - Use `(?=\s|$)` instead of `\b` at end of patterns containing Turkish chars
  - Changed `despaceLeadingSplits` to only match `[TR_UPPER]` (uppercase letters)
  - Added whitespace check in `fixOCRSpacing` - only replace when `\s` exists in match
  - Removed overly aggressive general Turkish char patterns
- **Files Changed**:
  - `src/lib/pipeline/deterministic-preclean.ts` - TC Kimlik exception, uppercase-only matching
  - `src/lib/ai/document-normalizer.ts` - Word boundary fixes, whitespace check
- **Key Patterns Fixed**:
  ```typescript
  // BEFORE (broken): Turkish chars not at word boundary
  [/\bsigorta\s+l\s*ı\b/gi, 'sigortalı']  // \b after ı fails!

  // AFTER (working): Use lookahead instead
  [/\bsigorta\s+l\s*ı(?=\s|$)/gi, 'sigortalı']  // (?=\s|$) works

  // TC Kimlik preservation
  const hasIdentifierPattern = /\b(?:TC|Kimlik|IBAN|No|Poliçe)\b/i.test(line) ||
                               /\b\d{10,26}\b/.test(line)
  if (!hasIdentifierPattern && /(.)\1{6,}/.test(line)) {
    return { isNoise: true }  // Only remove if NOT an identifier
  }
  ```

### 24. Document Journey Full Content Capture (Added Jan 25, 2026)
- **Feature**: Admin Document Journey viewer now shows actual text content at each stage, not just metadata
- **Problem**: Admins could only see summaries like `text_length: 62459` but not the actual content
- **Solution**:
  - Added `full_input_text`, `full_output_text`, `full_extracted_json` fields to `ProcessingStageRecord`
  - Added `diff_summary` with characters added/removed and sample changes
  - Created `TextContentViewer` component with expandable sections and copy-to-clipboard
  - Created `DiffSummaryViewer` component with side-by-side comparison
  - Updated policy-extractor to log full text at key stages
- **Files Changed**:
  - `src/types/processing-log.ts` - New fields for full content
  - `src/lib/processing-logger.ts` - Updated `CompleteStageOptions` interface
  - `src/lib/ai/policy-extractor.ts` - Log full text at pdf_extraction, text_preprocessing, ai_extraction, validation
  - `src/components/admin/DocumentJourneyViewer.tsx` - New viewer components
- **Stages with Full Content**:
  - `pdf_extraction`: Full extracted PDF text
  - `text_preprocessing`: Before/after text with diff summary
  - `ai_extraction`: Input text and full extracted JSON
  - `validation`: Final validated policy JSON

### 25. Document Journey Decision Context for Skipped Stages (Added Jan 25, 2026)
- **Feature**: When pipeline stages are skipped, admins now see detailed explanation of WHY
- **Problem**: Skipped stages only showed "Text density sufficient" without context
- **Solution**:
  - Added `StageDecisionContext` interface with threshold, actual_values, decision_logic, alternatives
  - Updated `skipStage()` to accept detailed options
  - Added `DecisionContextViewer` component showing:
    - Assessment performed (what was checked)
    - Decision threshold (e.g., chars_per_page < 200)
    - Actual measured values (formatted table)
    - Decision logic explanation
    - What would trigger the stage
- **Files Changed**:
  - `src/types/processing-log.ts` - Added `StageDecisionContext` interface
  - `src/lib/processing-logger.ts` - Updated `skipStage()` method
  - `src/lib/ai/policy-extractor.ts` - Detailed context for ocr_processing, form_field_enhancement, table_parsing skips
  - `src/components/admin/DocumentJourneyViewer.tsx` - `DecisionContextViewer` component
- **Example Decision Context** (for skipped OCR):
  ```typescript
  {
    assessment_performed: 'Text density analysis',
    threshold: { name: 'chars_per_page', value: 200, comparison: 'less_than' },
    actual_values: { chars_per_page: 12492, is_likely_scanned: false },
    decision_logic: 'Text density sufficient (12492 >= 200 threshold)',
    alternatives: ['OCR triggered if chars_per_page < 200']
  }
  ```

### 26. Coverage Name Null Safety (Fixed Jan 25, 2026)
- **Problem**: Validation stage failed with `Cannot read property 'toLowerCase' of undefined` on coverage.name
- **Root Cause**: AI extraction could return coverages with `description` but no `name` field
- **Solution**:
  - Added `getCoverageName()` helper function for null-safe access
  - Updated `convertToAnalyzedPolicy` to fallback name to description
  - Fixed 12+ locations using `.name.toLowerCase()` to use `getCoverageName()`
- **File**: `src/lib/ai/policy-extractor.ts`

### 27. Configuration-Driven OCR Decision Engine (Added Jan 26, 2026)
- **Feature**: Full-featured OCR decision system with JSON configuration and Document Journey metadata
- **Components**:
  - `OCRDecisionEngine` - Main orchestrator with 5-component weighted confidence calculation
  - `LanguageDetector` - Detects Turkish, English, German via term + character matching
  - `PolicyTypeClassifier` - Classifies kasko, traffic, health, fire, life with exclusion terms
  - `TextQualityAnalyzer` - Checks encoding issues, garbage patterns, insurance term density
  - `FieldExtractor` - Tests extraction of policy number, insured name, dates, premium
  - `ConfigurationManager` - Loads JSON configs for locales and policy types
- **Confidence Calculation** (5 weighted components):
  ```typescript
  weights: {
    char_density: 0.25,      // Character density score
    text_quality: 0.30,      // Insurance term matching
    page_variance: 0.15,     // Page-to-page consistency
    encoding_check: 0.15,    // Encoding quality
    field_extraction: 0.15   // Required fields found
  }
  ```
- **Decision Thresholds**:
  - `skip_ocr`: confidence >= 0.70 (good digital PDF)
  - `selective_ocr`: confidence >= 0.40 (OCR specific pages)
  - `full_ocr`: confidence < 0.40 (OCR entire document)
- **Document Journey Metadata**: `buildDocumentJourneyMetadata()` provides full diagnostic output:
  ```typescript
  {
    ocr_decision: {
      action: 'skip_ocr',
      confidence: 0.89,
      confidence_breakdown: { char_density: {...}, text_quality: {...}, ... },
      language_detection: { detected: 'tr', matched_terms: [...], runner_up: {...} },
      policy_classification: { detected: 'motor_kasko', matched_terms: [...], config_used: '...' },
      text_quality: { quality_score: 0.85, garbage_patterns_checked: [...] },
      field_extraction: { extraction_rate: 0.6, fields: { policy_number: {...} } },
      page_analysis: { flagged_pages: [...] },
      reasoning: ['Language detected as TR (85%)', '...']
    }
  }
  ```
- **Files**:
  - `src/lib/ocr-decision/*.ts` - All engine components (7 files)
  - `config/locales/*.json` - Language configs (tr, en, de, _universal)
  - `config/policy_types/**/*.json` - Policy type configs (motor, property, health, _generic)
  - `config/ocr-settings.json` - Thresholds and weights
- **Tests**: 145 tests (81 unit + 64 regression)

### 28. Document AI Page Limit and PDF Splitting (Updated Mar 14, 2026)
- **Problem**: Document AI failing with "Document pages in non-imageless mode exceed the limit: 15 got 16"
- **Root Cause**: Standard Document AI OCR processor (`c2741b178ab61433`) has 15-page API limit per request
- **Initial Attempt (Failed)**: Tried `enableImagelessMode: true` but this option does NOT exist on standard OCR processors
- **Error from API**: `"Invalid JSON payload received. Unknown name enableImagelessMode at process_options.ocr_config: Cannot find field."`
- **Final Solution**: Client-side PDF splitting. `DOCUMENT_AI_PAGE_LIMIT` was later lowered from 15 to **10** to prevent HTTP 403 payload errors on dense PDFs.
- **Files Changed**:
  - `src/lib/ai/pdf-splitter.ts` - **NEW** Splits PDFs using pdf-lib
  - `src/lib/ai/document-ocr.ts` - Chunked extraction with result combining
  - `server/routes/ai.ts` - Removed unsupported options (v5)
- **How It Works**:
  ```
  16-page PDF uploaded
        ↓
  Check page count (16 > 15)
        ↓
  Split into chunks:
    - Chunk 1: pages 1-15
    - Chunk 2: page 16
        ↓
  Process each chunk with Document AI
        ↓
  Combine results with correct page numbers
        ↓
  Return unified result
  ```
- **Key Functions**:
  - `splitPdf()` - Splits PDF into chunks of max 15 pages
  - `getPdfPageCount()` - Quick page count check
  - `extractWithDocumentAIChunked()` - Orchestrates chunk processing
  - `combineChunkResults()` - Merges all chunk results
- **Version Markers in Logs**:
  - `v4`: Attempted `enableImagelessMode: true` (FAILED - not supported)
  - `v5`: Removed unsupported options, use PDF splitting instead
- **Note**: `enableImagelessMode` only works on Enterprise Document OCR processors, not standard ones

### 29. Service Worker Cache Busting for New Deployments (Updated Jan 28, 2026)
- **Problem**: Browser loading old JavaScript bundles after Railway deployment
- **Root Cause**: Service worker cache-first strategy serving stale assets
- **Solution**:
  - Bumped service worker cache version (currently `v9`)
  - Enabled automatic page reload on `controllerchange` event
- **Files Changed**:
  - `public/sw.js` - Cache version `v9`
  - `src/lib/pwa/index.ts` - Added `window.location.reload()` on controller change
- **Pattern**:
  ```typescript
  // In src/lib/pwa/index.ts
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    console.log('[PWA] New service worker activated, reloading page')
    window.location.reload()
  })
  ```

### 30. GCP Service Account Credentials via Base64 Environment Variable (Added Jan 27, 2026)
- **Problem**: Railway doesn't support file mounts for GCP service account JSON
- **Solution**: Support base64-encoded credentials via environment variable
- **Environment Variables Supported**:
  - `GCP_SERVICE_ACCOUNT_BASE64` (preferred)
  - `GCP_CREDENTIALS_BASE64` (fallback)
  - `GOOGLE_APPLICATION_CREDENTIALS` (file path, for local dev)
- **File Changed**: `server/routes/ai.ts`
- **How It Works**:
  1. Server decodes base64 credentials on startup
  2. Writes to temporary file `.gcp-credentials-temp.json`
  3. Uses file path for GoogleAuth initialization
- **To Set Up**:
  ```bash
  # Encode your service account JSON file:
  base64 -w 0 service-account.json
  # Set the output as GCP_SERVICE_ACCOUNT_BASE64 in Railway
  ```

### 31. Admin Diagnostics Endpoint and Improved Error Handling (Added Jan 28, 2026)
- **Problem**: Admin login returned 500 error with no clear indication of what's misconfigured
- **Solution**: Added diagnostic endpoint and improved error handling
- **New Endpoint**: `GET /api/admin/diagnostics` - Returns configuration status without exposing secrets
  ```json
  {
    "success": false,
    "status": "misconfigured",
    "config": {
      "hasJwtSecret": false,
      "jwtSecretLength": "not set",
      "hasSupabaseUrl": true,
      "hasServiceKey": true,
      "supabaseClientInitialized": true
    },
    "issues": ["ADMIN_JWT_SECRET not configured"]
  }
  ```
- **Improved Login Errors**:
  - `JWT_NOT_CONFIGURED` (503) - ADMIN_JWT_SECRET missing
  - `DB_NOT_CONFIGURED` (503) - SUPABASE_URL or SERVICE_ROLE_KEY missing
  - `TOKEN_GENERATION_ERROR` (500) - Token creation failed with details
- **File Changed**: `server/routes/admin.ts`
- **Usage**: Visit `https://insurai-production.up.railway.app/api/admin/diagnostics` to debug deployment issues

### 32. ESLint Cleanup and React Hooks Exhaustive-Deps Fixes (Fixed Jan 29, 2026)
- **Problem**: Multiple code quality issues:
  - 153 ESLint errors (reduced to 0)
  - 161 ESLint warnings (reduced to 48)
  - 4 `react-hooks/exhaustive-deps` warnings with potential stale closure bugs
  - Railway build failure from linter auto-renaming catch block variables
- **Root Causes**:
  - Unused variables, imports, and eslint-disable directives
  - `console.log` usage where `console.warn` expected
  - useEffect dependencies missing complex callback functions
  - Linter renamed `error` to `_error` in catch blocks but code still referenced `error`
- **Solutions**:
  1. **ESLint Errors (153 → 0)**:
     - Removed unused imports/variables or prefixed with `_`
     - Added eslint-disable for intentional patterns (control regex)
     - Fixed useless escapes in character classes
  2. **ESLint Warnings (161 → 48)**:
     - Changed `console.log` to `console.warn` across many files
     - Removed unused eslint-disable directives
     - Remaining 45 are `no-non-null-assertion` (deferred - requires refactoring)
  3. **React Hooks Exhaustive-Deps**:
     - `PolicyUpload.tsx`: Used ref pattern for complex callback chain
     - `AuditTab.tsx`: Used useCallback for fetchLogs
     - `ConfigTab.tsx`: Used useCallback + fixed stale closure bug
  4. **Catch Block Variables**:
     - Changed all 71 `} catch (_error) {` back to `} catch (error) {`
- **Files Changed**:
  - `src/components/PolicyUpload.tsx` - Ref pattern for addFiles
  - `src/components/admin/tabs/AuditTab.tsx` - useCallback for fetchLogs
  - `src/components/admin/tabs/ConfigTab.tsx` - useCallback + stale closure fix
  - `server/routes/admin.ts` - 71 catch block fixes
  - Multiple files in `src/lib/ai/` and `services/` for console.warn changes
- **Patterns for useEffect Dependencies**:
  ```tsx
  // Pattern 1: Ref pattern for complex callback chains
  const addFilesRef = useRef<(files: File[]) => Promise<void>>()
  addFilesRef.current = addFiles  // Keep ref updated
  useEffect(() => {
    addFilesRef.current?.(selectedFiles)
  }, [location, navigate])  // Only stable dependencies

  // Pattern 2: useCallback for simple dependencies
  const fetchData = useCallback(async () => {
    // ... fetch logic
  }, [filter1, filter2])
  useEffect(() => {
    fetchData()
  }, [fetchData])
  ```
- **Stale Closure Bug Fixed**:
  ```tsx
  // BEFORE (bug): error state was stale
  const fetchData = async () => {
    if (!error) {  // Always reads initial error value!
      setError(msg)
    }
  }

  // AFTER (fixed): use local variable
  const fetchData = useCallback(async () => {
    let hasError = false
    // ... fetch and set hasError = true on error
    if (!hasError) {
      setError(msg)
    }
  }, [])
  ```

### 33. Free Trial Upload Flow and Extraction Timeout Fixes (Fixed Jan 30, 2026)
- **Problem**: Multiple issues with anonymous user free trial flow:
  - Files uploaded on landing page returned users to upload page instead of showing results
  - Analysis got stuck at 40% "Extracting text from PDF..." with no timeout
  - No progress feedback during long extractions (Document AI + AI provider can take 60+ seconds)
- **Root Causes**:
  - `UploadWidget.tsx` navigated to `/try` but didn't pass the file to `TryAnalysis.tsx`
  - No timeout mechanism for extraction promises
  - No progress updates during the extraction process
- **Solutions**:
  1. **File Handoff via Router State**:
     ```tsx
     // UploadWidget.tsx - Pass file via state
     navigate('/try', { state: { file: valid[0] } })

     // TryAnalysis.tsx - Receive file from state
     const location = useLocation()
     const state = location.state as LocationState | null
     if (state?.file) {
       processFileFromState(state.file)
     }
     ```
  2. **90-Second Timeout with Promise.race**:
     ```tsx
     const EXTRACTION_TIMEOUT_MS = 90000
     const timeoutPromise = new Promise<never>((_, reject) => {
       setTimeout(() => reject(new Error('Analysis timed out...')), EXTRACTION_TIMEOUT_MS)
     })
     const result = await Promise.race([extractionPromise, timeoutPromise])
     ```
  3. **Progress Updates Every 10 Seconds**:
     ```tsx
     progressInterval = setInterval(() => {
       setProgress((prev) => prev < 85 ? prev + 5 : prev)
       setProgressMessage((prev) => {
         const messages = ['Extracting text...', 'Analyzing structure...', 'Processing with AI...', 'Almost there...']
         const currentIndex = messages.indexOf(prev)
         return currentIndex < messages.length - 1 ? messages[currentIndex + 1] : prev
       })
     }, 10000)
     ```
- **Files Changed**:
  - `src/components/landing/UploadWidget.tsx` - Pass file via router state
  - `src/components/TryAnalysis.tsx` - Accept file from state, add timeout, progress updates
  - `src/components/TryAnalysis.test.tsx` - **NEW** 19 tests for timeout and file handling
  - `src/components/landing/UploadWidget.test.tsx` - **NEW** 13 tests for file handoff
- **Note**: Anthropic API billing issue previously caused fallback to OpenAI, adding latency. **Resolved as of Feb 17, 2026** — `/api/ai/diagnose` confirms `anthropic: { valid: true }`. The 90-second timeout accommodates Document AI OCR (~50s) + AI extraction.

### 34. Session-Based Free Trial for Anonymous Users (Added Jan 30, 2026)
- **Feature**: Anonymous users can now analyze one policy per session without signup
- **Implementation**:
  - `TryAnalysis.tsx` - New component for anonymous trial analysis
  - Session storage tracks trial usage (`insurai_trial_used`)
  - Full analysis results shown (not truncated)
  - Email capture modal after viewing results
  - Share link generation for analysis results
- **User Flow**:
  1. User uploads PDF on landing page (UploadWidget)
  2. File passed via router state to `/try` route
  3. TryAnalysis extracts and analyzes the policy
  4. Full results displayed with score, coverages, gaps
  5. Email capture prompt with "Continue without email" option
  6. Share link available for results
- **Files**:
  - `src/components/TryAnalysis.tsx` - Main trial analysis component
  - `src/components/landing/UploadWidget.tsx` - Updated for anonymous flow
  - `src/App.tsx` - Added `/try` route
- **Commits**: `051db44`, `a434068`, `71df32e`, `6d7923b`

### 35. Simulated Network Error Removed from UploadWidget (Fixed Jan 30, 2026)
- **Problem**: 5% of uploads randomly failed with "Network error" - development code left in production
- **Root Cause**: `UploadWidget.tsx` had `if (Math.random() < 0.05) reject(new Error('Network error'))`
- **Solution**: Removed simulated error, replaced with simple 500ms delay for UX
- **File Changed**: `src/components/landing/UploadWidget.tsx`
- **Commit**: `9887e8d`

### 36. Secure Email Unsubscribe Tokens (Added Jan 30, 2026)
- **Feature**: All marketing emails now include secure unsubscribe links with HMAC-SHA256 tokens
- **Implementation**:
  - `server/routes/email.ts` - Added `generateUnsubscribeToken()` and `verifyUnsubscribeToken()`
  - `server/services/email-service.ts` - Updated `wrapTemplate()` to include unsubscribe links
  - Token is HMAC-SHA256 of email + secret, truncated to 32 chars
  - Timing-safe comparison prevents timing attacks
- **Endpoints**:
  - `POST /api/email/unsubscribe` - Requires valid token
  - `GET /api/email/unsubscribe-token` - Admin endpoint for testing
- **Environment Variable**: `UNSUBSCRIBE_SECRET` (falls back to `ADMIN_JWT_SECRET`)
- **Commits**: `60bd2ba`

### 37. ESLint Warnings Reduced to 45 (Jan 30, 2026)
- **Status**: All 45 remaining warnings are `@typescript-eslint/no-non-null-assertion`
- **Fixed This Session**:
  - Unescaped entities in `TryAnalysis.tsx` (2 occurrences)
  - Unescaped entity in `Hero.tsx` (1 occurrence)
  - `ZodError.errors` → `ZodError.issues` in email routes
- **Remaining Warnings by File**:
  - `services/workflow/.../ocr-pipeline.ts` (18)
  - `src/lib/admin/operations-logger.ts` (10)
  - `services/validate-svc/src/index.ts` (6)
  - Others (11 across 10 files)
- **Note**: These non-null assertions are intentional in guarded code paths
- **Commits**: `858b0cd`, `60bd2ba`

### 38. Migration Files Renamed with Sequential Suffixes (Jan 30, 2026)
- **Problem**: Multiple migration files had same number prefix causing conflicts
- **Solution**: Renamed to use a, b, c suffixes for ordering:
  - `005_admin_schema.sql` → `005a_admin_schema.sql`
  - `005_admin_tables.sql` → `005b_admin_tables.sql`
  - `007_document_processing_logs.sql` → `007a_document_processing_logs.sql`
  - `007_extraction_pipeline.sql` → `007b_extraction_pipeline.sql`
  - `007_email_system.sql` → `007c_email_system.sql`
  - `008_admin_notifications.sql` → `008a_admin_notifications.sql`
  - `008_seed_kasko_benchmark.sql` → `008b_seed_kasko_benchmark.sql`
- **Commit**: `6b72aed`

### 39. Debug Flags Disabled in OCR Decision Engine (Jan 30, 2026)
- **Files Changed**:
  - `src/lib/ocr-decision/language-detector.ts`: `DEBUG_LANGUAGE_DETECTION = false`
  - `src/lib/ocr-decision/policy-classifier.ts`: `DEBUG_POLICY_CLASSIFICATION = false`
  - `src/lib/ocr-decision/ocr-decision-engine.ts`: `DEBUG_CONFIDENCE_CALCULATION = false`
- **Commit**: `6b72aed`

### 40. Google Vision OCR Service Error (Fixed Feb 7, 2026)
- **Status**: Fixed
- **Symptom**: `/api/ai/diagnose` returns `"google": {"valid": false, "error": "Service error"}`
- **Root Causes** (two issues):
  1. **Code**: Diagnostic endpoint sanitized all errors to "Service error" with no error codes, no server logging. Vision OCR auth attempted OAuth even when no service account existed.
  2. **Config**: Google Cloud API key was restricted to "Generative Language API" only — Cloud Vision API and Cloud Document AI API not enabled.
- **Code Fixes**:
  - Added `classifyDiagnosticError()` returning actionable codes: `API_NOT_ENABLED`, `BILLING_ERROR`, `INVALID_CREDENTIALS`, `QUOTA_EXCEEDED`, `NETWORK_ERROR`, `PERMISSION_DENIED`, `SERVICE_ERROR`
  - Added `errorCode` field to `ProviderDiagnostic` interface
  - Added `log.warn()` for all provider diagnostic failures (visible in Railway)
  - Skip unnecessary OAuth call when no service account exists
  - Fixed `/api/ai/providers` to report `google: true` when OAuth credentials available
  - Added AI provider config checks to admin diagnostics endpoint
- **Config Fix**: Added Cloud Vision API and Cloud Document AI API to the API key restrictions in Google Cloud Console
- **Verification**: All 3 providers now report `valid: true` on `/api/ai/diagnose`
- **Files Changed**: `server/routes/ai.ts`, `server/routes/admin/auth.ts`, `src/hooks/useBackendHealth.ts`
- **Commits**: `1cbe80e`, `a81dcba`

### 41. ANTHROPIC_SCHEMA_PROMPT for Reliable Claude JSON Extraction (Added Feb 4, 2026)
- **Problem**: Claude doesn't support OpenAI's `response_format: { type: 'json_object' }` parameter
- **Root Cause**: Anthropic API has no equivalent structured output mode
- **Solution**: Added `ANTHROPIC_SCHEMA_PROMPT` constant in `server/routes/ai.ts` that includes full JSON schema in prompt text
- **Implementation**:
  ```typescript
  const ANTHROPIC_SCHEMA_PROMPT = `
  You are an expert insurance policy analyzer. Extract all policy information and return it as valid JSON.

  ## CRITICAL: Output Format
  You MUST respond with ONLY valid JSON matching this exact schema. Do not include any text before or after the JSON.

  {
    "policyNumber": string | null,
    "provider": string | null,
    "policyType": "kasko" | "traffic" | "home" | "health" | "life" | "dask" | "business" | "nakliyat" | null,
    // ... full schema
    "confidence": { "overall": number, ... }
  }

  ## Important Notes:
  - Dates must be in YYYY-MM-DD format
  - Confidence scores must be between 0 and 1
  - For Turkish policies, include both English (name) and Turkish (nameTr) coverage names

  Now analyze the following policy document:
  `
  ```
- **Endpoints Updated**: `/api/ai/extract/anthropic`, `/api/ai/extract` (unified endpoint)
- **File Changed**: `server/routes/ai.ts`

### 42. proxy-utils.ts for Bundle Optimization (Added Feb 4, 2026)
- **Problem**: Components that only needed proxy URL/status checks were importing the full AI SDK (~400KB)
- **Root Cause**: `isAIConfigured()` and `getProxyUrl()` lived in `config.ts` which imports OpenAI and Anthropic SDKs
- **Solution**: Created `src/lib/ai/proxy-utils.ts` with lightweight versions of these utilities
- **New File** (`src/lib/ai/proxy-utils.ts`):
  ```typescript
  export type AIProvider = 'openai' | 'anthropic'
  export function isProxyConfigured(): boolean { return env.hasProxy }
  export function getProxyUrl(): string | null { return env.proxyUrl }
  export function isAIConfigured(): boolean { /* checks proxy or localStorage keys */ }
  export function isOCRConfigured(): boolean { return isProxyConfigured() }
  export async function checkProxyProviders(): Promise<{openai: boolean; anthropic: boolean; google: boolean}>
  ```
- **Updated Exports** (`src/lib/ai/index.ts`):
  ```typescript
  // Lightweight utilities from proxy-utils (no SDK imports)
  export { isAIConfigured, isOCRConfigured, isProxyConfigured, getProxyUrl, checkProxyProviders, type AIProvider } from './proxy-utils'
  // Heavy utilities that need SDK imports
  export { isProviderConfigured, getConfiguredProviders, AI_CONFIG } from './config'
  ```
- **Files Changed**:
  - `src/lib/ai/proxy-utils.ts` - **NEW** (89 lines)
  - `src/lib/ai/index.ts` - Split exports
  - `src/hooks/useBackendHealth.ts` - Import from proxy-utils

### 43. Dynamic SDK Imports in config.ts (Added Feb 4, 2026)
- **Problem**: AI SDKs were imported at module load time, increasing initial bundle size
- **Solution**: Changed to dynamic imports with caching for lazy loading
- **Implementation**:
  ```typescript
  // Lazy-loaded SDK instances (only imported when needed)
  let cachedOpenAI: InstanceType<typeof import('openai').default> | null = null
  let cachedAnthropic: InstanceType<typeof import('@anthropic-ai/sdk').default> | null = null

  export async function getOpenAIClient(): Promise<...> {
    if (cachedOpenAI) return cachedOpenAI
    // Dynamic import to avoid bundling when not needed
    const { default: OpenAI } = await import('openai')
    cachedOpenAI = new OpenAI({ apiKey, dangerouslyAllowBrowser: true })
    return cachedOpenAI
  }

  export async function getAnthropicClient(): Promise<...> {
    // Similar pattern with dynamic import
  }
  ```
- **Benefits**:
  - SDKs only loaded when AI extraction actually needed
  - Reduced initial bundle size
  - Cached instances prevent repeated imports
- **File Changed**: `src/lib/ai/config.ts`

### 44. GA4 Analytics with KVKK Consent Management (Added Feb 4, 2026)
- **Feature**: Google Analytics 4 integration with Turkish KVKK/GDPR consent compliance
- **Implementation** (`src/lib/analytics.ts`):
  ```typescript
  declare global {
    interface Window {
      gtag?: (...args: unknown[]) => void
      dataLayer?: unknown[]
    }
  }

  interface AnalyticsConfig {
    enabled: boolean
    debug: boolean
    gaMeasurementId: string | null
    consentGiven: boolean
  }

  function initGA4(): void {
    if (!config.gaMeasurementId || typeof window === 'undefined') return
    if (window.gtag) return // Already initialized
    // Load gtag.js script and initialize
  }

  export function setAnalyticsConsent(consent: boolean): void {
    config.consentGiven = consent
    if (consent) initGA4()
  }

  export function hasGivenAnalyticsConsent(): boolean { return config.consentGiven }
  ```
- **Consent Flow**:
  1. User sees consent banner on first visit
  2. User accepts/rejects analytics
  3. If accepted, GA4 script loads and tracking begins
  4. Consent stored in localStorage for persistence
- **Environment Variable**: `VITE_GA_MEASUREMENT_ID` (optional)
- **File Changed**: `src/lib/analytics.ts`

### 45. i18n Translation Extensions for Policy UI (Added Feb 4, 2026)
- **Feature**: Added comprehensive translation sections for policy analysis UI
- **New Sections** in `TranslationDictionary`:
  ```typescript
  insights: { title: string; aiInsights: string; showMore: string; showLess: string; noInsights: string }
  evaluation: { title: string; overallScore: string; grade: string; premium: string; coverage: string; ... }
  comparison: { title: string; compareWith: string; differences: string; noPolicies: string; ... }
  insurance: { kasko: string; traffic: string; home: string; health: string; life: string; dask: string; ... }
  coverageCategories: { main: string; liability: string; supplementary: string; assistance: string; legal: string; other: string }
  ```
- **Languages**: Both Turkish (tr) and English (en) translations provided
- **File Changed**: `src/lib/i18n/translations.ts`

### 46. DecisionContextViewer Enabled in Document Journey (Added Feb 4, 2026)
- **Feature**: Admin Document Journey viewer now shows detailed decision context for skipped pipeline stages
- **Problem**: DecisionContextViewer component was implemented but commented out
- **Solution**: Enabled the component and added `formatValue()` helper for proper value display
- **Implementation**:
  ```typescript
  function formatValue(value: unknown): string {
    if (value === null || value === undefined) return 'N/A'
    if (typeof value === 'string') return value
    if (typeof value === 'number') return String(value)
    if (typeof value === 'boolean') return value ? 'Yes' : 'No'
    if (typeof value === 'object') return JSON.stringify(value)
    return String(value)
  }
  ```
- **Information Displayed**:
  - Assessment performed (what was checked)
  - Decision threshold (e.g., `chars_per_page < 200`)
  - Actual measured values (formatted table)
  - Decision logic explanation
  - What would trigger the stage
- **File Changed**: `src/components/admin/DocumentJourneyViewer.tsx`

### 47. English Translations for Kasko Knowledge Base (Added Feb 4, 2026)
- **Feature**: Added `questionEn` and `detailsEn` fields to Turkish kasko knowledge patterns
- **Purpose**: Support bilingual UI and future English-language policy analysis
- **File Changed**: `src/lib/knowledge/kasko-knowledge.ts`
- **Pattern**:
  ```typescript
  {
    id: 'deprem_teminati',
    question: 'Deprem hasarları teminat kapsamında mı?',
    questionEn: 'Is earthquake damage covered?',
    details: '...',
    detailsEn: '...',
    category: 'coverage'
  }
  ```

### 48. Railway Build Configuration Update (Added Feb 4, 2026)
- **Change**: Added explicit `installCommand` to Railway configuration
- **Purpose**: Ensure consistent dependency installation on Railway deployments
- **File Changed**: `railway.json`
  ```json
  {
    "build": {
      "builder": "NIXPACKS",
      "installCommand": "npm ci",
      "buildCommand": "npm run build && npm run build:server"
    }
  }
  ```
- **Note**: `npm ci` ensures clean install from package-lock.json

### 49. Service Worker Cache Version v12 (Updated Feb 4, 2026)
- **Change**: Bumped service worker cache version from v11 to v12
- **Purpose**: Force cache invalidation after new deployment with bundle changes
- **File Changed**: `public/sw.js`
- **Note**: Users may need hard refresh (Ctrl+Shift+R) or clear site data if seeing stale content

### 50. Bundle Analysis Output Ignored (Added Feb 4, 2026)
- **Change**: Added `stats.html` to `.gitignore`
- **Purpose**: Prevent bundle analysis report from being committed
- **File Changed**: `.gitignore`
- **Usage**: Run `npm run build:analyze` to generate stats.html for bundle inspection

### 51. Bundle Chunking Optimization Attempt (Feb 4, 2026)
- **Problem**: `useBackendHealth` chunk was 676KB due to AI SDK imports
- **Initial Attempt**: Aggressive manual chunking with separate vendor chunks for React, Supabase, OpenAI, Anthropic, etc.
- **Result**: Reduced chunk sizes but caused circular dependency issues
- **Error**: `Cannot access 'na' before initialization` in `vendor-common` chunk
- **Root Cause**: Separating modules that have initialization order dependencies
- **Learning**: Aggressive `manualChunks` can break module initialization order in Rollup/Vite
- **Commits**: `b5f525a` (optimization), `05627d4` (fix)

### 52. Circular Dependency Fix in Bundle Chunking (Fixed Feb 4, 2026)
- **Problem**: Page wouldn't load after deployment - JavaScript initialization error
- **Error**: `Uncaught ReferenceError: Cannot access 'na' before initialization` at `vendor-common-H-RuQgAK.js`
- **Root Cause**: Aggressive `manualChunks` in `vite.config.ts` created circular dependencies
- **Solution**: Simplified chunking to only split truly independent large libraries (pdfjs, pdf-lib)
- **File Changed**: `vite.config.ts`
- **Before**:
  ```typescript
  manualChunks(id) {
    if (id.includes('react')) return 'vendor-react'
    if (id.includes('@supabase')) return 'vendor-supabase'
    if (id.includes('openai')) return 'vendor-openai'
    if (id.includes('@anthropic-ai')) return 'vendor-anthropic'
    if (id.includes('node_modules')) return 'vendor-common'  // PROBLEMATIC
  }
  ```
- **After**:
  ```typescript
  manualChunks(id) {
    // Only split large, truly independent libraries
    if (id.includes('pdfjs-dist')) return 'vendor-pdfjs'
    if (id.includes('pdf-lib')) return 'vendor-pdflib'
    // Let Vite handle the rest to avoid initialization errors
  }
  ```
- **Key Insight**: The catch-all `vendor-common` chunk combined modules with hidden interdependencies
- **Commit**: `05627d4`

### 53. File Upload Flow Fix for Logged-In Users (Fixed Feb 4, 2026)
- **Problem**: When logged-in users clicked "Analyze Your Policy Free" on landing page, selected a file, they were redirected to `/upload` but the file was lost
- **Root Cause**: `TryAnalysis.tsx` detected logged-in user and redirected to `/upload` without passing the file
- **Solution**: Pass file via React Router state when redirecting
- **Files Changed**:
  - `src/components/TryAnalysis.tsx` - Pass file in redirect: `navigate('/upload', { state: { files: [file], autoProcess: true } })`
  - `src/components/PolicyUpload.tsx` - Handle files from location state
- **Pattern Used**:
  ```typescript
  // TryAnalysis.tsx - Pass file when redirecting logged-in user
  useEffect(() => {
    if (user) {
      const locationState = location.state as { file?: File } | null
      const fileFromState = locationState?.file
      if (fileFromState) {
        navigate('/upload', { state: { files: [fileFromState], autoProcess: true }, replace: true })
      } else {
        navigate('/upload', { replace: true })
      }
    }
  }, [user, navigate, location.state])

  // PolicyUpload.tsx - Receive and process file from state
  useEffect(() => {
    const state = location.state as { files?: File[]; autoProcess?: boolean } | null
    if (state?.files && state.files.length > 0 && !filesReceivedRef.current) {
      filesReceivedRef.current = true
      addFilesRef.current?.(state.files)
      navigate(location.pathname, { replace: true, state: null })
    }
  }, [location, navigate])
  ```
- **Commit**: `37ef119`

### 54. Comprehensive Configuration System (Added Feb 5, 2026)
- **Feature**: Three-tier configuration system making 843+ hardcoded values configurable
- **Architecture**:
  - **Tier 1**: System defaults in `src/lib/config/types.ts` (always available)
  - **Tier 2**: Admin settings in `app_settings` database table
  - **Tier 3**: User preferences in `user_preferences` table
- **Database Tables Created**:
  - `app_settings` - Key-value configuration with JSON schemas
  - `settings_audit_log` - Automatic audit trail for all changes
  - `user_preferences` - Per-user preference overrides
  - `market_benchmarks` - Versioned market benchmark data
  - `insurance_providers` - 15 Turkish insurance providers
  - `regional_factors` - 7 Turkish regions with risk factors
  - `feature_flags` - Feature flag management
- **Key Files**:
  - `src/lib/config/configuration-service.ts` - Singleton with 5-minute cache
  - `src/lib/config/types.ts` - TypeScript types and default values
  - `server/routes/settings.ts` - Admin API endpoints
  - `supabase/migrations/012_configuration_system.sql` - Database schema
  - `supabase/migrations/013_seed_configuration_defaults.sql` - Seeds all hardcoded values
- **Usage**:
  ```typescript
  import { configService, getAIConfig, isFeatureEnabled } from '@/lib/config'

  // Get typed configuration
  const aiConfig = await configService.getAIConfig()
  console.log(aiConfig.temperature)  // 0.1

  // Check feature flags
  if (await isFeatureEnabled('new_evaluation_algorithm')) {
    // Use new algorithm
  }
  ```
- **Categories**: ai, evaluation, rate_limits, ocr, fuzzy_matching, gap_analysis, ui, email
- **Tests**: 46 unit tests for ConfigurationService

### 55. Railway Build: TypeScript Not Found (Fixed Feb 5, 2026)
- **Problem**: Railway build failed with `sh: 1: tsc: not found`
- **Root Cause**: `npm ci` in production mode doesn't install devDependencies, but TypeScript is required for the build step
- **Solution**: Changed `installCommand` in `railway.json` from `npm ci` to `npm ci --include=dev`
- **File Changed**: `railway.json`
- **Commit**: `d8687be`

### 56. Connect Admin Settings to Application Functionality (Added Feb 5, 2026)
- **Feature**: Database-stored admin settings now actively control application behavior
- **Components Connected**:
  1. **AI Settings** → Extraction endpoints (model selection, temperature, timeouts)
  2. **Evaluation Settings** → Policy scoring (weights, grade thresholds)
  3. **Rate Limits** → API middleware (requests per hour by endpoint)
  4. **OCR Settings** → OCR Decision Engine (thresholds, confidence weights)
- **OCR Decision Engine Integration**:
  - Added `updateFromDatabaseConfig()` method to ConfigurationManager
  - Added `isDatabaseConfigApplied()` and `resetToBaseSettings()` methods
  - Added `refreshSettings()` and `getConfigurationManager()` to OCRDecisionEngine
  - New exports: `initializeOCREngineWithConfig()`, `resetOCRDecisionEngine()`
- **Pattern** (deep copy with database overrides):
  ```typescript
  // ConfigurationManager stores base JSON settings
  private baseOcrSettings: OCRSettings  // Original from JSON
  private ocrSettings: OCRSettings      // Active settings (base + DB overrides)

  updateFromDatabaseConfig(dbConfig: OCRConfig): void {
    // Start with deep copy of base, apply DB overrides
    this.ocrSettings = this.applyDatabaseConfig(dbConfig)
    this.databaseConfigApplied = true
  }

  resetToBaseSettings(): void {
    this.ocrSettings = this.baseOcrSettings
    this.databaseConfigApplied = false
  }
  ```
- **Feature Flag**: `use_db_config` enabled by default (100% rollout)
- **Files Changed**:
  - `src/lib/ocr-decision/configuration-manager.ts` - DB config integration
  - `src/lib/ocr-decision/ocr-decision-engine.ts` - Refresh and getter methods
  - `src/lib/ocr-decision/index.ts` - New exports
  - `src/lib/admin/config-manager.ts` - Feature flag default
  - `supabase/migrations/013_seed_configuration_defaults.sql` - Enable flag
- **New Tests** (49 tests):
  - `configuration-manager-db.test.ts` - 17 tests for DB config merging
  - `ocr-engine-db-init.test.ts` - 13 tests for engine initialization
  - `configurable-thresholds.test.ts` - 19 tests for grade/status thresholds
- **Commits**: `e7acaf7`, `0cc16f4`

### 57. Admin Settings UI with Validation and History (Added Feb 5, 2026)
- **Feature**: Complete Admin Dashboard Settings UI with client-side validation and audit history
- **Components Created**:
  - `SettingsTab.tsx` - Main tab container with category navigation (AI, Evaluation, Rate Limits, OCR, Feature Flags, History)
  - `AISettingsPanel.tsx` - Configure AI models, temperatures, timeouts
  - `EvaluationSettingsPanel.tsx` - Configure policy evaluation weights and grade thresholds
  - `RateLimitsPanel.tsx` - Configure API rate limits per endpoint
  - `OCRSettingsPanel.tsx` - Configure OCR decision engine thresholds and weights
  - `FeatureFlagsPanel.tsx` - Manage feature flags with rollout percentages
  - `SettingsHistoryPanel.tsx` - View audit log with search, category filter, pagination
- **Validation System** (`src/lib/admin/settings-validation.ts`):
  - Validators: `numberRange`, `percentage`, `ratio`, `positiveInteger`, `required`, `oneOf`, `milliseconds`
  - Composite validators: `validateWeightsSum`, `validateGradeThresholds`, `validateOCRConfidenceOrder`
  - Helper functions: `getValidationClass`, `shouldDisableSave`, `getValidationDescription`
- **Settings History API** (`server/routes/settings.ts`):
  - `GET /api/admin/settings/history` - Paginated audit log with category filter
  - Resolves admin user emails for `changed_by` UUIDs
  - Returns transformed entries with camelCase properties
- **New Tests** (108 tests):
  - `settings-validation.test.ts` - 62 tests for validators and composite validators
  - `SettingsHistoryPanel.test.tsx` - 27 tests for component states and interactions
  - `settings-routes.test.ts` - 19 tests for API data transformation and pagination
- **Files Changed**:
  - `src/components/admin/tabs/SettingsTab.tsx` - Added History tab to navigation
  - `server/routes/settings.ts` - Added `/history` endpoint
  - `server/middleware/rate-limit.ts` - Fixed unused variable lint error
- **Commits**: `ae66160`, `b2a5c0a`, `a9547f0`, `dee49a9`

### 58. Fix Pre-Existing Test Failures (Fixed Feb 6, 2026)
- **Problem**: 8 test files had 9 pre-existing failures across component and settings tests
- **Root Causes**: Missing AuthProvider wrappers, incorrect mock patterns, stale assertions
- **Solution**: Fixed all 9 failures across 8 test files
- **Result**: Full test suite now passes: 192 files, 6338 tests, 0 failures
- **Commit**: `d4292cb`

### 59. Settings Export/Import for Admin Configuration (Added Feb 6, 2026)
- **Feature**: Admin dashboard can now export all settings as JSON and import them for backup/restore
- **Export** (`GET /api/admin/settings/export`):
  - Exports all categories of settings as structured JSON
  - Includes metadata: `exportedAt`, `version`, `settingsCount`
  - Downloads as `insurai-settings-YYYY-MM-DDTHH-MM-SS.json`
- **Import** (`POST /api/admin/settings/import`):
  - Validates JSON structure and setting values before applying
  - Preview mode: shows changes that would be made before committing
  - Dry-run validation: `?dryRun=true` returns preview without applying
  - Reports skipped/failed/applied counts
- **Admin UI** (integrated in `SettingsTab.tsx`):
  - Export button in settings header
  - Import dialog with file selection and preview
  - Shows settings count, categories, and per-setting changes before applying
  - Success/error feedback with detailed results
- **New Tests**:
  - `SettingsExportImport.test.tsx` - 15 UI tests
  - `settings-routes.test.ts` - 18 new API tests (export validation, import dry-run, etc.)
- **Commit**: `303316a`

### 60. Config Fetch Performance Monitoring with TTL Recommendations (Added Feb 6, 2026)
- **Feature**: Tracks ConfigurationService fetch latency to validate the 5-minute cache TTL
- **Client-Side Monitor** (`src/lib/config/config-performance-monitor.ts`):
  - Rolling window: 1000 events, 1 hour max retention
  - Tracks: category, method, latencyMs, cacheHit, success, errorMessage
  - Computes: latency percentiles (p50, p95, p99), cache hit rates, per-category breakdown
  - TTL recommendation engine:
    - Suggests lower TTL if hit rate >90% and DB latency <50ms
    - Suggests higher TTL if hit rate <50% or DB latency >200ms
    - Reports confidence level (high/medium/low) based on sample size
- **ConfigurationService Instrumentation** (`configuration-service.ts`):
  - `get()`, `getCategory()`, `isFeatureEnabled()` methods now record timing with `performance.now()`
  - Tracks cache hits, misses, errors, and latency to performance monitor
  - Added `getPerformanceSnapshot()` public method
- **Server-Side** (`server/routes/settings.ts`):
  - In-memory server-side performance monitor (parallel to client)
  - `GET /api/admin/settings/performance` - Returns server metrics snapshot
  - `POST /api/admin/settings/performance` - Accepts client-side metrics for logging
- **Admin UI Panel** (`ConfigPerformancePanel.tsx`):
  - Client/Server source toggle with auto-refresh (5s interval)
  - Summary cards: Total Fetches, Cache Hit Rate, DB Avg Latency, Error Rate
  - DB Fetch Latency Distribution: Min/Avg/P50/P95/P99/Max with color-coded thresholds
  - Per-Category Breakdown table with fetch count, avg latency, hit rate, errors
  - Cache TTL Recommendation section with confidence level
  - Recent Events log (last 20 events in reverse chronological)
- **SettingsTab Updated**: Added Performance tab (Activity icon) to category navigation
- **New Tests** (39 total):
  - `config-performance-monitor.test.ts` - 21 unit tests
  - `settings-routes.test.ts` - 7 new server tests
  - `ConfigPerformancePanel.test.tsx` - 11 UI tests
- **Key Pattern** (performance instrumentation):
  ```typescript
  async get<T>(category: string, key: string, defaultValue: T): Promise<T> {
    const start = performance.now()
    const cached = this.cache.get(cacheKey)
    if (cached) {
      configPerformanceMonitor.record({
        category, method: 'get', latencyMs: performance.now() - start,
        cacheHit: true, success: true
      })
      return cached
    }
    // ... fetch from DB, record miss
  }
  ```
- **Commit**: `9093818`

### 61. Admin Routes Modularization (Refactored Feb 7, 2026)
- **Problem**: `server/routes/admin.ts` was 3,390 lines — difficult to navigate, review, and maintain
- **Solution**: Split into 9 focused modules under `server/routes/admin/`
- **Modules Created**:
  - `auth.ts` - Login, session management, diagnostics (410 lines)
  - `users.ts` - User management (164 lines)
  - `prompts.ts` - Prompt template CRUD (701 lines)
  - `operations.ts` - Audit logs, security events (780 lines)
  - `monitoring.ts` - Health, metrics, notifications (321 lines)
  - `content.ts` - Content management (678 lines)
  - `cost.ts` - Cost tracking (352 lines)
  - `shared.ts` - Shared utilities, Supabase client (141 lines)
  - `index.ts` - Router aggregator (31 lines)
- **Migration**: No API changes — all endpoints preserved, just reorganized internally
- **Commit**: `038d2cd`

### 62. Structured Server Logging (Added Feb 7, 2026)
- **Feature**: Centralized logging module with configurable levels for server-side code
- **File**: `server/lib/logger.ts` (95 lines)
- **Levels**: `debug` (dev), `info` (production default), `warn`, `error`
- **Production level**: Changed from `warn` to `info` to make extraction timing and AI provider diagnostics visible in Railway logs
- **Override**: Set `LOG_LEVEL=warn` env var to suppress info if needed
- **Commit**: `c7f3d4a`

### 63. Security Hardening - HSTS and Crypto (Added Feb 7, 2026)
- **HSTS**: Added `Strict-Transport-Security` header via Helmet in production
  - `maxAge: 31536000` (1 year), `includeSubDomains: true`
  - File: `server/index.ts`
- **Crypto**: Replaced `Math.random()` with `crypto.getRandomValues()` for share link IDs
  - `Math.random()` is not cryptographically secure; share links should be unpredictable
  - File: `src/lib/free-trial.ts`
- **Commits**: `542333a`, `4819bc0`

### 64. User Preferences with Three-Tier Config Override (Added Feb 7, 2026)
- **Feature**: Users can override select admin settings with personal preferences
- **Three-tier resolution**: System defaults → Admin settings → User preferences
- **Components**:
  - `src/lib/config/user-overridable.ts` - Defines which settings are user-overridable
  - `src/hooks/useUserPreferences.ts` - React hook for reading/writing user preferences
  - `src/components/UserPreferencesPanel.tsx` - UI panel for preference management
- **Tests**: 201 (UserPreferencesPanel) + 251 (useUserPreferences) + 201 (user-overridable) = 653 new tests
- **Commit**: `cc4e584`

### 65. Config Drift Detection (Added Feb 7, 2026)
- **Feature**: Detects when runtime configuration differs from a saved baseline snapshot
- **Components**:
  - `server/services/drift-detection-service.ts` - Core drift detection logic with baseline snapshots
  - `server/routes/drift.ts` - API endpoints for drift management
  - `src/components/admin/tabs/settings/ConfigDriftPanel.tsx` - Admin UI for drift monitoring
  - `supabase/migrations/015_config_drift_baselines.sql` - Baseline storage table
- **Tests**: 212 (drift detection service) + 191 (ConfigDriftPanel)
- **Commit**: `765abaf`

### 66. Settings Webhooks (Added Feb 7, 2026)
- **Feature**: Notify external systems when admin settings change
- **Components**:
  - `server/services/webhook-service.ts` - Webhook delivery with retry logic (585 lines)
  - `server/routes/webhooks.ts` - Webhook CRUD and test endpoints
  - `src/components/admin/tabs/settings/SettingsWebhooksPanel.tsx` - Admin webhook management UI
  - `supabase/migrations/014_settings_webhooks.sql` - Webhook configuration tables
- **Tests**: 51 (webhook service) + 284 (SettingsWebhooksPanel)
- **Commit**: `5f11bed`

### 67. Settings Templates (Added Feb 7, 2026)
- **Feature**: Predefined configuration profiles (e.g., "High Performance", "Cost Optimized")
- **Components**:
  - `src/lib/admin/settings-templates.ts` - Template definitions and management
  - `src/components/admin/tabs/settings/SettingsTemplatesPanel.tsx` - Template browser and apply UI
- **Tests**: 206 (settings-templates) + 301 (SettingsTemplatesPanel)
- **Commit**: `516fab9`

### 68. Batch Settings Update and Visual Diff (Added Feb 7, 2026)
- **Batch Update**: Update multiple settings in a single API call
  - Endpoint: `PUT /api/admin/settings/batch`
  - Validates all settings before applying any (atomic operation)
- **Visual Diff**: Side-by-side comparison of old vs new values in settings history
  - Component: `src/components/admin/tabs/settings/SettingsDiffViewer.tsx`
- **Tests**: 410 (SettingsDiffViewer)
- **Commits**: `71096d9`, `8f5fd4d`

### 69. Performance Monitoring Alerts (Added Feb 7, 2026)
- **Feature**: Auto-alert when config performance metrics exceed thresholds
- **Triggers**: Cache hit rate drops below threshold, DB latency exceeds threshold, error rate spikes
- **Commit**: `bec8ac1`

### 70. Document AI Server-Side Timeout (Added Feb 7, 2026)
- **Problem**: Document AI OCR requests could hang indefinitely, blocking the extraction pipeline
- **Solution**: Added 60-second `AbortSignal.timeout()` on server-side Document AI fetch, increased client-side timeout to 120 seconds
- **File**: `server/routes/ai.ts`
- **Commit**: `ed7ac1d`

### 71. Extraction Fallback Returning Mock Data in Production (Fixed Feb 7, 2026)
- **Problem**: "Try Policy Analysis" page showed mock/sample policy data instead of real AI results
- **Root Cause**: `extractPolicyFromDocument()` called with default `useFallback: true`, so when any extraction error occurred, `createFallbackResult()` returned `success: true` with random sample data from `samplePolicies[]` — completely masking real errors
- **Solution (4 commits)**:
  1. Disabled fallback in TryAnalysis: both extraction paths now pass `{ useFallback: false }`
  2. Added fallback source detection: reject results with `source === 'fallback'`
  3. Added diagnostic `console.error` at all 5 `createFallbackResult` call sites
  4. Fixed invisible server logs (production log level `warn` → `info`)
  5. Fixed sanitized error messages (server was returning "Unable to process document" in production)
  6. Fixed `extractViaProxy` to propagate server `details` field to client
  7. Bumped SW cache to v13 to clear stale ErrorBoundary crash
  8. Made ErrorBoundary show error details in production (was gated behind `import.meta.env.DEV`)
- **Key Insight**: The fallback mechanism is useful for development/demos but must be disabled in production extraction paths where users expect real AI results
- **Files Changed**:
  - `src/components/TryAnalysis.tsx` - `{ useFallback: false }`, fallback source detection
  - `src/lib/ai/policy-extractor.ts` - Diagnostic logging at all fallback sites, error details in messages
  - `src/lib/ai/config.ts` - `extractViaProxy` propagates server error `details`
  - `server/routes/ai.ts` - Always include error details in responses, timing instrumentation
  - `server/lib/logger.ts` - Production log level `warn` → `info`
  - `public/sw.js` - CACHE_VERSION v12 → v13
  - `src/components/ErrorBoundary.tsx` - Show error details in production
- **Commits**: `0e62fe1`, `37cac0c`, `1954792`, `dfbc443`

### 72. Dependency Upgrade Plan (Added Feb 7, 2026)
- **Feature**: Documented 5-stage risk-tiered dependency upgrade plan
- **File**: `docs/DEPENDENCY_UPGRADE_PLAN.md` (171 lines)
- **Stages**: Stage 1 (safe patches) → Stage 2 (low-risk minor) → Stage 3 (moderate breaking) → Stage 4 (high-risk major) → Stage 5 (framework major)
- **Commit**: `b77db22`

### 73. Production Hardening: JSON Parse, Startup Validation, Rate Limits, Logging (Added Feb 7, 2026)
- **Problem**: Four production resilience gaps identified during comprehensive audit:
  1. Unguarded `JSON.parse()` in extract endpoints — Anthropic/OpenAI invalid JSON crashes server
  2. No startup environment variable validation — missing config discovered only at request time
  3. Processing log endpoints (`/api/ai/processing-logs/*`) had no rate limiting
  4. 20+ `console.log` calls in server code instead of structured logger
- **Solutions**:
  1. Wrapped `JSON.parse` in try-catch with structured error logging and descriptive error messages
  2. Added startup env var check in `server/index.ts` — warns on missing `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_JWT_SECRET`
  3. Added `generalLimiter` (60 req/min) to all 4 processing log endpoints
  4. Replaced 20+ `console.log`/`console.error` with `log.info()`/`log.warn()`/`log.error()` across 4 files
- **Files Changed**:
  - `server/routes/ai.ts` — JSON parse guards, rate limiting
  - `server/index.ts` — Startup env var validation
  - `server/routes/admin/auth.ts` — Structured logging (20 replacements)
  - `server/services/prompt-service.ts` — Structured logging
  - `server/services/processing-log-service.ts` — Structured logging
  - `server/middleware/rate-limit.ts` — Structured logging
- **Commit**: `1696480`

### 74. Silent .catch(() => {}) Error Swallowing (Fixed Feb 7, 2026)
- **Problem**: 10 fire-and-forget `.catch(() => {})` patterns across server code silently swallowed errors on cost tracking, admin notifications, security event logging, and alert persistence
- **Impact**: Failures in these non-critical paths were completely invisible in Railway logs, making debugging impossible
- **Solution**: Replaced all 10 with `.catch((err) => log.warn('description', { context, error: err instanceof Error ? err.message : String(err) }))` so failures appear in logs
- **Occurrences Fixed**:
  - `server/routes/ai.ts` (6): Cost recording (Anthropic + OpenAI) + admin notifications (billing, rate limit, auth errors)
  - `server/routes/admin/auth.ts` (3): Security event logging for failed login attempts (user not found, inactive account, wrong password)
  - `server/middleware/monitoring.ts` (1): Alert persistence + added logger import
- **Pattern**:
  ```typescript
  // BEFORE: Silently swallowed
  recordUsage({ ... }).catch(() => {})

  // AFTER: Logged with context
  recordUsage({ ... }).catch((err) => log.warn('Failed to record usage', {
    requestId, error: err instanceof Error ? err.message : String(err)
  }))
  ```
- **Commit**: `6e5263f`

### 75. Dead Code Cleanup — ~17,800 Lines Removed (Feb 8, 2026)
- **Problem**: Coverage audit revealed significant dead code: 5 unused hooks, 3 orphaned library modules, 3 dead type files, 1 dead utility module, and 8 dead exports in active files
- **Dead Hooks Removed**: `useAnalytics` (→ `src/lib/analytics.ts`), `usePrivacy` (→ `src/lib/privacy/`), `useMarketData` (→ `src/data/market-data/`), `useIndustryRisk` (→ `src/lib/regional-benchmark/`), `usePolicyTemplates` (→ `server/services/prompt-service.ts`)
- **Dead Libraries Removed**: `src/lib/data-repository/` (7 files), `src/lib/industry-risk/` (5 files), `src/lib/policy-templates/` (7 files)
- **Dead Types Removed**: `src/types/data-repository.ts`, `src/types/industry-risk.ts`, `src/types/policy-template.ts`
- **Dead Utility Removed**: `src/lib/preflight-check.ts`
- **Dead Exports Removed from Active Files**:
  - `src/lib/free-trial.ts`: `getShareUrl()`
  - `src/lib/policy-utils.ts`: `getSimilarityLabelTr()`, `getSignificanceLabel()`, `getSignificanceLabelTr()`
  - `src/lib/policy-upload-check.ts`: `ConflictSummary`, `getConflictSummary()`
  - `src/lib/insurance-display.ts`: `getCoverageLabel()`
- **Verification**: All exports confirmed 0 production imports via `grep -r` (excluding test files)
- **Impact**: Tests reduced from 6,338 (192 files) → 5,801 (181 files) — no production functionality lost
- **Commit**: `de83f8d`

### 76. Production Hardening Phase 3 (Feb 8, 2026)
- **Feature**: Medium/low priority hardening and comprehensive test coverage additions
- **Changes**:
  - PDF magic byte validation (`%PDF-` header check) in `server/routes/pdf.ts`
  - Hidden source maps for Sentry error tracking in `vite.config.ts`
  - Fix 4 silent `.catch(() => {})` in IndexedDB cache with debug-mode logging
  - Railway CLI rollback in GitHub Actions production workflow
  - Service worker background sync with IndexedDB pending queue
  - npm audit overrides for transitive vulnerabilities in `@lhci/cli`
  - Node.js version updated to 22 in CI workflows (matches `.nvmrc`)
- **New Tests**: 111 tests across 5 files (admin-auth, pdf-splitter, document-ocr, pdf-routes, admin-flows E2E)
- **Commit**: `acfa3ad`

### 77. Missing requestId in Anthropic Extraction Endpoint (Fixed Feb 8, 2026)
- **Problem**: Railway build failed with `TS2552: Cannot find name 'requestId'` at `server/routes/ai.ts:603`
- **Root Cause**: Standalone `/api/ai/extract/anthropic` endpoint referenced `requestId` in `log.error()` but never defined it (the OpenAI and unified endpoints both had it)
- **Fix**: Added `const requestId = 'ext-ant-${Date.now()}'` at the top of the handler
- **Commit**: `41782f7`

### 78. Flaky duration_ms Assertion in OCR Regression Test (Fixed Feb 8, 2026)
- **Problem**: `ocr-decision-engine.regression.test.ts` intermittently failed on `expect(decision.duration_ms).toBeGreaterThan(0)`
- **Root Cause**: `performance.now()` granularity varies by environment — operation can complete in 0ms
- **Fix**: Changed to `toBeGreaterThanOrEqual(0)`
- **Commit**: `de83f8d`

### 79. Comprehensive Audit Hardening (Feb 8, 2026)
- **Scope**: App-wide audit identified 5 issue categories; all resolved
- **JSON.parse Crash Prevention** (3 files):
  - `server/lib/sentry.ts` — Wrapped `JSON.parse(event.request.data)` in try-catch
  - `server/services/webhook-service.ts` — Eliminated re-parse by threading `webhookEvent` parameter through `attemptDelivery()`
  - `server/services/admin-db.ts` — Wrapped `JSON.parse(row.value)` in `mapConfig()` with fallback logging
- **Structured Logging** (5 files, 21 calls replaced):
  - `server/middleware/cost-control.ts` — Added logger import + child
  - `server/middleware/validation.ts` — Added logger import + child, changed to `log.debug`
  - `server/routes/pdf.ts` — Added logger import + child
  - `server/services/processing-log-service.ts` — 8 `console.error` → `log.error`
  - `server/services/prompt-service.ts` — 13 `console.warn/error` → `log.warn/error`
- **Admin Route Logging** (9 modules, 69 calls replaced):
  - All 9 admin route modules under `server/routes/admin/` — `console.error` → structured logger
  - Commit: `1d2ca31`
- **Rate Limiting** (3 endpoints):
  - `POST /api/email/capture` → `authLimiter` (10 req/15min)
  - `POST /api/email/unsubscribe` → `authLimiter` (10 req/15min)
  - `POST /api/pdf/extract` → `aiExtractionLimiter` (20 req/hr)
  - Note: All routes already had global `generalLimiter` (100/15min) via `server/index.ts`
- **Commit**: `ce16af0`

### 80. Critical Module Test Coverage (Added Feb 8, 2026)
- **Problem**: 4 critical server modules had 0 test coverage totaling 2,088 lines
- **Solution**: Added 275 comprehensive tests across 4 new test files
- **Test Files Created**:
  - `server/__tests__/admin-auth.test.ts` — 65 tests: JWT token gen/verify, bcrypt password hashing, `authenticateAdmin` middleware, `requireRole`, `requirePermission`, integration flows
  - `server/__tests__/email-routes.test.ts` — 71 tests: HMAC-SHA256 unsubscribe token gen/verify, all 7 email endpoints via supertest, secret fallback chain, capture-unsubscribe roundtrip
  - `server/__tests__/cost-control.test.ts` — 58 tests: Cost calculation for all providers, budget CRUD, budget checking with block/warn/notify, alert system, usage tracking aggregation, Express middleware
  - `src/lib/free-trial.test.ts` — 84 tests: All 15 exported functions, mocked localStorage, 24h expiry logic, share URLs, lifecycle integration
- **Key Testing Patterns Used**:
  - `vi.hoisted()` for mock variables referenced in `vi.mock()` factories (avoids TDZ errors)
  - `vi.resetModules()` + dynamic `import()` for testing module-level initialization (JWT secret, env vars)
  - In-memory state isolation: cost-control budgets persist across tests; deactivate blocking budgets in subsequent tests
  - `supertest` for Express route testing with mocked middleware
- **Commit**: `1f81423`

### 81. TryAnalysis Refactor (Feb 8, 2026)
- **Problem**: `TryAnalysis.tsx` had duplicated extraction logic between proxy and direct paths (156 lines)
- **Solution**: Extracted shared `runExtraction()` helper, consolidated both code paths
- **Result**: 154 net lines removed, single code path for extraction with timeout and progress
- **Commit**: `a06e850`

### 82. Tier 1 Dependency Upgrades (Feb 8, 2026)
- **Upgraded**: Safe patch/minor dependencies per `docs/DEPENDENCY_UPGRADE_PLAN.md` Stage 1
- **TypeScript 5.9 fixes**: Resolved new type errors from stricter checking
- **Commit**: `2c23c2b`

### 83. E2E Extraction Flow Tests (Added Feb 8, 2026)
- **File**: `e2e/extraction-flow.spec.ts` — 14 Playwright tests covering upload → extract → display pipeline
- **Commit**: `a2bcd52`

### 84. Vision OCR Server-Side Timeout (Added Feb 8, 2026)
- **Problem**: Vision OCR fetch had no timeout, could hang indefinitely
- **Solution**: Added 60s `AbortSignal.timeout()` on server-side fetch, timeout detection on both OCR routes
- **Commit**: `a91c833`

### 85. Market Data DB Migration (Added Feb 9, 2026)
- **Feature**: Core business logic (gap analyzers, evaluator, extractor, comparison) now uses `ConfigurationService` DB instead of static files
- **Previously**: Static files in `src/data/market-data/` were the only source — DB tables were seeded but not consumed
- **Now**: `MarketDataService` provides DB-first access with static file fallback
- **Files Changed**:
  - `src/lib/market-data/service.ts` — New `MarketDataService` with async DB-backed methods
  - `src/lib/ai/comparison.ts` — Switched from static imports to async `MarketDataService`
  - `src/lib/ai/multi-ai-analysis.ts` — Switched to async market data access
  - `src/lib/ai/policy-extractor.ts` — Updated to use async benchmarks
- **Commit**: `4e8711a`

### 86. User Profile Functional Tests (Added Feb 9, 2026)
- **Feature**: 21 new functional tests for `src/lib/supabase/user-profile.ts`
- **File**: `src/lib/supabase/user-profile.functional.test.ts`
- **Coverage**: Profile CRUD, preferences, avatar handling, validation
- **Commit**: `c901281`

### 87. Major Dependency Upgrades (Feb 9, 2026)
- **Express 4 → 5** (`379c2a0`): Universal wildcard `app.get('*')` → `app.get(/.*/)`, `req.query` returns `unknown`, async errors auto-forwarded
- **Vite 6 → 7** (`01a5e42`): With `@vitejs/plugin-react` 4 → 5
- **React 18 → 19** (`eb0d66f`): `useRef()` requires initial value — `useRef<T>()` → `useRef<T | undefined>(undefined)`
- **Vitest 2 → 4** (`23ef73d`): Arrow function mocks can't be constructors — must use `function()` syntax for `new`
- **lucide-react + tailwind-merge** (`e1eae25`): Minor version bumps
- **globals + jsdom** (`fcd9593`): Tooling updates
- **express-rate-limit 7 → 8** (`759a2f9`): Requires `validate: { keyGeneratorIpFallback: false }` on custom keyGenerators
- All upgrades follow `docs/DEPENDENCY_UPGRADE_PLAN.md` tiers

### 88. Tiered Confidence System for AI Extraction (Added Feb 9, 2026)
- **Feature**: Two-tier confidence thresholds for extraction results
  - `minConfidence` (0.4): Hard rejection — extraction fails below this
  - `warningConfidence` (0.7): Warning — results shown with caution banner
- **Components Updated**:
  - `src/lib/ai/policy-extractor.ts` — Checks both thresholds, adds `confidenceWarning` flag
  - `src/components/PolicyUpload.tsx` — Shows warning banner for low-confidence extractions
  - `src/components/TryAnalysis.tsx` — Warning banner in free trial flow
  - `src/components/PolicyDetailView.tsx` — Persistent warning on policy detail page
  - `src/lib/config/types.ts` — New `warningConfidence` setting in AIConfig
  - `src/components/admin/tabs/settings/AISettingsPanel.tsx` — Admin UI for warning threshold
- **Commit**: `7e1729e`

### 89. Mobile Landing Page UX Overhaul (Feb 9, 2026)
- **Problem**: Multiple UX issues on mobile anonymous user landing page:
  - CTA not visible above the fold (buried below 9 staggered items)
  - Brand name hidden on mobile
  - Fabricated stats throughout (4.9/5, 15K+, 50+, 2300+, 24/7)
  - Fake testimonials with invented names
  - Page too long on mobile (redundant sections)
- **Fixes across 4 commits** (`203784f`, `b195fd8`, `a35a6c1`, `e0cbaf4`):
  1. **Hero restructured**: CTA moved to 3rd position in StaggeredList, brand always visible, utility bar hidden on mobile, sub-headline shortened, headline `text-3xl` on smallest screens
  2. **CTA tightened**: Grouped CTA + "Free, no signup required" micro-copy + trust badges (KVKK, SSL) into single block, shadow on CTA button, secondary CTA demoted to text link
  3. **Stats replaced**: Fabricated counters (2300+, 15K+, 98%, 24/7) → authentic capabilities (7 policy types, TR/EN, 15+ checks, <60s)
  4. **ComparisonMock**: "Kasko A/B" → real provider names (Allianz/AXA) with disclaimer
  5. **TrustedProviders**: "50+ Turkish Insurers" → "Works with major Turkish insurers"
  6. **SampleReportPreview**: Expanded compact version with 3-line bulleted deliverables
  7. **WhyChooseUs**: Fabricated stats (4.9/5, 15K+, 50+) → authentic differentiators (KVKK Compliant, No Signup Required, Turkey-Focused)
  8. **Testimonials**: Fake names/quotes → honest use-case scenarios for 3 audience types
  9. **Mobile page length**: Hidden WhoItsFor, PolicyComparisonSection, CompareSection on mobile
- **Files Changed**: Hero.tsx, Hero.test.tsx, UploadWidget.tsx, Stats.tsx, Stats.test.tsx, ComparisonMock.tsx, TrustedProviders.tsx, SampleReportPreview.tsx, WhyChooseUs.tsx, WhyChooseUs.test.tsx, Testimonials.tsx, Testimonials.test.tsx, LandingPage.tsx

### 90. Comprehensive i18n for All User-Facing Components (Feb 11, 2026)
- **Feature**: Complete internationalization (TR/EN) for all user-facing components using `useTranslation` hook
- **Scope**: 20+ components across landing page, navigation, policy detail, upload, and preferences
- **Phases**:
  1. **Landing page + Navigation** (`0e14e55`): Hero, Benefits, HowItWorks, Stats, FAQ, Footer, ComparisonMock, SampleReportPreview, TrustedProviders, Testimonials, WhyChooseUs, GlobalNavigation
  2. **CTA + Comparison** (`6694321`): CompareSection, StickyMobileCTA, PolicyComparisonSection, WhoItsFor + 64 language consistency tests
  3. **Core components** (`a10f57e`): TryAnalysis, PolicyDetailView, UserPreferencesPanel
  4. **Coverage names + AI insights** (`9c5b910`, `97b0660`): Locale-aware coverage name display, AI insight translation
  5. **Auth-gated components** (`c4779bb`, `523b136`): PolicyChat, PolicyUpload — full i18n with test mock updates
- **Translation Architecture**:
  - `src/lib/i18n/translations.ts` — `TranslationDictionary` interface + `COMMON_LOCALES` + back-compat re-exports
  - `src/lib/i18n/translations-en.ts` — `EN_TRANSLATIONS` (eager, in main bundle)
  - `src/lib/i18n/translations-tr.ts` — `TR_TRANSLATIONS` (lazy async Vite chunk, 14 KB gzip)
  - `src/lib/i18n/i18n-context.tsx` — React context with `useTranslation()` hook returning `{ t, locale, isLoading }`
  - Default locale: `'tr'` (Turkish market focus)
  - Locale persisted in localStorage under key `'insurai_locale'`
- **Coverage Name Translation**:
  - **Problem**: AI extraction sets both `name` and `nameTr` to the same English value (line 1242 in `policy-extractor.ts`)
  - **Solution**: 90+ entry `COVERAGE_NAME_TR` fallback map in `PolicyDetailView.tsx`
  - `getLocalizedCoverageName()` checks: (1) `nameTr` differs from `name`? Use it. (2) Exact match in map? Use translation. (3) Case-insensitive match? Use it. (4) Fall back to `nameTr || name`
- **AI Insight Translation**:
  - **Problem**: `generateAIInsightsAsync()` produces English-only strings (strengths, gaps, recommendations)
  - **Solution**: `translateInsight()` function with 12 exact translations + 3 dynamic pattern matchers
  - Handles prefixes (✓ ⚠ 💡 ❌): strips, translates text, re-adds prefix
  - Dynamic patterns: "Missing common coverage: X", "Invalid TC Kimlik: X", "Market premiums increased N% YoY"
- **Test Coverage**:
  - 64 language consistency tests (key parity, non-empty values, EN/TR difference, CTA regression)
  - Updated test files for TryAnalysis (18 tests), PolicyDetailView (44 tests)
  - i18n mock pattern: `vi.mock('@/lib/i18n/i18n-context', () => ({ useTranslation: () => ({ t: EN_TRANSLATIONS, locale: 'en', isLoading: false }) }))`
- **Key Files Changed**:
  - `src/lib/i18n/translations.ts` — Added `tryAnalysis` (35 keys), `preferences` (18 keys), 30+ landing keys, CTA/comparison/WhoItsFor keys
  - `src/components/PolicyDetailView.tsx` — `getLocalizedCoverageName()`, `translateInsight()`, `COVERAGE_NAME_TR` map
  - `src/components/TryAnalysis.tsx` — All ~25 hardcoded strings → `t.tryAnalysis.*`
  - `src/components/UserPreferencesPanel.tsx` — All ~15 strings → `t.preferences.*`
  - 14 landing components — All strings → `t.landing.*`
  - `src/components/GlobalNavigation.tsx` — All nav strings → `t.nav.*`, `t.landing.*`
  - `src/lib/i18n/__tests__/language-consistency.test.ts` — 64 tests for translation parity
- **Commits**: `0e14e55`, `da6744e`, `6694321`, `a10f57e`, `9c5b910`, `97b0660`, `c4779bb`, `523b136`

### 91. Navigation Bar Overhaul — Globe Language Picker & Consistency (Feb 12, 2026)
- **Feature**: Unified navigation experience across all pages with Globe-icon language switcher
- **Changes**:
  1. **Globe Language Picker**: Added to both GlobalNavigation (app pages) and Hero (landing page) — TR/EN radio buttons with flag labels
  2. **Landing Page Nav**: Upload button opens file picker directly instead of navigating to `/upload`; Sign In link for anonymous users; mobile hamburger menu with inline TR/EN toggle
  3. **Nav Bar Consistency**: Removed redundant ArrowLeft back buttons from AllSamplesDemo and HelpCenter — GlobalNavigation provides navigation above all non-landing pages
  4. **Dead Button Cleanup**: Removed non-functional Settings/Bell/QuestionMark buttons from Hero nav
- **Navigation Architecture**:
  - `Hero.tsx` nav: Landing page only (`/`) — includes logo, nav links, Globe picker, user menu/Sign In
  - `GlobalNavigation.tsx`: All app pages (controlled by `hideNavigation` in App.tsx) — includes logo, nav links, Globe picker, notifications, profile dropdown
  - `hideNavigation` excludes: `/`, `/auth`, `/admin/*`, `/unsubscribe`
  - Pages showing GlobalNavigation should NOT have their own back arrows (PolicyDashboard pattern = title only)
- **Files Changed**:
  - `src/components/GlobalNavigation.tsx` — Added Globe language picker, direct file upload from nav
  - `src/components/landing/Hero.tsx` — Added Globe picker, Sign In link, mobile language toggle, dead button removal
  - `src/components/landing/StickyMobileCTA.tsx` — i18n integration
  - `src/components/AllSamplesDemo.tsx` — Removed ArrowLeft, added i18n
  - `src/components/HelpCenter.tsx` — Removed ArrowLeft, full i18n rewrite
- **Commits**: `679b448`, `7819465`, `7d7f062`, `ec91a9d`, `33acfc2`, `3dabff7`, `d892f95`, `fe457f7`

### 92. i18n for Auth, Help, Shared Result, and Sample Policies Pages (Feb 12, 2026)
- **Feature**: Full i18n integration for 4 additional pages that had hardcoded English strings
- **Pages Updated**:
  1. **AuthPage.tsx** — Login/signup form: name placeholder ("John Doe" → `t.auth.namePlaceholder`), email placeholder ("you@example.com" → `t.auth.emailPlaceholder` / "siz@ornek.com"), error messages, OAuth buttons
  2. **AllSamplesDemo.tsx** — Sample policies grid: title, description, coverage/premium labels, status badges, "View Details" button
  3. **HelpCenter.tsx** — Full rewrite: 4 help categories with descriptions, 5 popular articles, search placeholder, contact support section (24 translation keys)
  4. **SharedResult.tsx** — All states (not found, expired, found): policy summary labels, coverage display, exclusions, AI insights, CTA section (26 translation keys)
- **New Translation Sections Added**:
  - `auth`: Added `emailPlaceholder`, `namePlaceholder`, `authNotConfigured`, `authNotConfiguredDesc`, `continueToDemo`
  - `help`: Expanded from 7 → 24 keys (added `searchPlaceholder`, `gettingStartedDesc`, `policyAnalysis`, `policyAnalysisDesc`, `faqDesc`, `troubleshooting`, `troubleshootingDesc`, `articlesCount`, `popularArticles`, `article1-5`, `stillNeedHelp`, `stillNeedHelpDesc`, `chatWithAI`)
  - `shared`: New section with 26 keys for shared analysis viewer
  - `policy`: Added `viewDetails`, `perYear`
- **Dynamic String Pattern**: `t.help.articlesCount.replace('{count}', String(count))`
- **Files Changed**: `translations.ts` (+644 lines across all sessions), `AuthPage.tsx`, `AllSamplesDemo.tsx`, `HelpCenter.tsx`, `SharedResult.tsx`
- **Commits**: `71c7b10`, `9c26d69`, `f12b95f`

### 93. Database-Driven i18n Translation System (Added Feb 12, 2026)
- **Feature**: Transforms hardcoded i18n system (685+ keys × 2 languages) into a database-driven, admin-managed translation system
- **Architecture** (7 phases):
  1. **Database schema**: 5 tables (`translation_locales`, `translation_keys`, `translations`, `translation_audit_log`, `translation_metadata`)
  2. **Server API**: `TranslationService` with CRUD, caching, Zod validation (`server/services/translation-service.ts`)
  3. **Client pipeline**: API fetch → version-aware localStorage cache → preloaded fallback (`src/lib/i18n/translation-service.ts`)
  4. **Admin UI**: TranslationsTab with inline editing, coverage stats, import/export (`src/components/admin/tabs/TranslationsTab.tsx`)
  5. **Dynamic languages**: `useLanguageSelector` hook for Globe pickers to show DB-defined locales
  6. **AI-assisted bulk translation**: Batched OpenAI processing endpoint for translating missing keys
  7. **Migration**: Coverage names (90 entries) and AI insight translations (15 entries) moved from `PolicyDetailView` into i18n system
- **Database Migrations**: `017_translation_system.sql`, `018_seed_translations.sql`, `019_seed_coverage_insight_translations.sql`
- **Tests**: 363 translation-specific tests
- **New Files**: 9 (service, routes, tests, migrations, admin UI)
- **Modified Files**: 18 (i18n context, translations, components, tests)
- **Commits**: `08bcfef`, `716f2e0`

### 94. Stale HTML Cache Causing 404 on Hashed Assets (Fixed Feb 12, 2026)
- **Problem**: After Railway deployment, browsers loaded cached `index.html` referencing old chunk filenames (Vite generates new content hashes), causing 404 errors on JS/CSS assets
- **Root Cause**: `express.static` served `index.html` with `maxAge='1d'`, so browsers cached HTML for 24 hours
- **Solution**: Split static serving into two layers:
  - `/assets/*` (hashed filenames): `Cache-Control: max-age=31536000, immutable` (1 year, safe because filenames change on content change)
  - Everything else (`index.html`, `sw.js`): `Cache-Control: no-cache, must-revalidate` (always fetch fresh)
- **File Changed**: `server/index.ts`
- **Commit**: `2c4b057`

### 95. Service Worker Cache v19 (Feb 12, 2026)
- **Change**: Bumped service worker cache version from v18 to v19 (later bumped to v20 for push notifications)
- **Purpose**: Force cache invalidation after translation system deployment
- **File Changed**: `public/sw.js`
- **Commit**: `7277e9c`

### 96. Sample Policy Cards Expandable Detail View (Feb 16, 2026)
- **Problem**: Sample policy cards on `/samples` page had non-functional "View Details" button, AI insights not translated to Turkish, no way to see full policy details
- **Solution**:
  - Added expandable detail view showing coverages (with limits/deductibles), exclusions, special conditions, AI confidence bar, insured person, location, period
  - Added `translateInsight()` function using `t.insightTranslations` map for AI insight translation
  - Coverage names display locale-aware (`nameTr` for Turkish, `name` for English)
  - Toggle button switches between "View Details"/"Hide Details" with icons
  - Added 10 new Turkish translations for sample-specific AI insights
  - Added 9 new `policy` translation keys: `hideDetails`, `coverageDetails`, `exclusions`, `specialConditions`, `included`, `notIncluded`, `insuredPerson`, `location`, `period`, `confidence`
- **Files Changed**: `src/components/AllSamplesDemo.tsx`, `src/lib/i18n/translations.ts`
- **Commit**: `6b8b691`

### 97. Admin Settings Routes Unreachable — Express Route Ordering Bug (Fixed Feb 16, 2026)
- **Problem**: Admin Settings History panel showed "No history records found" despite records existing in database. Also affected `/regional-factors`, `/providers`, and `/benchmarks` endpoints.
- **Root Cause**: Classic Express route ordering bug — `/history`, `/regional-factors`, `/providers`, `/benchmarks` routes were defined AFTER `/:category` catch-all in `server/routes/settings.ts`. Express matched `history` as a `:category` parameter, queried `app_settings WHERE category = 'history'`, and returned empty results.
- **Solution**: Moved all specific named routes (`/history`, `/regional-factors*`, `/providers*`, `/benchmarks*`) before the `/:category` and `/:category/:key` catch-all routes
- **Route Order (Correct)**:
  ```
  /                          (list all settings)
  /performance               (metrics)
  /export, /import           (backup/restore)
  /batch                     (batch update)
  /feature-flags             (feature flag management)
  /history                   ← MOVED before catch-all
  /regional-factors          ← MOVED before catch-all
  /providers                 ← MOVED before catch-all
  /benchmarks                ← MOVED before catch-all
  /:category                 (catch-all — LAST)
  /:category/:key            (catch-all — LAST)
  ```
- **File Changed**: `server/routes/settings.ts`
- **Commit**: `4a58731`

### 98. i18n for MyAccount, Settings, and ComparePolicies (Feb 17, 2026)
- **Feature**: Full i18n integration for 3 remaining app pages with hardcoded English strings
- **Pages Updated**:
  - `MyAccount.tsx` — Profile fields, subscription info, account actions
  - `Settings.tsx` — All setting categories (appearance, notifications, AI config, export, security)
  - `ComparePolicies.tsx` — Comparison table headers, empty states, metric labels
- **Redundant ArrowLeft buttons removed** from all 3 pages (GlobalNavigation provides nav)
- **~100 new TR/EN translation entries** added to `translations.ts`
- **Test updates**: Settings.test.tsx updated for i18n mock pattern
- **Files Changed**: `MyAccount.tsx`, `Settings.tsx`, `ComparePolicies.tsx`, `translations.ts`, `Settings.test.tsx`
- **Commits**: `3af8b77`, `581b060`, `74c544f`

### 99. Coverage nameTr Fixed at Extraction Time (Feb 17, 2026)
- **Problem**: AI extraction set both `name` and `nameTr` to the same English value, requiring a 90+ entry display-time fallback map in `PolicyDetailView.tsx`
- **Root Cause**: `convertToAnalyzedPolicy()` in `policy-extractor.ts` copied English name to `nameTr` without translation
- **Solution**: Created canonical `src/lib/i18n/coverage-names.ts` as single source of truth for EN→TR coverage name mapping (167 lines, 90+ entries)
  - `convertToAnalyzedPolicy()` now resolves `nameTr` at extraction: AI-provided → canonical map lookup → English fallback
  - `PolicyDetailView.getLocalizedCoverageName()` simplified to field selection with legacy fallback
  - Duplicate coverage maps removed from `translations.ts` (replaced with shared import)
  - `ExtractedCoverage` interface updated with `nameTr` field
  - OpenAI JSON schema updated to request `nameTr` from AI
- **Key File**: `src/lib/i18n/coverage-names.ts` — canonical EN→TR coverage name map
- **Files Changed**: `coverage-names.ts` (new), `policy-extractor.ts`, `PolicyDetailView.tsx`, `extraction-schema.ts`, `translations.ts`
- **Commit**: `fc1fe9e`

### 100. Redundant ArrowLeft Back Button Removed from PolicyUpload (Feb 17, 2026)
- **Problem**: PolicyUpload had its own back arrow, conflicting with GlobalNavigation
- **Solution**: Removed ArrowLeft button and 2 associated tests, following PolicyDashboard pattern (title only)
- **Files Changed**: `PolicyUpload.tsx`, `PolicyUpload.test.tsx`
- **Commit**: `90b11df`

### 101. JSONB Version Increment Fix in Translation Trigger (Feb 17, 2026)
- **Problem**: Translation system DB trigger failed to increment version counter
- **Root Cause**: `value::text` produces quoted string `"1"` which fails integer cast
- **Solution**: Use `value #>> '{}'` to extract plain text without JSON quotes
- **File Changed**: `supabase/migrations/017_translation_system.sql`
- **Commit**: `05f0f9c`

### 102. ESLint Errors in Test Files (Fixed Feb 17, 2026)
- **Problem**: 2 ESLint errors introduced in recent test changes
  - `server/__tests__/translation-routes.test.ts:535` — constant binary expression (`'true' === 'true'`)
  - `src/components/Settings.test.tsx:574` — unused `toast` variable
- **Solution**: Used typed variables for dryRun comparison; prefixed unused import with `_`
- **Result**: ESLint now at 0 errors, 20 warnings (down from 46 warnings)
- **Commit**: `b9e498d`

### 103. UnsubscribePage i18n (Added Feb 18, 2026)
- **Feature**: Last page with hardcoded Turkish strings now uses the i18n translation system
- **Problem**: UnsubscribePage.tsx had 22 hardcoded Turkish strings without locale support
- **Solution**: Added `unsubscribe` section to `TranslationDictionary` with 22 TR/EN keys; component now uses `useTranslation()` hook
- **Translations Added**: title, titleSuccess, titleError, invalidLink, areYouSure, willNotReceive, marketingEmails, specialOffers, productUpdates, willContinue, confirmButton, processing, successMessage, changeYourMind, retry, connectionError, connectionErrorDetails, unsubscribeFailed, pleaseTryLater, backToHome, footer
- **Files Changed**: `src/components/UnsubscribePage.tsx`, `src/lib/i18n/translations.ts`
- **Commit**: `525bd52`

### 104. AI Insights Translated at Extraction Time — aiInsightsTr (Added Feb 18, 2026)
- **Feature**: AI insights are now translated to Turkish at extraction time, persisted as `aiInsightsTr` array
- **Problem**: AI insights (`policy.aiInsights`) were always English strings, requiring display-time translation with `translateInsight()` — brittle, couldn't handle new patterns, ran on every render
- **Solution**:
  - Added `aiInsightsTr?: string[]` field to `AnalyzedPolicy` interface in `src/types/policy.ts`
  - Created `translateInsightToTr()` and `translateInsightsToTr()` in `policy-extractor.ts` — mirrors display-time logic but runs once at extraction
  - Called at 3 points: `convertToAnalyzedPolicy()`, after validation insight prepend, and `comprehensiveToAnalyzedPolicy()`
  - `PolicyDetailView` updated with `getLocalizedInsight()` that prefers `aiInsightsTr[i]` when locale is Turkish, falling back to legacy `translateInsightLegacy()` for old extractions
  - Original `translateInsight()` renamed to `translateInsightLegacy()` for clarity
- **Benefits**: Single translation at extraction → persisted with policy → no per-render cost, consistent across views
- **Backward Compatible**: Policies extracted before this change still work via legacy fallback
- **Files Changed**: `src/types/policy.ts`, `src/lib/ai/policy-extractor.ts`, `src/components/PolicyDetailView.tsx`
- **Commit**: `b6f3d16`

### 105. Massive Test Coverage Push — 49.6% → 81.6% Lines (Feb 18, 2026)
- **Feature**: Comprehensive test coverage expansion adding ~3,300 tests across 50+ test files
- **Before**: 6,252 tests (190 files), 49.6% statements, 77.2% branches
- **After**: 9,541 tests (222 files), 80.4% statements, 70.2% branches, 81.6% lines
- **Key New Test Files** (selected highlights):
  - `server/__tests__/ai-routes-extended.test.ts` — 112 tests for all AI extraction/chat routes
  - `server/__tests__/prompt-versioning.test.ts` — Prompt template versioning
  - `server/__tests__/admin-db.test.ts` — Admin database operations
  - `server/__tests__/admin-content-routes.test.ts` — Content management routes
  - `server/__tests__/admin-cost-routes.test.ts` — Cost tracking routes
  - `server/__tests__/admin-monitoring-routes.test.ts` — Monitoring routes
  - `src/lib/ai/policy-extractor.test.ts` — Policy extraction logic
  - `src/lib/ai/text-processor.test.ts` — Combined document processing pipeline
  - `src/lib/ai/openai.test.ts` — OpenAI integration
  - `src/lib/gap-detection/gap-detection-branches.test.ts` — Gap detection branches
  - `src/lib/security/security-branches.test.ts` — Security module branches
  - `src/lib/privacy/data-subject-rights.test.ts` — KVKK data subject rights
  - `src/lib/knowledge/kasko-knowledge.test.ts` — Kasko knowledge base
  - `src/lib/regional-benchmark/*.test.ts` — Regional benchmark branches
  - `src/hooks/usePolicyEvaluation.test.ts` — Policy evaluation hook
  - `src/hooks/usePolicyComparison.test.ts` — Policy comparison hook
  - `src/components/PolicyCard.test.tsx` — Policy card component
  - `src/components/ConflictResolutionDialog.test.tsx` — Conflict resolution UI
- **ESLint Impact**: 33 ESLint errors initially introduced (all in test files — unused mock variables); **all resolved in Feb 19 session** (`0856102`)
- **Commits**: `478fe4d`, `542f593`

### 106. Branch Coverage Test Push — 76 New Test Files, 14,484 Total Tests (Feb 19, 2026)
- **Feature**: Massive branch coverage expansion adding 76 new test files with ~4,900 additional tests
- **Before**: 9,541 tests (222 files), 70.2% branches
- **After**: 14,484 tests (299 files), ~77% branches
- **Scope**: Targeted branch coverage gaps across all major subsystems:
  - **Server**: admin-auth, admin-content, admin-monitoring, admin-users, ai-ocr, cost-control, logger, rate-limit, config-service, drift-detection, monitoring, processing-log, prompt-service, email-service, webhook-service, translation-service, routes
  - **Components**: AuthPage, MyAccount, PolicyChat, PolicyUpload, TryAnalysis, GradeBadge, WinnerBadge, Hero
  - **Libraries**: AI (comparison, extraction-validator, document-ocr, OCR, claude provider, turkish-utils), analytics, env, gap-detection, i18n-context, insurance-display, market-data, OCR decision engine (language-detector, policy-classifier), pdf-export, pipeline (ai-ocr-cleaner, contradiction-detector, data-requests, document-chunker, ocr-confidence, ocr-sanitizer, ocr-stats, pattern-store, pipeline-logger, qa-gates, qa-scoring, turkish-ocr-normalizer, version), policy-evaluation, policy-utils, privacy (consent-manager), processing-logger, security (audit-logger, rate-limiter, security-monitor), sentry, supabase (client, policies), utils
  - **Types**: pdf-report coverage
- **ESLint Resolution**: 33+47+29 ESLint errors from test files fixed across three commits (`3172796`, `b31547b`, `0856102`); total ESLint now 0 errors, 47 warnings
- **Test Failures Fixed**: 7 test failures in coverage files (session ID property name, iPad UA detection, flaky timing assertion)
- **Translation Migration Script**: `scripts/apply-translation-migrations.sh` added (`290cadb`)
- **Commits**: `3172796`, `290cadb`, `f544b8f`, `b31547b`, `e32131a`, `0856102`

### 107. Lighthouse Optimization — Performance 76→99, CLS 0.506→0.005 (Feb 19, 2026)
- **Problem**: Lighthouse audit revealed Performance 76/100 with CLS 0.506 (5× over budget) and Accessibility 95/100
- **Root Causes** (4 CLS sources + 2 a11y issues):
  1. **Service worker controllerchange reload**: `skipWaiting()` + `clients.claim()` fires `controllerchange` on first visit. Handler called `window.location.reload()`, causing full page reload mid-render (biggest CLS source)
  2. **Empty #root spinner → full content**: `#root:empty::before` showed a centered 40px spinner, then React mounted the full landing page — massive layout shift
  3. **Framer Motion y-axis animations**: `PageTransition`, `StaggeredList`, `FadeInWhenVisible` all used `y: 20` translateY, causing content to shift vertically on mount
  4. **Lazy-loaded LandingPage**: Entry point was behind `React.lazy()` + `Suspense`, causing flash from `PageLoader` spinner to full content
  5. **Accessibility**: `text-green-600` and `text-gray-400` on white background failed WCAG AA contrast
- **Solutions**:
  1. Track `hadControllerOnLoad` — only reload when existing controller is replaced, not on initial install (`src/lib/pwa/index.ts`)
  2. App shell skeleton in `index.html` matching above-the-fold landing page dimensions (nav bar + hero content placeholders with pulse animation)
  3. Changed all three animation components to opacity-only (`src/components/animations/AnimatedComponents.tsx`)
  4. Eagerly import `LandingPage` instead of lazy-loading; removed `PageTransition` wrapper from `/` route (`src/App.tsx`)
  5. `text-green-600` → `text-green-700`, `text-gray-400` → `text-gray-500` (`ComparisonMock.tsx`, `UploadWidget.tsx`)
  6. Added `minHeight` to `useLazySection` wrapper to prevent CLS when content replaces placeholder
- **Results**: Performance 99, Accessibility 100, Best Practices 93, SEO 100. FCP 0.8s, LCP 0.9s, TBT 0ms, CLS 0.005, SI 0.8s
- **Files Changed**: `index.html`, `src/App.tsx`, `src/components/animations/AnimatedComponents.tsx`, `src/lib/pwa/index.ts`, `src/components/landing/ComparisonMock.tsx`, `src/components/landing/UploadWidget.tsx`, `src/hooks/useLazySection.tsx`
- **Commit**: `1541896`

### 108. Server-Side Config Performance Monitoring Wired (Feb 19, 2026)
- **Problem**: Server-side config performance endpoint returned zero data — `recordServerConfigFetch` was defined and exported but never called from `config-service.ts`
- **Solution**: Wired `recordServerConfigFetch()` into `getCategorySettings()` in `server/services/config-service.ts`
- **Also Added**:
  - Production performance baseline script (`scripts/config-perf-baseline.ts`) — measures Railway endpoint latencies
  - 12-scenario TTL validation test suite (`src/lib/config/__tests__/ttl-validation.test.ts`) covering typical production, high cache + fast DB, slow DB, low hit rate, insufficient data, alert thresholds, per-category stats, production-realistic Supabase profile, TTL floor/ceiling
- **Production Baseline Measurements**: Health ~800ms, AI providers ~400ms, AI diagnose ~3000ms, DB config fetch 20-100ms
- **Commit**: `9cea16e`

### 109. Flaky Test Hardening (Feb 19, 2026)
- **Problem**: Two test files had intermittent failures under coverage instrumentation
- **Fixes**:
  - `vite.config.ts`: Added `testTimeout: 10000` (2× default) for coverage mode resilience
  - `cost-tracking/tracker.test.ts`: Added floating-point tolerance to `projectedMonthEnd` assertion; use Set-based unique ID test
  - `translation-service.test.ts`: Capture `Date.now()` before cache operations to avoid race; replace `restoreAllMocks` with `clearAllMocks` to prevent mock chain teardown
- **Commit**: `7288efd`

### 110. Production Lighthouse Verification — Compression & Accessibility (Feb 19, 2026)
- **Feature**: Verified Lighthouse scores against actual production build and fixed two issues
- **CLS Confirmed**: 0 on mobile (perfect), 0.005 on desktop (perfect score 100) — matches/exceeds CLAUDE.md #107
- **Fix 1 — Accessibility 94→100**: Mobile hamburger menu button in `Hero.tsx` missing `aria-label`
  - Added `aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}` and `aria-expanded`
- **Fix 2 — Gzip Compression Middleware**: Express server had no compression — relied entirely on Railway's envoy proxy
  - Added `compression` npm package to `server/index.ts` (placed before Helmet)
  - HTML: 8174 → 2682 bytes (67% reduction)
  - Main JS: 1MB → 318KB (69% reduction)
  - CSS: 199KB → 27KB (87% reduction)
  - Performance score improved from 50→71 in sandbox (production has additional edge/CDN benefits)
- **Production Deployment Verified**: All CLS fixes confirmed deployed (app shell, immutable assets, opacity-only animations, eager LandingPage, SW controllerchange guard, HSTS)
- **Files Changed**: `src/components/landing/Hero.tsx`, `server/index.ts`, `package.json`

### 111. Branch Coverage Improvement — 81% → 84% Branches (Feb 19, 2026)
- **Problem**: Branch coverage was 81.17% (14,425/17,771); target was 83%+
- **Approach**: Analyzed `coverage-final.json` with Python to identify highest-impact files by uncovered branch count; launched parallel Task agents to generate test files
- **New Test Files Created** (464 tests, 6,410 lines):
  - `src/components/PolicyDetailView-branches.test.tsx` — 172 tests: helper functions (`formatCoverageLimit`, `getCategoryIcon` for 7 categories, `getCoverageInfoText`, `getLocalizedCoverageName`, `translateInsightLegacy`), sub-components (CollapsibleCoverageCategory, CoveragesByCategory, ExclusionsSection, RawExtractedTextSection), main component (trial banner, confidence warning, vehicle info, share/download, expand/collapse states)
  - `src/components/PolicyDashboard-branches.test.tsx` — 102 tests: all 6 sort fields (provider, type, coverage, premium, expiryDate, status) with asc/desc, search filtering, status filter, stats calculation, duplicate banner, view mode toggle, compare selection bar, empty states
  - `src/components/medium-coverage-branches.test.tsx` — 123 tests: EmailPreferences (17), GlobalNavigation (16), ScoreBreakdown (31), PolicyDiffViewer (10), Settings (16), ConflictResolutionDialog+DuplicateWarningBanner (21), useEmailPreferences (12)
  - `src/lib/library-branches.test.tsx` — 67 tests: PolicyContext (9), Consensus extraction (16), Performance monitoring (7), Config Manager (14), Cache Storage (21)
- **Other Fix**: `src/__tests__/performance/performance.test.ts` — updated stale assertion (`#root:empty::before` → `.app-shell`, `@keyframes spin` → `@keyframes pulse`) after index.html app shell skeleton change
- **Results**: Branch coverage 81.17% → 83.69% (+447 branches). Total: 14,960 tests, 304 files, 0 failures
- **Latent Bug Discovered**: `sortPolicies()` in `PolicyDashboard.tsx` uses `|| 4` for status order fallback — `active` status has order `0`, which is falsy, so it incorrectly falls back to `4`. Should use `?? 4`. **Fixed in commit `3d9fc61` (Feb 20, 2026).**
- **Commit**: `da8f16c`

### 112. E2E Test Hardening for Production Build Testing (Feb 19, 2026)
- **Feature**: Hardened all 186 Playwright E2E tests for reliable production build testing
- **Tests**: 186/186 Chromium pass against production build (`npx serve dist`)
- **Commit**: `497aeec`

### 113. sortPolicies() Status Ordering Bugfix (Fixed Feb 20, 2026)
- **Problem**: `statusOrder[a.status] || 4` treated `active` (order `0`, falsy) as `4` (lowest priority), making active policies sort last instead of first
- **Fix**: Changed `|| 4` to `?? 4` (nullish coalescing) in `src/components/PolicyDashboard.tsx:118`
- **Test Update**: 2 assertions in `PolicyDashboard-branches.test.tsx` updated to match correct sort order (active first ascending, active last descending)
- **File Changed**: `src/components/PolicyDashboard.tsx`
- **Commit**: `3d9fc61`

### 114. Migration 020 — Unsubscribe Translations Seeded (Feb 20, 2026)
- **Feature**: Seeded 22 unsubscribe translation keys × 2 locales (EN/TR) into production Supabase
- **Previously**: UnsubscribePage used hardcoded fallback strings from `translations.ts`; admin Translations tab could not manage these keys
- **Applied**: Manually via Supabase SQL Editor (migration is idempotent — `ON CONFLICT DO NOTHING`)
- **Version bump**: `translation_metadata` version bumped to `"3"` so clients refetch
- **Migration file**: `supabase/migrations/020_seed_unsubscribe_translations.sql`

### 115. CI Pipeline — Playwright E2E Tests (Added Feb 20, 2026)
- **Feature**: GitHub Actions CI now runs Playwright E2E tests (Chromium) against the production build in both staging and production workflows
- **Changes**:
  - `staging.yml`: Added new `e2e-tests` job running in parallel with `validate`; `build` now gates on both passing
  - `production.yml`: Fixed existing `e2e-tests` job — was running `npm run test:e2e:fast` (dev server); now builds and serves via `serve` + `wait-on`
  - Both jobs use `E2E_BASE_URL=http://localhost:3000` so `playwright.config.ts` skips its built-in webServer
  - Playwright report uploaded as artifact on failure for debugging
  - `serve` and `wait-on` added as devDependencies for deterministic CI (no `npx` cold install)
- **Files Changed**: `.github/workflows/staging.yml`, `.github/workflows/production.yml`, `package.json`
- **Commit**: `68acec6`

### 116. Branch Coverage Gap — Resolved (Feb 20, 2026)
- **Status**: ✅ RESOLVED — all 3 high-impact files now covered
- **Files covered** (8 focused test files, 15,316 tests, 85.91% branches):
  - `server/routes/settings.ts` — `settings-routes-export-import.test.ts`, `settings-routes-batch-update.test.ts`, `settings-routes-crud-operations.test.ts`
  - `src/lib/ai/policy-extractor.ts` — `policy-extractor-conversion.test.ts`, `policy-extractor-validation.test.ts`, `policy-extractor-ocr.test.ts`
  - `server/routes/ai.ts` — `ai-extraction-routes-branches.test.ts`, `ai-chat-ocr-diagnose-logs.test.ts`
- **Branch coverage**: 83.69% → **85.91%** (target 85%+ ✓)
- **Commit**: `aaf441b`

### 117. No-Non-Null-Assertion Warnings Eliminated (Fixed Feb 20, 2026)
- **Problem**: Codebase had 47 `@typescript-eslint/no-non-null-assertion` warnings across 10+ files in `services/`, `packages/`, `server/`, and `src/`
- **Root Cause**: Two patterns account for almost all warnings:
  1. **`let x: T` assigned inside async callback** — TypeScript cannot narrow a `let` variable assigned inside `await runStage(..., async () => { x = ... })` because the assignment happens in a callback, not on the main flow. Fix: `let x!: T` (TypeScript's definite-assignment assertion — not flagged by ESLint's `no-non-null-assertion` rule).
  2. **Optional property narrowed by `if` then referenced inside a closure** — TypeScript narrows `if (filters.startDate)` in the outer block but does NOT propagate that narrowing inside `.filter()` / `.map()` callbacks. Fix: `const startDate = filters.startDate` inside the `if` block captures the narrowed `string` type in a `const`, which the closure then closes over safely.
- **Files fixed across 3 commits** (`dd5b86b`, `742eca0`, `d0153e1`):
  - `services/workflow/src/workflows/ocr-pipeline.ts` — 18 warnings (7 `let x!: T` declarations + 16 expression `!` removed)
  - `src/lib/admin/operations-logger.ts` — 10 warnings (5 × `startDate`/`endDate` closure pattern)
  - `services/validate-svc/src/index.ts` — 3 warnings (early-return guard + `?? 0` nullish coalescing)
  - `services/render-svc/src/index.ts` — 1 warning (merged `has()` + `get()` into single `get()` + undefined check)
  - `services/ocr-orch/src/index.ts` — 1 warning (`if (!adapter) continue` guard)
  - `server/middleware/admin-auth.ts` — 1 warning (extract `const adminUser` before `.every()` callback)
  - `packages/rule-packs/src/index.ts` — 2 warnings (`!locale!` → `!locale`; throw on missing fallback)
  - `src/lib/policy-evaluation/comparator.ts` — 2 warnings (`?.` + `?? 0` after `.filter()` chain)
  - `services/layout-svc/src/index.ts` — 1 warning (extract to `const regionChildren`; removed `eslint-disable-next-line` comment)
- **Result**: ESLint now at **0 errors, 0 `no-non-null-assertion` warnings** in targeted files. Note: `package.json` lint script allows `--max-warnings 47` — some non-critical warnings may remain in files outside the cleanup scope (e.g., `services/`, `packages/`)

### 118. Residual ESLint Warnings Cleared — 9 Warnings in Branch (Fixed Feb 20, 2026)
- **Problem**: 9 ESLint warnings persisted in `claude/review-handoff-docs-JGCWm` branch that were not covered by Known Issue #117 (those fixes targeted different files)
- **Root Cause**: The warnings existed in files never touched by the prior no-non-null-assertion cleanup session; `react-hooks/exhaustive-deps` warnings were also new from i18n and settings work
- **Files Fixed** (9 warnings → 0):
  - `src/components/MyAccount.tsx:131` — `react-hooks/exhaustive-deps`: added `t` to useEffect deps (locale-aware error message)
  - `src/components/admin/tabs/AIOperationsTab.tsx:331,377` — `no-non-null-assertion`: `request.systemPrompt!` and `request.response!` inside JSX conditionals → `?? ''`
  - `src/components/admin/tabs/settings/AISettingsPanel.tsx:122` — `react-hooks/exhaustive-deps`: wrapped `getSettingByKey` with `useCallback([settings])`, added to effect deps
  - `src/lib/admin/config-manager.ts:285` — `no-non-null-assertion`: `configs.get(id)!.value` → extract to `const entry`, use `entry?.value`
  - `src/lib/admin/context.tsx:101` — `no-non-null-assertion`: `result.data!` inside guarded `if` → extract to `const userData`
  - `src/lib/ai/policy-extractor.ts:786` — `no-non-null-assertion`: `ocrFormFields!` inside inner closure → capture narrowed value as `const narrowedFormFields`
  - `src/lib/pipeline/ocr-sanitizer.ts:45` — `no-non-null-assertion`: `codePointAt(0)!` → `?? 0`
  - `src/lib/pipeline/ocr-stats.ts:648` — `no-non-null-assertion`: `groups.get(key)!.push()` → extract to `const group`, guard with `if (group)`
- **Result**: ESLint **0 errors** in fixed files. Build lint passes with `--max-warnings 47` threshold (see `package.json` line 20)

### 119. PWA Push Notification Architecture (Added Feb 20, 2026)
- **Feature**: Full browser push notification system using Web Push API (VAPID)
- **Server Infrastructure**:
  - `server/services/notification-service.ts` — VAPID configuration, `sendPushNotification()` (fire-and-forget, auto-removes 410/404 stale subscriptions), `sendExtractionCompleteNotification()`, `sendPolicyExpiryNotification()`
  - `server/routes/notifications.ts` — 4 endpoints (public-key, status, subscribe, unsubscribe) with `authLimiter` rate limiting
  - `server/index.ts` — registers `/api/notifications` router
  - `supabase/migrations/021_push_subscriptions.sql` — `push_subscriptions` table with RLS + index
- **Server Notification Triggers**: `server/routes/ai.ts` fires `sendExtractionCompleteNotification()` after all 4 extraction success paths (OpenAI standalone, Anthropic standalone, unified/OpenAI, unified/Anthropic) — non-blocking fire-and-forget with `log.warn` on failure
- **Client Infrastructure**:
  - `src/hooks/usePushNotifications.ts` — hook: `isSupported`, `permission`, `isSubscribed`, `isLoading`, `subscribe()`, `unsubscribe()`
  - `src/components/notifications/PushNotificationPrompt.tsx` — soft banner (not modal); shown after first successful upload in PolicyUpload; 7-day localStorage cooldown (`insurai_push_dismissed_until`); permission denied state; uses `t.notifications.*` i18n
- **Background Sync + SYNC_COMPLETE**: `onSyncComplete()` subscriber callback in `src/lib/pwa/index.ts`; `App.tsx` shows toast when synced > 0; `PolicyUpload.tsx` checks `navigator.onLine` at upload start and falls back to `registerBackgroundSync('sync-policies')` when offline
- **VAPID Key Generation** (one-time, run on first deploy):
  ```bash
  node -e "const wp=require('web-push'); console.log(JSON.stringify(wp.generateVAPIDKeys(),null,2))"
  ```
- **New Env Vars** (add to Railway + `.env.example`):
  ```bash
  VAPID_PUBLIC_KEY=...   # base64url ECDH public key
  VAPID_PRIVATE_KEY=...  # base64url ECDH private key
  VAPID_SUBJECT=mailto:contact@insurai.com
  ```
- **Graceful Degradation**: If VAPID keys are not set, `configureWebPush()` logs a warning and `sendPushNotification()` returns 0 — no crash, no broken uploads
- **Test Files** (5 new files):
  - `server/__tests__/notification-routes.test.ts` — all 4 endpoints, auth, validation
  - `server/__tests__/notification-service.test.ts` — VAPID config, send, 410/404 stale cleanup
  - `src/hooks/usePushNotifications.test.ts` — hook states, subscribe/unsubscribe flows
  - `src/components/notifications/PushNotificationPrompt.test.tsx` — UI states, localStorage cooldown, permission denied
  - `src/lib/pwa/push-notifications.test.ts` — onSyncComplete callbacks, SW message dispatch
- **SW Cache**: Bumped to v20 (offline queue wiring changes SW behavior)

### 120. Mobile Bundle Optimization — framer-motion Removed from Main Chunk (Feb 21, 2026)
- **Problem**: Lighthouse mobile score 71/100 from sandbox throttling, but real cause was 1,030 KB main chunk (320 KB gzip) blocking FCP/LCP on slower connections.
- **Root Causes** (two eager imports pulling framer-motion into main bundle):
  1. `App.tsx`: `import { AnimatePresence } from 'framer-motion'` — direct eager import
  2. `AnimatedComponents.tsx`: `import { motion, AnimatePresence } from 'framer-motion'` — imported by LandingPage→Hero chain
- **Solution**: Replaced framer-motion with pure CSS animations — identical visual result since all animations were already opacity-only (changed in Known Issue #107 CLS fix):
  - `AnimatedComponents.tsx` — rewrote all 7 components using CSS `animation: fadeIn` and Tailwind transition classes:
    - `PageTransition`: `style={{ animation: 'fadeIn 0.3s ease both' }}`
    - `StaggeredList`: CSS `animation-delay: ${index * delay}s` per child
    - `AnimatedButton`: Tailwind `hover:scale-[1.02] active:scale-[0.98] transition-transform`
    - `ScaleOnHover`: Tailwind `hover:scale-105 transition-transform`
    - `FadeInWhenVisible`: `IntersectionObserver` hook + CSS animation (no `motion.div`)
    - `NumberCounter`: unchanged (already had no framer-motion)
    - `AnimatePresence`: no-op wrapper `<>{children}</>`
  - `App.tsx` — removed `import { AnimatePresence } from 'framer-motion'` and `AnimatePresence` wrapper; removed `key={location.pathname}` from `<Routes>` (was needed only for exit animation timing)
  - `src/index.css` — added `@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }`
- **Result**: Main chunk **1,030 KB → 915 KB (−115 KB raw, −38 KB gzip)**. framer-motion moved to `AuthPage` lazy chunk (only loads on /auth navigation).
- **Also Fixed**: 2 pre-existing lint errors in push notification test files (`loadingDuring` → `_loadingDuring`; empty `const {} =` → bare `await import()`); 18 unused `eslint-disable` warnings auto-fixed.
- **Zero CLS impact**: All framer-motion animations were already opacity-only (no `y`/`x` transforms). CSS `@keyframes fadeIn` is identical in appearance.
- **Remaining**: Main chunk reduced to ~268 KB gzip after TR lazy-load (#123) and ~259 KB gzip after EN lazy-load (#124). Both EN and TR translations are now async chunks — the lazy-i18n story is complete. Supabase client (~50 KB gzip) is the next largest independent candidate if further splitting is desired.
- **Files Changed**: `src/components/animations/AnimatedComponents.tsx`, `src/App.tsx`, `src/index.css`

### 121. Policy Expiry Push Notification Scheduler (Added Feb 21, 2026; Migrated to Edge Function Feb 24, 2026)
- **Feature**: Daily push notifications to users whose policies expire in exactly 7, 14, or 30 days
- **Architecture (current)**: Supabase Edge Function (`supabase/functions/notify-expiring/index.ts`) scheduled via `pg_cron` + `pg_net`. Fully serverless — no dependency on Railway or GitHub Actions.
- **Architecture (previous, removed)**: GitHub Actions cron → Railway `POST /api/internal/cron/notify-expiring`. Both `server/routes/internal.ts` and `.github/workflows/notify-expiring.yml` have been deleted.
- **Also fixed**: `extractViaProxy()` was not forwarding `x-user-id` header, so `sendExtractionCompleteNotification()` was silently skipped on client-side extraction paths
- **Files**:
  - `supabase/functions/notify-expiring/index.ts` — Deno Edge Function using `npm:web-push` and `@supabase/supabase-js`
  - `supabase/functions/notify-expiring/deno.json` — Deno config
  - `supabase/migrations/20260223191019_setup_pg_cron.sql` — enables `pg_cron` + `pg_net`, schedules daily invocation at 08:00 UTC
- **Idempotent**: each policy matches exactly one window per day (expires in exactly N days) — safe to run multiple times
- **Graceful degradation**: skips with `console.warn` if VAPID keys not set; never crashes
- **Required Supabase Edge Secrets** (set via `npx supabase secrets set`):
  - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
- **Manual test**: invoke the Edge Function directly via `supabase functions invoke notify-expiring`
- **Verification**: `SELECT * FROM cron.job;` to confirm the schedule is registered

### 122. Migration 021 — Push Subscriptions Table Applied to Production (Feb 22, 2026)
- **Feature**: `push_subscriptions` table (RLS + index) applied to production Supabase via SQL Editor
- **Migration file**: `supabase/migrations/021_push_subscriptions.sql`
- **Verification**: Confirmed by end-to-end push notification test — `sent: 1` from Edge Function proves table exists and VAPID keys are set
- **Pattern**: Same as Known Issue #114 (migration 020 for unsubscribe translations) — apply manually via Supabase Dashboard → SQL Editor

### 123. TR Translations Lazy-Loaded as Async Vite Chunk (Added Feb 22, 2026)
- **Feature**: Turkish translations split out of the main bundle into a separate async Vite chunk, saving ~14 KB gzip from initial load
- **Problem**: `translations.ts` (2,981 lines, both EN + TR) was always bundled in the main chunk — every user paid the full cost of TR strings even if their locale was EN
- **Solution**: Split `translations.ts` into three files:
  - `src/lib/i18n/translations.ts` — `TranslationDictionary` interface + `COMMON_LOCALES` + back-compat re-exports only
  - `src/lib/i18n/translations-en.ts` — `EN_TRANSLATIONS` (eager, used as initial React state)
  - `src/lib/i18n/translations-tr.ts` — `TR_TRANSLATIONS` (lazy async chunk via dynamic import)
- **How it works**:
  - `translation-service.ts`: `getPreloadedTranslations()` uses `await import('./translations-tr')` so Rollup/Vite splits it into a separate async chunk
  - `i18n-context.tsx`: imports `EN_TRANSLATIONS` directly from `translations-en.ts` for synchronous initial render
  - `src/lib/ai/policy-extractor.ts`: imports `TR_TRANSLATIONS` directly from `translations-tr.ts` (server-side extraction path, lazy ok)
- **Result**: `translations-tr-*.js` async chunk = 39.26 KB raw / 13.77 KB gzip. Main bundle ~268 KB gzip (was ~282 KB)
- **Test fixes required** (5 files):
  - 4 `policy-extractor` test files: add `vi.mock('@/lib/i18n/translations-tr')` (policy-extractor.ts no longer imports TR from `translations.ts`)
  - `openai.test.ts`: add `undefined` as 4th arg to `extractViaProxy` expectations (`notifyUserId` param added in Feb 21 session broke 2 assertions)
  - `translations.test.ts`: replaced `PRELOADED_TRANSLATIONS` presence tests with named export checks for `EN_TRANSLATIONS` and `TR_TRANSLATIONS`
- **Gotcha — importing TR translations directly**: If a file must import `TR_TRANSLATIONS` at module load time (not lazily), import from `./translations-tr` directly. Do NOT import from `./translations.ts` expecting TR — it no longer re-exports TR_TRANSLATIONS eagerly.
- **Files Changed**: `translations.ts`, `translations-en.ts` (new), `translations-tr.ts` (new), `translation-service.ts`, `i18n-context.tsx`, `policy-extractor.ts`, `index.ts`, 5 test files
- **Commits**: `45b742a`

### 124. EN Translations Lazy-Loaded as Async Vite Chunk — Completes Lazy-i18n (Added Feb 22, 2026)
- **Feature**: English translations split out of the main bundle into a separate async Vite chunk, completing the lazy-i18n story where both EN and TR are now loaded on demand
- **Problem**: After Known Issue #123 (TR split), `EN_TRANSLATIONS` was still statically imported in `i18n-context.tsx` as the initial React state, keeping ~12 KB gzip in the main bundle
- **Solution**:
  - Added `src/lib/i18n/translations-skeleton.ts` — all-empty-string `TranslationDictionary` (923 lines) used as the synchronous initial state in `i18n-context.tsx` before any locale loads
  - `i18n-context.tsx` — replaced `EN_TRANSLATIONS` initial state with `SKELETON_TRANSLATIONS`
  - `translations.ts` / `index.ts` — removed remaining static EN re-exports (the barrel re-export was the only thing pulling `translations-en.ts` into the main chunk via the i18n index)
  - `translation-service.ts` — final fallback (unknown locale, no cache, API down) now dynamically imports `EN_TRANSLATIONS` instead of returning `SKELETON_TRANSLATIONS`, preserving user-facing behaviour while keeping EN out of the main bundle
- **Result**: Main bundle saves ~8.7 KB gzip (both EN and TR translations are now async chunks). Load sequence:
  1. App starts → context initialises with `SKELETON_TRANSLATIONS` (all empty strings, synchronous)
  2. `translation-service.ts` runs `getPreloadedTranslations()` for the user's locale
  3. For `'tr'`: `await import('./translations-tr')` → TR async chunk fetched
  4. For `'en'`: `await import('./translations-en')` → EN async chunk fetched
  5. Context updates → components re-render with real strings
- **Architecture after this change**:
  ```
  main chunk (~259 KB gzip)  [was 268 KB after #123]
    └── translations-skeleton.ts (empty strings — no cost)
  async chunk: translations-en-*.js (~12 KB gzip)
    └── translations-en.ts (EN — lazy via dynamic import)
  async chunk: translations-tr-*.js (13.77 KB gzip)
    └── translations-tr.ts (TR — lazy via dynamic import)
  ```
- **Test fixes required** (37 files):
  - 9 landing/component test files that use `useTranslation()` — needed `vi.mock('@/lib/i18n/i18n-context')` because context default is now `SKELETON` (empty strings) not `EN_TRANSLATIONS`
  - 19 component test files — `EN_TRANSLATIONS` import path updated from `translations` to `translations-en`
  - 2 i18n-context test files — error-fallback assertion updated from `'Home'`/`'Loading...'` to `''` (skeleton empty strings)
  - `translations.test.ts` — replaced `PRELOADED_TRANSLATIONS` checks with named export presence checks
- **Key distinction — two different fallback levels**:
  - `i18n-context.tsx` error catch path: `setTranslations(SKELETON_TRANSLATIONS)` — when the entire `getTranslations()` call rejects, context holds empty strings (acceptable degradation; SKELETON is synchronously available)
  - `translation-service.ts` final fallback: dynamically imports `EN_TRANSLATIONS` — when locale is unknown/unsupported, users get real English content, not empty strings
- **Gotcha — components now render with empty strings briefly on first load**: Unlike before where EN was always available immediately, components may show empty strings for 1 render cycle until the async EN/TR chunk loads. This is invisible in practice (< 50ms on fast connections) but test assertions that fire synchronously may see `''` instead of expected English strings — add `await waitFor(...)` to fix.
- **New file**: `src/lib/i18n/translations-skeleton.ts` — do NOT add translation content here; it must stay all-empty-string so it has no bundle cost
- **Files Changed**: `translations-skeleton.ts` (new), `translations.ts`, `index.ts`, `translation-service.ts`, `i18n-context.tsx`, 32 test files
- **Commits**: `469b100` (feature), `efbb38f` (docs)

### 125. Export Dropdown with PDF, CSV, Text, and Excel Export (Updated Feb 25, 2026)
- **Feature**: Policy detail view and dashboard now have an export dropdown with PDF, CSV, text, and Excel (xlsx) export
- **Functions Added** (`src/lib/export.ts`):
  - `exportSinglePolicyToCSV()` — Bilingual section headers (EN/TR by locale), includes coverages, exclusions, AI insights
  - `exportToPDF()` — Print-optimized HTML popup for single policy
  - `exportPoliciesToPDF()` — Multi-policy PDF report with title
  - `exportToExcel()` — Real xlsx via lazy `import('xlsx')` (SheetJS), creates multi-column worksheet with fallback to CSV
  - `exportSinglePolicyToExcel()` — Multi-sheet xlsx workbook (Policy Info, Coverages, Exclusions, AI Insights) with locale-aware headers
  - `exportComparisonToCSV()` — Multi-policy comparison CSV with bilingual headers
  - `exportComparisonToPDF()` — Comparison table as print-optimized HTML popup
- **xlsx Dependency**: `xlsx` (SheetJS) installed as production dependency; lazy-loaded via `await import('xlsx')` to avoid bundle impact
- **Files**: `src/lib/export.ts`, `src/components/PolicyDetailView.tsx`, `src/components/PolicyDashboard.tsx`, `src/components/ComparePolicies.tsx`
- **Commits**: `99311a6`, `ac7e05c`

### 126. Automated User Onboarding Flow (Added Feb 25, 2026)
- **Feature**: First-time dashboard visitors see a guided onboarding flow with 3-step visual guide and drag-drop upload
- **Component**: `src/components/WelcomeOnboarding.tsx`
  - Props: `onUpload: (file: File) => void`, `onSkip: () => void`, `userName?: string | null`
  - 3-step guide: Upload PDF → AI Analyzes → Get Insights & Score
  - Drag-drop with `FILE_CONSTRAINTS` validation (PDF only, max 10 MB)
  - i18n: `t.onboarding.*` section (18 keys, EN + TR)
  - Shown once per user via `localStorage('insurai_onboarding_completed')`
- **Integration**: `PolicyDashboard.tsx` checks `localStorage` and shows `WelcomeOnboarding` for first-time users
- **Tests**: `src/components/WelcomeOnboarding.test.tsx` (248 lines)
- **Commits**: `9229226`, `2e2c66b`

### 127. Extraction Error Observability for Admin Tracking (Added Feb 25, 2026)
- **Feature**: In-memory extraction metrics ring buffer with Sentry capture and enhanced processing log error fields
- **Ring Buffer** (`server/routes/ai.ts`):
  - `ExtractionEvent` interface: requestId, timestamp, provider, success, durationMs, errorCode, errorMessage, documentLength
  - `recordExtractionEvent()` — Called on all extraction success/failure paths
  - `extractionMetrics[]` — In-memory circular buffer (200 events, FIFO)
  - `getExtractionHealthSnapshot()` — Returns 24h window with per-provider breakdown, error rate, recent errors (last 10)
- **Admin Endpoint**: `GET /api/admin/monitoring/extraction-health` (`server/routes/admin/monitoring.ts`)
- **Enhanced Processing Log Types** (`src/types/processing-log.ts`):
  - `error_stack?: string` — Stack trace for debugging
  - `error_type?: string` — Error class name
  - `error_code?: string` — Structured error code
  - `error_context?: { extraction_provider, document_length, ocr_used, last_successful_stage, data_at_failure, browser_info }` — Rich failure context
  - `request_id?: string` — Links frontend extraction to server-side logs
  - `extraction_route?: string` — Server endpoint used
  - `extraction_mode?: 'proxy' | 'direct' | 'consensus'` — How extraction was invoked
  - `fallback_used?: boolean` — True if primary provider failed
  - `fallback_chain?: Array<{ provider, success, duration_ms, error, error_code }>` — Full provider attempt chain
- **Sentry Integration**: `captureServerError()` called on all extraction failures with context (requestId, provider, document length)
- **Files**: `server/routes/ai.ts`, `server/routes/admin/monitoring.ts`, `src/types/processing-log.ts`, `src/lib/processing-logger.ts`
- **Commit**: `0026f45`

### 128. Admin Dashboard Mobile-Responsive (Fixed Feb 25, 2026)
- **Problem**: Admin dashboard was not scrollable or clickable on mobile — sidebar tabs were cut off, tables overflowed
- **Solution (AdminDashboard.tsx)**:
  - Mobile: Hamburger menu toggle, slide-out drawer sidebar with fixed overlay and backdrop
  - Tab clicks close the drawer on mobile
  - Responsive header with hamburger icon visible below `md` breakpoint
- **Solution (ProcessingLogsTab.tsx)**:
  - Mobile: Card layout (`md:hidden`) with tappable cards showing key fields
  - Desktop: Original table layout (`hidden md:block`) with `overflow-x-auto`
  - Clickable rows navigate to Document Journey on both views
- **Files**: `src/components/admin/AdminDashboard.tsx`, `src/components/admin/tabs/ProcessingLogsTab.tsx`
- **Commit**: `b2847ab`

### 129. Notification Bulk Select and Delete (Added Feb 25, 2026)
- **Feature**: Admin notifications tab now supports checkbox selection, select-all, and bulk/all delete
- **Backend** (`server/services/admin-notification-service.ts`):
  - `deleteNotifications(ids: string[]): Promise<number>` — Bulk delete by IDs
  - `deleteAllNotifications(options?: { category?, acknowledged? }): Promise<number>` — Filtered mass delete
- **Endpoint**: `DELETE /api/admin/notifications` accepting `{ ids: string[] }` or `{ all: true, category?, acknowledged? }`
- **Frontend** (`src/components/admin/tabs/NotificationsTab.tsx`):
  - Checkbox per notification, selected items highlighted with blue ring
  - Select All / Deselect All with CheckSquare/MinusSquare/Square icons
  - "Delete Selected" button with confirmation count, "Delete All" in header
  - Audit logging via `logAdminAction()` on all deletes
- **Files**: `server/services/admin-notification-service.ts`, `server/routes/admin/content.ts`, `src/components/admin/tabs/NotificationsTab.tsx`
- **Commit**: `8b15bab`

### 130. Processing Logger for Anonymous Uploads (Fixed Feb 25, 2026)
- **Problem**: Uploads via TryAnalysis (`/try` route) created zero processing log entries — completely invisible in admin dashboard
- **Root Cause**: `TryAnalysis.tsx` called `extractPolicyFromDocument()` without passing a `logger` parameter
- **Solution**: Added `ProcessingLogger` creation in `runExtraction()` with the same create-then-update persist callback pattern used by `PolicyUpload.tsx`
- **Pattern** (shared between PolicyUpload and TryAnalysis):
  ```typescript
  const logger = createProcessingLogger({ filename, file_size, mime_type, user_id })
  let logCreatePromise: Promise<boolean> | null = null
  logger.setPersistCallback(async (log) => {
    if (!logCreatePromise) {
      logCreatePromise = (async () => { await createProcessingLog(log); return true })()
      await logCreatePromise
    } else {
      await logCreatePromise
      await updateProcessingLog(log.document_id, log)
    }
  })
  // Pass logger to extraction: extractPolicyFromDocument(file, { logger, userId: user?.id })
  ```
- **Also Fixed**: `processing-log-api.ts` now logs HTTP status codes on failure for better debugging
- **Files**: `src/components/TryAnalysis.tsx`, `src/lib/processing-log-api.ts`
- **Commit**: `dd6f234`

### 131. Admin Extraction Health Dashboard UI (Added Feb 25, 2026)
- **Feature**: New admin tab showing real-time extraction health metrics with per-provider breakdown
- **Component**: `src/components/admin/tabs/ExtractionHealthTab.tsx` (410 lines)
  - Header with auto-refresh timer (every 30s) and manual refresh button
  - Summary cards: Total Extractions, Success Rate, Avg Duration, Error Rate (24h window)
  - Per-provider breakdown table: provider name, total/success/fail counts, success rate, avg duration
  - Recent errors list (last 10): timestamp, provider, error code, error message, request ID
  - Graceful error and loading states
- **Registration**: Added `extraction_health` to admin tab union type, TABS array, and switch case in `AdminDashboard.tsx`
- **Data Source**: `GET /api/admin/monitoring/extraction-health` endpoint (created in Known Issue #127)
- **Files**: `src/components/admin/tabs/ExtractionHealthTab.tsx` (new), `src/components/admin/AdminDashboard.tsx`, `src/types/admin.ts`
- **Commit**: `ac7e05c`

### 132. ComparePolicies Enhancements — Stats, Chart, Diff, Export (Added Feb 25, 2026)
- **Feature**: Major enhancement to the multi-policy comparison page with 5 improvements
- **Quick Stats Card** (`QuickStatsCard` component): 4-stat gradient grid showing policies count, average score, average premium, total coverage — with TrendingUp/BarChart3 icons
- **Score Comparison Chart** (`ScoreComparisonChart` component): CSS horizontal bar chart for 5 evaluation categories (premium, coverage, deductible, compliance, value) plus overall score — color-coded bars per policy with legend and "Best" indicator
- **Enhanced Coverage Matrix** (`EnhancedCoverageMatrix` component): Coverage table with diff highlighting — amber row background for mixed inclusion, emerald cell for best limit, red for not-included; sticky left column for mobile horizontal scrolling
- **Export Dropdown**: Header-level dropdown with PDF and CSV export options using `exportComparisonToPDF()` and `exportComparisonToCSV()` with toast feedback
- **Mobile Layout**: Reduced gap and padding on selected policies preview for smaller screens
- **i18n**: 21 new `comparison.*` translation keys across all 4 translation files
- **Files**: `src/components/ComparePolicies.tsx` (+317 lines), `src/lib/i18n/translations-*.ts`
- **Commit**: `ac7e05c`

### 133. Extraction Metrics DB Persistence with Dual-Write (Added Feb 25, 2026)
- **Feature**: Extraction events are now persisted to Supabase alongside the in-memory ring buffer
- **Architecture**: Dual-write pattern — events recorded in-memory (ring buffer for real-time dashboard) AND persisted to DB (fire-and-forget for historical analysis and server restart survival)
- **Migration**: `supabase/migrations/023_extraction_metrics.sql`
  - Table `extraction_metrics` with columns: id, request_id, created_at, provider, success, duration_ms, error_code, error_message, document_length
  - Indexes on created_at (for 24h window queries), provider, success, and compound provider+created_at
  - No RLS — admin-only access via service role key (same pattern as admin_notifications)
  - Auto-cleanup via pg_cron: `DELETE FROM extraction_metrics WHERE created_at < NOW() - INTERVAL '30 days'` (daily at 03:00 UTC)
- **Service**: `server/services/extraction-metrics-service.ts` (159 lines)
  - Lazy Supabase client initialization (only when SUPABASE_URL and SERVICE_ROLE_KEY are set)
  - `persistExtractionEvent()` — Inserts event to DB; returns silently on failure (fire-and-forget)
  - `getDBExtractionHealth()` — Fetches last 24h events from DB, aggregates per-provider stats and recent errors
  - Structured logging via `logger.child('extraction-metrics')`
- **Wiring**: `server/routes/ai.ts` `recordExtractionEvent()` now calls `persistExtractionEvent()` as fire-and-forget after in-memory recording
- **Behavioral Change**: `getExtractionHealthSnapshot()` is now **async** (was sync) — falls back to DB query when in-memory buffer is empty (e.g., after server restart). Response includes `source: 'memory' | 'database'` field to indicate data origin
- **Admin Route Change**: `server/routes/admin/monitoring.ts` handler changed from sync to `async` with `await getExtractionHealthSnapshot()`
- **Files**: `supabase/migrations/023_extraction_metrics.sql` (new), `server/services/extraction-metrics-service.ts` (new), `server/routes/ai.ts`, `server/routes/admin/monitoring.ts`
- **Commit**: `ac7e05c`

### 134. extraction-metrics-service Logger Import Fix (Fixed Feb 25, 2026)
- **Problem**: `extraction-metrics-service.ts` imported `{ log }` from `../lib/logger.js` but the module only exports `logger` (named) and `logger` (default) — no `log` export exists
- **Root Cause**: Typo in initial service implementation; `log` is not a valid export name
- **Impact**: Caused `Cannot read properties of undefined (reading 'child')` in all 10+ server AI route test files because `ai.ts` imports `extraction-metrics-service.ts` at module scope
- **Fix**: Changed `import { log } from '../lib/logger.js'` to `import { logger } from '../lib/logger.js'` and `log.child({...})` to `logger.child('...')`
- **Note**: The `logger.child()` method expects a string argument (tag name), not an object. All other services in the codebase use the string form: `logger.child('module-name')`
- **File**: `server/services/extraction-metrics-service.ts`
- **Commit**: `ac7e05c`

### 135. Extraction Health Hourly Chart and Auto-Refresh (Added Feb 26, 2026)
- **Feature**: ExtractionHealthTab now includes a stacked bar chart showing hourly extraction volume over the last 24 hours, with auto-refresh
- **Components**:
  - `HourlyChart` component in `ExtractionHealthTab.tsx` — stacked green (success) / red (failed) bars with hover tooltips (time, total, success, failed, avg latency)
  - Server-side `buildHourlyBuckets()` in `server/routes/ai.ts` — creates 24 hourly buckets from in-memory extraction events
  - DB fallback: `getDBExtractionHealth()` in `extraction-metrics-service.ts` also populates `hourly_buckets` for restart recovery
- **Auto-Refresh**: 10-second interval with toggle button; manual refresh button in header
- **Health Status Banner**: Color-coded based on error rate — green (<5%), amber (5-20%), red (>20%)
- **Tests**: `ExtractionHealthTab.test.tsx` — 26 tests covering loading, error, charts, auto-refresh, provider stats, recent error expansion, timestamps
- **Files**: `src/components/admin/tabs/ExtractionHealthTab.tsx`, `server/routes/ai.ts`, `server/services/extraction-metrics-service.ts`
- **Commit**: `c910653`

### 136. Processing Log Auto-Cleanup via pg_cron (Added Feb 26, 2026)
- **Feature**: Automated cleanup of `document_processing_logs` rows older than 90 days via scheduled pg_cron job
- **Components**:
  - `deleteOldLogs(daysOld: number = 90)` in `server/services/processing-log-service.ts` — deletes rows where `started_at < NOW() - INTERVAL N days`
  - `POST /api/admin/processing-logs/cleanup` in `server/routes/admin/content.ts` — manual trigger endpoint (SuperAdmin auth, audit-logged)
  - `supabase/migrations/024_processing_log_cleanup_cron.sql` — pg_cron job scheduled at 04:00 UTC daily (1 hour after extraction_metrics cleanup at 03:00 UTC)
- **Retention**: 90 days for processing logs (vs 30 days for extraction_metrics) — longer retention for audit trail
- **pg_cron Status**: Both cleanup jobs confirmed running in production (jobid 1: extraction-metrics at 03:00 UTC, jobid 2: processing-logs at 04:00 UTC)
- **Files**: `server/services/processing-log-service.ts`, `server/routes/admin/content.ts`, `supabase/migrations/024_processing_log_cleanup_cron.sql`
- **Commit**: `c910653`

### 137. Nested $$ Dollar-Quote Syntax Error in pg_cron Migrations (Fixed Feb 26, 2026)
- **Problem**: Migrations 023 and 024 used nested `$$` dollar-quoting inside `DO $do$ ... PERFORM cron.schedule('name', 'schedule', $$SQL$$) ... $do$` blocks, which PostgreSQL rejects because `$$` inside an outer `$do$...$do$` block terminates the outer block prematurely
- **Root Cause**: PostgreSQL requires distinct dollar-quote tags when nesting — inner `$$` conflicts with outer `$$` or `$do$`
- **Solution**: Changed inner SQL from `$$DELETE FROM...$$` to `'DELETE FROM...'` (single-quoted string) in both migrations
- **Pattern** (correct):
  ```sql
  DO $do$
  BEGIN
    PERFORM cron.schedule(
      'cleanup-name',
      '0 3 * * *',
      'DELETE FROM public.table WHERE created_at < NOW() - INTERVAL ''30 days'''
    );
  END;
  $do$;
  ```
- **Files Changed**: `supabase/migrations/023_extraction_metrics.sql`, `supabase/migrations/024_processing_log_cleanup_cron.sql`
- **Commit**: `63af4c6`

### 138. Extraction Health Alerting & Admin-Configurable Retention (Added Feb 26, 2026)
- **Feature**: Automated extraction health alerts fire admin notifications (+ optional email) when error rate or provider latency exceeds configurable thresholds. Retention periods for processing logs and extraction metrics are now admin-configurable via Settings UI.
- **Alert Service** (`server/services/extraction-alert-service.ts`):
  - `evaluateAndDispatchAlerts(snapshot, config)` — Checks 3 threshold types: overall error rate (warning/critical), per-provider latency
  - In-memory cooldown tracking (`lastAlertFired` Map) prevents alert flooding; resets on server restart (acceptable — first post-restart alert is always useful)
  - `fireAlert()` creates admin notification via `createNotification()` and sends email via `sendAdminAlertEmail()` when `config.enableEmailAlerts` is true (wired Feb 27, 2026)
  - Per-provider latency check uses `config.minProviderRequestsForLatencyAlert` (default 3, configurable via admin UI — wired Feb 27, 2026)
  - `getAlertState()` returns cooldown state for admin endpoint
  - `resetAlertState()` test utility
- **Alert Wiring** (`server/routes/ai.ts`):
  - Throttled check in `recordExtractionEvent()` — uses `cachedCheckIntervalMs` (self-updating from DB config, default 300s; wired Feb 27, 2026)
  - Non-blocking fire-and-forget: `Promise.all([getExtractionHealthSnapshot(), getMonitoringConfig()]).then(...).catch(...)`
- **Server Config Service** (`server/services/config-service.ts`):
  - `getMonitoringConfig()` — Returns `MonitoringConfig` with 5-min cache, DB → defaults fallback
  - `getRetentionConfig()` — Returns `RetentionConfig` with 5-min cache
  - Key maps: `MONITORING_KEY_MAP` (7 keys), `RETENTION_KEY_MAP` (2 keys)
- **Client Config Service** (`src/lib/config/configuration-service.ts`):
  - Mirrors server-side `getMonitoringConfig()` and `getRetentionConfig()` for admin UI
- **Config Types** (`src/lib/config/types.ts`):
  - `MonitoringConfig` interface (8 fields, including `minProviderRequestsForLatencyAlert` added Feb 27) + `DEFAULT_MONITORING_CONFIG`
  - `RetentionConfig` interface (2 fields) + `DEFAULT_RETENTION_CONFIG`
  - `ConfigCategory` union extended with `'monitoring' | 'retention'`
- **Admin Endpoint**: `GET /api/admin/monitoring/alerts/status` — Returns `{ lastFired: { alertKey: timestampMs } }`
- **Admin UI**:
  - `MonitoringAlertsPanel.tsx` (366 lines) — Alert threshold config, email toggle, alert status display with age formatting
  - `RetentionSettingsPanel.tsx` (260 lines) — Retention day inputs, manual cleanup trigger with result feedback
  - Both added to `SettingsTab.tsx` category navigation (Bell icon for Monitoring, Clock icon for Retention)
- **Migration 025** (`supabase/migrations/025_monitoring_retention_config.sql`):
  - Seeds 7 monitoring + 2 retention config rows in `app_settings`
  - Creates `cleanup_processing_logs_configurable()` and `cleanup_extraction_metrics_configurable()` PL/pgSQL functions that read retention days from `app_settings` at execution time
  - Unschedules old hardcoded cron jobs and reschedules with configurable versions
- **Alert Threshold Defaults**:
  - `error_rate_warning_threshold`: 0.05 (5%)
  - `error_rate_critical_threshold`: 0.20 (20%)
  - `avg_latency_critical_ms`: 12000
  - `alert_cooldown_minutes`: 15
- **Tests**: 21 new tests (extraction-alert-service 9, MonitoringAlertsPanel 6, RetentionSettingsPanel 6) + 5 existing test files fixed for new mock requirements + 7 E2E tests
- **Files**:
  - `server/services/extraction-alert-service.ts` (new, 138 lines)
  - `server/services/config-service.ts` (+159 lines)
  - `server/routes/ai.ts` (+19 lines)
  - `server/routes/admin/monitoring.ts` (+25 lines)
  - `src/lib/config/types.ts` (+80 lines)
  - `src/lib/config/configuration-service.ts` (+93 lines)
  - `src/components/admin/tabs/settings/MonitoringAlertsPanel.tsx` (new, 366 lines)
  - `src/components/admin/tabs/settings/RetentionSettingsPanel.tsx` (new, 260 lines)
  - `src/components/admin/tabs/SettingsTab.tsx` (+155 lines)
  - `supabase/migrations/025_monitoring_retention_config.sql` (new, 118 lines)
  - `e2e/admin-flows.spec.ts` (+91 lines)
  - 3 new test files + 5 modified test files
- **Commit**: `c635685`

### 139. Alert System Fully Wired — Email, checkIntervalMs, minRequests (Feb 27, 2026)
- **Feature**: Three previously incomplete alert system features now fully operational
- **Email Dispatch**: `fireAlert()` in `extraction-alert-service.ts` now calls `sendAdminAlertEmail()` after `createNotification()`, gated by `config.enableEmailAlerts`. Addresses comma-split; each gets alert type, title, message, and details. Failures logged fire-and-forget.
- **checkIntervalMs Configurable**: Module-level `cachedCheckIntervalMs` in `server/routes/ai.ts` replaces hardcoded `300000` ms. Self-updates from DB config on each alert evaluation cycle.
- **minProviderRequestsForLatencyAlert**: New field end-to-end — `MonitoringConfig` interface, `config-service.ts` key map, `configuration-service.ts` client mirror, `MonitoringAlertsPanel.tsx` numeric input (1-100), migration 027 seeds default `3`.
- **Test Fixes**: `SettingsTab.test.tsx` regex `/ai/i` → `/^AI Settings/i` (collision with Market Benchmarks button text); `ExtractionHealthTab.test.tsx` added `aria-label="Refresh extraction health"` for reliable button targeting.
- **New Tests**: 4 (email dispatch when enabled/disabled, configurable min-requests threshold)
- **Migration**: `supabase/migrations/027_monitoring_min_requests_config.sql` — seeds `min_provider_requests_for_latency_alert` default `3` in `app_settings`
- **Files Changed**: `extraction-alert-service.ts`, `ai.ts`, `config-service.ts`, `types.ts`, `configuration-service.ts`, `MonitoringAlertsPanel.tsx`, `SettingsTab.tsx`, `ExtractionHealthTab.tsx`, `SettingsTab.test.tsx`, `ExtractionHealthTab.test.tsx`, `extraction-alert-service.test.ts`

### 140. Modular Actuarial Engine (Added Feb 28, 2026)
- **Feature**: Self-contained 4-layer actuarial evaluation engine for Turkish insurance policies
- **Architecture**: Layer A (Semantic exclusion analysis + evidence tracking) → Layer B (Compliance gates: SEDDK, DASK, product rules) → Layer C (Monte Carlo EOOP simulation with lognormal/Pareto loss models) → Layer D (TOPSIS MCDA ranking + weight sensitivity XAI)
- **Scope**: 4,916 lines across 17 files in `src/lib/actuarial-engine/`, plus migration 028 (395 lines)
- **Status**: Complete, tested, and **integrated into the UI pipeline** (adapter, TOPSIS in ComparePolicies, EOOP in PolicyDetailView). Production feature flag `actuarial_engine_enabled` (default: false) — DB tables not yet applied to production.
- **No new dependencies added**: Uses only built-in math (custom Mulberry32 PRNG, Box-Muller transform, inverse CDF Pareto sampling)
- **Key Functions**: `runFullEvaluation(policy, options?)` for single policy, `evaluateAndRankPolicies([...])` for multi-policy comparison with TOPSIS ranking
- **Policy Types**: `'kasko' | 'traffic' | 'dask' | 'zas'`
- **Database**: Migration `028_actuarial_engine_schema.sql` creates 5 tables (`policy_extractions`, `extraction_evidence`, `actuarial_config_sets`/`versions`, `actuarial_evaluation_runs`, `evaluation_results`)
- **Tests**: 40 golden regression tests with deterministic seed (42) + 8 engine-timings tests + 12 EvidenceCoveragePanel tests, all passing
- **Adapter**: `src/lib/actuarial-engine/adapter.ts` converts `AnalyzedPolicy` → `ActuarialPolicyInput` with fallback values for missing indemnity mechanics
- **UI Integration** (`819a6db`): `ComparePolicies.tsx` (TOPSIS rank/grade), `PolicyDetailView.tsx` (EOOP breakdown, Contract Quality Score), `src/lib/policy-evaluation/types.ts` (added `actuarialRank`, `actuarialCloseness`, `actuarialGrade` fields to `PolicyComparison`), `src/lib/policy-evaluation/comparator.ts` (TOPSIS integration + lint fixes)
- **Trial Restriction** (`1eba6f6`): Engine UI hidden from anonymous/free trial users via `isTrialResult` check in `PolicyDetailView.tsx`
- **Files**: `src/lib/actuarial-engine/` (18 files incl. adapter), `supabase/migrations/028_actuarial_engine_schema.sql`
- **Commits**: `dc6beae`, `819a6db`, `1eba6f6`, `8a61b58`

### 141. Actuarial Engine Admin Configuration UI (Added Feb 28, 2026)
- **Feature**: Admin dashboard tab for managing actuarial engine parameters (Monte Carlo, TOPSIS weights, risk scenarios, compliance rules)
- **Backend**: New API routes at `server/routes/admin/actuarial.ts` — `GET /api/admin/actuarial/configs` (fetch latest active versions), `POST /api/admin/actuarial/configs/:name/version` (save new version)
- **Frontend**: `src/components/admin/tabs/ActuarialTab.tsx` — JSON editor cards for each config set with version history, integrated into `AdminDashboard.tsx` as "Actuarial Engine" tab
- **Types**: Added `'actuarial'` to `AdminSection` union in `src/types/admin.ts`
- **Config Sets**: Monte Carlo defaults, TOPSIS criteria defaults, Kasko scenarios, Compliance rules (seeded by migration 028)
- **Files**: `server/routes/admin/actuarial.ts` (new), `src/components/admin/tabs/ActuarialTab.tsx` (new), `server/routes/admin/index.ts` (modified), `src/components/admin/AdminDashboard.tsx` (modified), `src/types/admin.ts` (modified)

### 142. Nixpacks Configuration for Railway Deployment (Fixed Feb 28, 2026)
- **Problem**: Railway's Nixpacks builder auto-detected Caddy web server (from `index.html` in `dist/`) and Chromium (from Playwright in devDependencies), causing port conflicts since Express already serves static files, and bloating the production image by 400+ MB
- **Root Cause**: Without explicit `providers` configuration, Nixpacks scans the project and provisions all detected services. Also used invalid Nix package names (`nodejs_22`, `npm-9_x`) that don't exist in nixpkgs.
- **Solution**: Created `nixpacks.toml` with `providers = ["node"]` to disable auto-detection, used extend-defaults pattern (`"..."`) for packages with only `openssl` added explicitly, and added `healthcheckPath = "/api/health"` with `healthcheckTimeout = 60` to `railway.json`
- **Files**: `nixpacks.toml` (new, 22 lines), `railway.json` (updated with healthcheck config)
- **Commits**: `1f34759`, `acc190f`

### 142b. Server-Side CSV Export and Monitoring Import Fixes (Fixed Feb 28, 2026)
- **Problem**: Two server TypeScript build errors preventing Railway deployment:
  1. `server/routes/admin/content.ts` CSV export had misaligned column headers vs row data — used client-side field names (`file_name`, `ocrEngine`) instead of server-side `DocumentProcessingLog` fields (`filename`, `ocr_engine`, `total_duration_ms`). Also `escapeCSV()` only accepted `string` but received `number`/`boolean` values.
  2. `server/routes/admin/monitoring.ts` had missing `getSupabaseWithError` import, unused `req` parameter, and missing type annotations on JSON response objects.
- **Solution**: Aligned CSV headers with actual server-side DB fields, widened `escapeCSV` param type to `string | number | boolean | null | undefined` with nullish check (preserves `0` and `false` as values), fixed monitoring imports and types.
- **Files Changed**: `server/routes/admin/content.ts`, `server/routes/admin/monitoring.ts`
- **Commit**: `acc190f`

### 143. Actuarial Engine Timing Instrumentation — P3.1 (Added Feb 28, 2026)
- **Feature**: The actuarial engine now records per-layer execution times on every evaluation result
- **Implementation**:
  - Added `LayerTimings` interface to `types.ts`: `layerA_ms`, `layerB_ms`, `layerC_ms`, optional `layerD_ms`, `total_ms`
  - Instrumented `engine.ts` with `performance.now()` around each layer in `runFullEvaluation()` and `evaluateAndRankPolicies()`
  - Blocked (compliance-failed) results set `layerC_ms = 0` and `layerD_ms = undefined`
  - Multi-policy TOPSIS evaluations add `layerD_ms` to each eligible result
  - Added `PerformanceTimingsCard` component in `ActuarialTab.tsx` showing evaluation count, avg/min/max total time, per-layer averages
  - Exported `recordEvaluationTiming()` for client-side ring buffer (max 50 entries) to be called by ComparePolicies/PolicyDetailView
- **Files Changed**: `types.ts`, `engine.ts`, `index.ts`, `ActuarialTab.tsx`
- **Tests**: 8 tests in `engine-timings.test.ts` (timing fields populated, total >= sum, finite numbers, blocked results, layerD_ms on TOPSIS)

### 144. Evidence Coverage Dashboard — P3.2 (Added Feb 28, 2026)
- **Feature**: Admin panel now surfaces evidence coverage metrics from `generateEvidenceCoverageReport()`
- **Implementation**:
  - Created `EvidenceCoveragePanel.tsx` with 3 summary cards (Coverage Rate, Fields With Evidence, Review Status)
  - Confidence distribution histogram with 5 buckets (0-20%, 20-40%, ..., 80-100%), color-coded bars
  - Fields Needing Review table with field path, evidence status, confidence percentage, reason
  - Integrated into `ActuarialTab.tsx` below the performance timings section
  - Props-driven: accepts `PolicyEvaluationResult | null`, graceful empty states when no evaluation data available
- **Files Created**: `EvidenceCoveragePanel.tsx` (~294 lines), `EvidenceCoveragePanel.test.tsx` (12 tests)
- **Data Source**: `PolicyEvaluationResult.evidenceCoverage` (`EvidenceCoverageReport` from `types.ts`)

### 145. Expanded Golden Regression Tests — P3.3 (Added Feb 28, 2026)
- **Feature**: 14 new golden regression tests covering edge cases across all supported policy types
- **Kasko Extended** (5 tests): luxury high-limit vehicle, full supplementary coverage, zero deductible, no coverages included, zero exclusion texts
- **Traffic Extended** (3 tests): exact SEDDK 2026 minimums (passes), 1₺ below minimum (fails), maximum limits
- **DASK/ZAS Extended** (3 tests): exactly 2% deductible (passes), ZAS with multiple perils, coverage exceeding max
- **Cross-Cutting** (3 tests): identical policies equal TOPSIS ranking, mixed policy types in multi-eval, configSnapshot always present
- **Total**: 40 golden regression tests (26 existing + 14 new), all deterministic with seed=42
- **File Modified**: `golden-regression.test.ts` (+434 lines)

### 146. Actuarial Event Bus Pattern — P1 (Added Feb 28, 2026)
- **Pattern**: `actuarial-events.ts` provides pub/sub for evaluation results — decouples `PolicyDetailView`/`ComparePolicies` (producers) from `ActuarialTab` (consumer)
- **API**: `emitEvaluation(policyId, result)` fires event; `subscribeEvaluation(listener)` returns unsubscribe function (React `useEffect` compatible)
- **Gotcha**: Module-level `Set<Listener>` — works for SPA, does not survive page reload. Use DB persistence (P3) for durability
- **Gotcha**: `persistToServer()` uses dynamic `import('@/lib/admin/api')` — only fires when `adminFetch` is available (logged-in admin context)
- **Files**: `src/lib/actuarial-engine/actuarial-events.ts`, integration in `PolicyDetailView.tsx`, `ComparePolicies.tsx`, `ActuarialTab.tsx`

### 147. Actuarial Admin API Endpoints — P2 (Added Feb 28, 2026)
- **`POST /api/admin/actuarial/evaluation-results`** — persist an evaluation result (policyId, resultData required)
- **`GET /api/admin/actuarial/evaluation-results`** — historical retrieval with `?policyId=X&limit=50&offset=0`
- **`PATCH /api/admin/actuarial/feature-flag`** — toggle `actuarial_engine_enabled` with `{ "enabled": true|false }`
- **Dependency**: All 3 endpoints require migration `028_actuarial_engine_schema.sql` to be applied first
- **Files**: `server/routes/admin/actuarial.ts`, `server/services/actuarial-persistence.ts`

### 148. PolicyComparison Type Extended — P1 (Added Feb 28, 2026)
- **Change**: Added `actuarialResults?: PolicyEvaluationResult[]` to `PolicyComparison` interface in `types.ts`
- **Wiring**: `comparator.ts` now passes full actuarial engine results through the comparison return object
- **Consumer**: `ComparePolicies.tsx` reads `comparison.actuarialResults` to emit timing events via the event bus
- **Barrel Export**: `mapAnalyzedToActuarialInput` added to `@/lib/actuarial-engine` barrel (`index.ts`)

### 149. Locale-Aware Formatting Functions (Added Mar 3, 2026)
- **Feature**: `formatCurrency`, `formatCurrencyCompact`, `formatDate`, `formatNumber` in `src/lib/utils.ts` now accept an optional `locale` parameter
- **Caveat**: `formatCurrencyCompact` accepts `_locale` for API consistency but **silently ignores it** — uses a hardcoded `CURRENCY_SYMBOLS` lookup to produce compact output like `₺980M`. Update this function if locale-aware compact formatting is needed.
- **Backward Compatible**: All default to `'tr'` — existing callers without locale continue working identically
- **INTL_LOCALE_MAP**: Maps app locale codes to Intl locale strings: `{ tr: 'tr-TR', en: 'en-US', de: 'de-DE', fr: 'fr-FR' }` — extensible for future locales
- **Callers Updated** (P1 Step 2, commit `93a9d0e`):
  - Components: `PolicyCard`, `PolicyDashboard`, `PolicyDetailView`, `PolicyDiffViewer`, `ComparePolicies` (+ `QuickStatsCard`), `SharedResult`, `AllSamplesDemo`
  - Non-React: `export.ts` (7 functions accept `locale` param), `pdf-export/templates.ts` (4 templates + `fieldHTML` helper derive locale from `options.language`)
- **Pattern for React components**: `const { locale } = useI18n(); formatCurrency(amount, 'TRY', locale)`
- **Pattern for non-React utilities**: Accept `locale: string = 'tr'` as function parameter; derive from `options.language` in template functions via `const locale = isTr ? 'tr' : 'en'`
- **Files Changed**: `src/lib/utils.ts`, 7 component files, `src/lib/export.ts`, `src/lib/pdf-export/templates.ts`
- **Commits**: `4c42c57` (Step 1 — functions), `93a9d0e` (Step 2 — callers)

### 150. Fix 68 Pre-Existing Test Failures (Fixed Mar 4, 2026)
- **Problem**: 68 test failures accumulated across 4 test files due to code changes (i18n lazy-load split, cache version bump, new translation sections) without corresponding test updates
- **Root Causes and Fixes**:
  1. **`translation-cache.test.ts` (2 failures)**: `CACHE_SCHEMA_VERSION` changed from 2→3 in source but test still asserted version 2. Fix: Updated assertions to expect version 3.
  2. **`Settings.test.tsx` (1 failure)**: New `emailPreferences` i18n section added during S2 ternary migration but test's i18n mock didn't include it. Fix: Added `emailPreferences` to mock.
  3. **`translation-service.test.ts` (61 failures)**: EN/TR translations split into lazy-loaded async Vite chunks (Known Issues #123/#124) but tests imported from old paths. Also, cache-first merge behavior changed but assertions expected old merge semantics. Fix: Added `vi.mock` for `translations-en`, `translations-tr`, AND `translations-skeleton` (all three lazy/split modules must be mocked); updated merge assertions to expect cache-first override semantics.
  4. **`PolicyUpload-coverage.test.tsx` (4 failures)**: Upload progress simulation loop (5×100ms `setTimeout` in `processFileAsync`) left pending timers between tests. Error tests triggered the upload loop, and timers fired into the next test's DOM. Fix: Added `afterEach` with 700ms timer flush in `act()` wrapper; added explicit `{ timeout: 3000 }` to 8 `waitFor` calls and `{ timeout: 5000 }` to 1 retry `waitFor` (defaults were too short for async upload loops); rewrote retry test to use `mockExtractPolicy.toHaveBeenCalledTimes(N)` instead of fragile DOM text assertions.
- **Result**: Full test suite — 15,813 tests, 0 failures, 336/337 files (1 fork worker timeout is infrastructure, not code)
- **Key Pattern — Timer Flush for Fire-and-Forget Async**:
  ```tsx
  afterEach(async () => {
    // Drain pending upload progress loop timers to prevent leakage
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 700))
    })
  })
  ```
- **Key Pattern — Mock Call Count vs DOM Text for Async Assertions**:
  ```tsx
  // FRAGILE: DOM text may not be present if async loop hasn't rendered
  await screen.findByText('fail1.pdf')
  // ROBUST: Mock call count is deterministic for fire-and-forget async
  await waitFor(() => { expect(mockExtractPolicy).toHaveBeenCalledTimes(2) }, { timeout: 3000 })
  ```
- **Commit**: `e827025`

### 151. FX Conversion System (Added Mar 5, 2026; Production API Mar 6, 2026)
- **Feature**: Multi-currency display support with server-side FX proxy and client-side conversion hook
- **Server**: `server/routes/fx.ts` — `GET /api/fx/rates?base=TRY` proxy to exchangerate.host with 6-hour server cache, `GET /api/fx/status` health check
- **Live API**: exchangerate.host with optional `EXCHANGERATE_API_KEY` env var. Graceful fallback to hardcoded rates when API unavailable or key not set
- **Supported Currencies**: TRY (base), USD, EUR, GBP, CHF, SAR, AED (7 total, added Mar 6)
- **Client Service**: `src/lib/fx/fx-service.ts` — Singleton FX service with `convertSync()`, `formatConverted()`, 4-hour client cache, background rate refresh
- **Client Hook**: `src/hooks/useDisplayCurrency.ts` — `useDisplayCurrency()` returns `{ displayCurrency, convert, formatConverted, formatConvertedCompact, isReady }`
- **User Preference**: `display_currency` added to `user-overridable.ts` — persisted per-user, selectable in `UserPreferencesPanel.tsx` with `CurrentRateHint` showing live rate
- **Barrel Export**: `src/lib/fx/index.ts` re-exports service + types
- **Tests**: 60 tests (22 client + 27 server + 11 service)
- **Commits**: `8b25910`, `5660d4b`, `c8f74cb`, `e6c0132`

### 152. PolicyDetailView Full i18n Migration (Added Mar 5, 2026)
- **Feature**: Migrated 132 `locale === 'tr'` ternaries to translation keys in `PolicyDetailView.tsx`
- **Remaining**: 4 data-field ternaries kept (correct — select `nameTr`/`name` on data objects, not translation strings)
- **Translation Sections Used**: `policy`, `evaluation`, `comparison`, `insights`, `coverageCategories`, `global`, `common`
- **Commit**: `8b25910`

### 153. Migration 030 — Seed 426 Missing Translation Keys (Added Mar 5, 2026)
- **Feature**: Generated idempotent SQL migration seeding 426 new keys × 2 locales = 852 translation rows
- **Generator Script**: `scripts/generate-translation-migration.ts` — auto-generates SQL from .ts translation files, diffs against migrations 018/019/020
- **Sections**: 11 entirely new (aiInsightsPanel, conflictResolution, emailPreferences, errorBoundary, exportMenu, global, notFound, notifications, onboarding, policyDiff, policyDocuments) + 7 expanded (account, common, comparison, landing, policy, settings, upload)
- **Version Bump**: `translation_metadata.version` `"3"` → `"4"` (triggers client cache refresh)
- **Applied to Production**: Yes (via Supabase SQL Editor, Mar 5, 2026)
- **Commit**: `b1f22f3`

### 154. Recharts + d3 Split into Dedicated Vendor Chunk (Added Mar 5, 2026)
- **Feature**: Recharts and d3-* dependencies now in dedicated `vendor-recharts` chunk via `manualChunks`
- **Problem**: Recharts (108 KB gzip) only used in 3 admin/actuarial chart components but could be pulled into shared chunks
- **Solution**: Added `if (id.includes('recharts') || id.includes('d3-')) return 'vendor-recharts'` to `vite.config.ts`
- **Result**: Main bundle 217 → 213 KB gzip (−4 KB). Recharts chunk: 116 KB gzip (loaded on demand)
- **Risk**: LOW — recharts/d3 are pure rendering libraries with no circular dependency risk
- **Commit**: `5a8e542`

### 155. useDisplayCurrency Wired into All React Components (Added Mar 6, 2026)
- **Feature**: All 12 currency-displaying React components now use `useDisplayCurrency` hook instead of hardcoded `formatCurrency('TRY')` calls
- **Components Updated**: AIInsightsPanel, AllSamplesDemo, ComparePolicies, PolicyCard, PolicyDashboard, PolicyDetailView, PolicyDiffViewer, SharedResult
- **Hook Source**: `src/hooks/useDisplayCurrency.ts` — provides `formatConverted()` and `formatConvertedCompact()` which respect user's `display_currency` preference from the FX system
- **New Export**: `formatConvertedCompact()` added to hook — wraps `formatCurrencyCompact()` with FX conversion, used in `PolicyDashboard.tsx` for compact stat display (e.g., `₺980M`)
- **Test Updates**: 7 test files updated with `useDisplayCurrency` mock returning `{ displayCurrency: 'TRY', convert: (v) => v, formatConverted: (v) => '₺' + v, formatConvertedCompact: (v) => '₺' + v.toLocaleString(), isReady: true }`
- **Bug Fix**: `formatConverted` was missing from `useCallback` dependency array in PolicyDetailView text export — added to prevent stale closure
- **Files Changed**: 16 files (+162/−68 lines)
- **Commits**: `d48f1ed`, `7bc19b4`

### 156. FX Production API Integration with exchangerate.host (Added Mar 6, 2026)
- **Feature**: Live exchange rate fetching from exchangerate.host with API key support, graceful fallback, and expanded currency list
- **Problem**: FX endpoint used placeholder implementation without live API; only 4 currencies supported
- **Solution**:
  - `server/routes/fx.ts` — Full exchangerate.host integration with `EXCHANGERATE_API_KEY` env var, 6-hour server cache TTL, `GET /api/fx/status` health endpoint
  - `src/lib/fx/fx-service.ts` — Added CHF, SAR, AED (7 currencies total); 4-hour client cache
  - `src/lib/config/user-overridable.ts` — Added CHF/SAR/AED to currency picker options
  - `src/components/UserPreferencesPanel.tsx` — Added `CurrentRateHint` component showing live rate beneath currency picker
  - `src/components/admin/tabs/BenchmarksTab.tsx` — Removed hardcoded `₺` symbols, uses dynamic currency formatting
- **Graceful Fallback**: If API key not set or API unavailable, falls back to hardcoded rates with `source: 'fallback'` in response
- **New Env Var**: `EXCHANGERATE_API_KEY` (optional — free tier works without key but has lower rate limits)
- **Tests**: 27 server tests covering live API, caching, fallback, error handling, status endpoint
- **Commit**: `5660d4b`

### 157. PolicyDetailView TypeScript Build Errors (Fixed Mar 6, 2026)
- **Problem**: 5 TypeScript errors in `PolicyDetailView.tsx` blocking Railway frontend build (`tsc -b`)
- **Root Causes**:
  1. Unused `locale` params in `formatCoverageLimit` and `getCoverageInfoText` (TS6133)
  2. `formatConverted` referenced in `CollapsibleCoverageCategory` and `ExclusionsSection` but the components receive `formatAmount` as prop name (TS2304)
  3. `ExclusionsSection` was missing `useDisplayCurrency()` hook entirely
  4. `item.questionEn` accessed on `missingImportantExclusions` type which only has `{ name, nameEn, question, importance }` — no `questionEn` field (TS2339)
- **Solution**: Prefixed unused params with `_`, used correct prop name `formatAmount`, added missing hook, removed invalid property access
- **Commit**: `c8f74cb`

### 158. fx.ts Type Assertion for exchangerate.host Response (Fixed Mar 6, 2026)
- **Problem**: 5 TypeScript errors in `server/routes/fx.ts` blocking Railway server build (`tsc -p server/tsconfig.json`)
- **Root Cause**: `response.json()` returns `unknown` under the server's stricter TypeScript config; accessing `.success`, `.quotes`, `.error` on `unknown` is disallowed
- **Solution**: Added explicit type assertion: `(await response.json()) as { success?: boolean; quotes?: Record<string, number>; error?: unknown }`
- **Commit**: `e6c0132`

### 159. Extraction Abort-on-Unmount Causing Ghost Timeout Errors (Fixed Mar 7, 2026)
- **Problem**: User navigates away from `/try` during extraction → `AbortController.abort()` fires → AI provider sees abort as an error → next extraction attempt starts with stale error state, or user sees "Load failed" on return
- **Root Cause**: `TryAnalysis.tsx` used `AbortController` passed to `extractPolicyFromDocument()` and aborted on unmount. The abort signal propagated through the proxy fetch, causing in-flight server work to be wasted and client to receive an abort error that was confusing to end users.
- **Solution**: Removed abort-on-unmount entirely. Extraction now runs to completion even if user navigates away. `saveTrialResult()` persists the result so it's available when user returns to `/try`. `isMounted` ref guards all UI state updates and toasts to prevent React warnings.
- **Files Changed**: `src/components/TryAnalysis.tsx`, `src/lib/ai/policy-extractor.ts`
- **Commit**: `7ca2727`

### 160. extractViaProxy Hanging Indefinitely Without Fetch Timeout (Fixed Mar 7, 2026)
- **Problem**: `extractViaProxy()` in `config.ts` had no timeout on the `fetch()` call. If the server hung or was unreachable, the client waited forever.
- **Solution**: Added `AbortSignal.timeout(FETCH_TIMEOUT_MS)` (120s) to the fetch call. On timeout, returns a structured error with `CLIENT_FETCH_TIMEOUT` error code.
- **Build Fix**: `FETCH_TIMEOUT_MS` was initially declared inside the `try` block but referenced in the `catch` block → `TS2304: Cannot find name`. Fixed by moving declaration before `try`.
- **Files Changed**: `src/lib/ai/config.ts`
- **Commits**: `cd3c4f3`, `53d4e48`

### 161. Extraction Timeout Stacking — Recurring 90s Failures (Fixed Mar 7, 2026)
- **Problem**: After one extraction timeout, subsequent attempts also timed out — the `Promise.race` timeout promise from the previous attempt lingered and won the race against the new extraction.
- **Root Cause**: `timeoutId` and `timeoutPromise` were not properly scoped to each extraction attempt in `runExtraction()`.
- **Solution**: Ensured each call to `runExtraction()` creates its own `timeoutPromise` with a fresh `setTimeout`. The `clearTimeout` runs in the finally block.
- **File Changed**: `src/components/TryAnalysis.tsx`
- **Commit**: `33747bf`

### 162. Pipeline Phase Timing Diagnostics for Extraction Errors (Added Mar 7, 2026)
- **Feature**: `extractPolicyFromDocument()` now records per-phase timing (pdf.js, Document AI, text preprocessing, AI extraction, validation, total) and includes it on both success and failure results.
- **Client-Side Phases Tracked**: `pdfjs_ms`, `documentAI_ms`, `textPreprocessing_ms`, `aiExtraction_ms`, `validation_ms`, `pipeline_total_ms`
- **Error Display**: `TryAnalysis.tsx` catch block extracts `clientPhaseTiming` from enriched errors and appends `[Timing: OCR: 50.1s, Server total: 52.0s, Total: 55.3s]` to error messages.
- **Files Changed**: `src/lib/ai/policy-extractor.ts` (instrumented pipeline), `src/components/TryAnalysis.tsx` (error display)
- **Commit**: `0a430e8`

### 163. Production "Load failed" Diagnostic Instrumentation (Added Mar 7, 2026)
- **Feature**: Server-side AI extraction routes now emit structured `log.info` with per-phase timing and full `fallbackChain` on every extraction completion/failure.
- **Server Phases Tracked**: `configLoad_ms`, `anthropic_ms` or `openai_ms`, `total_ms`
- **Budget System**: `REQUEST_BUDGET_MS = 105000` (105s total budget). Primary provider gets 50s (`PRIMARY_TIMEOUT_MS`), fallback gets 45s (`FALLBACK_TIMEOUT_MS`), remaining budget for config/overhead. When budget exhausted, returns error code `BUDGET_EXHAUSTED`.
- **FallbackChain**: Each provider attempt recorded with `{ provider, success, duration_ms, error, error_code }`. Returned to client for diagnostic display.
- **Error Codes Added**: `ANTHROPIC_SDK_TIMEOUT`, `OPENAI_SDK_TIMEOUT`, `ANTHROPIC_OVERLOADED`, `BUDGET_EXHAUSTED`
- **Files Changed**: `server/routes/ai.ts`
- **Commit**: `952680d`

### 164. Diagnostic Error Threading Through Extraction Pipeline (Added Mar 7, 2026)
- **Feature**: Error messages displayed to users now include pasteable diagnostic strings identifying the exact failure point.
- **Format**: `[code=BUDGET_EXHAUSTED | req=ext-1709829374829 | server_anthropic_ms=50123ms, pipeline_total_ms=52000ms]`
- **Pipeline (5 layers)**:
  1. **`server/routes/ai.ts`**: Returns `requestId`, `phaseTiming`, `fallbackChain`, error codes in JSON response
  2. **`config.ts` (`extractViaProxy`)**: Extracts `errorCode`, `requestId`, `serverPhaseTiming`, `serverElapsedMs` from HTTP error responses. In catch block, classifies as `CLIENT_FETCH_TIMEOUT` / `CLIENT_ABORT` / `NETWORK_ERROR` with `clientElapsedMs`.
  3. **`openai.ts` / `claude.ts`**: Create enriched `Error` objects with `errorCode`, `requestId`, `serverPhaseTiming`, `serverElapsedMs` properties from proxy result
  4. **`policy-extractor.ts`**: Extracts proxy diagnostic fields from enriched errors, merges server timing into `clientPhaseTiming` (prefixed `server_`), returns `errorCode` + `requestId` on `ExtractionError`
  5. **`TryAnalysis.tsx`**: Builds `[code=X | req=Y | timing...]` diagnostic suffix from enriched error properties, appends to both timeout and non-timeout error messages
- **Files Changed**: `src/lib/ai/config.ts`, `src/lib/ai/providers/openai.ts`, `src/lib/ai/providers/claude.ts`, `src/lib/ai/policy-extractor.ts`, `src/components/TryAnalysis.tsx`
- **Commit**: `5f6412e`

### 165. DB Query Timeout for Config and Prompt Services (Added Mar 7, 2026)
- **Problem**: Supabase config and prompt queries could hang indefinitely during extraction, blocking the entire pipeline
- **Root Cause**: No timeout on `supabase.from(...).select(...)` calls in `config-service.ts` and `prompt-service.ts`. If the Supabase connection pool is exhausted or the DB is slow, the extraction hangs forever.
- **Solution**: Added `DB_QUERY_TIMEOUT_MS = 8_000` (8 seconds) to both services. Config queries are wrapped in `Promise.race` with a timeout that returns defaults on expiry. Prompt queries use a `withTimeout()` helper that rejects with a descriptive error.
- **Behavior on Timeout**: Config service falls back to system defaults silently (no crash). Prompt service falls back to hardcoded prompts (existing fallback chain).
- **Files Changed**: `server/services/config-service.ts`, `server/services/prompt-service.ts`
- **Commit**: `0a430e8`

### 166. ExtractedPolicyData `_proxyMeta` Interface Extended (Added Mar 7, 2026)
- **Feature**: Added `serverPhaseTiming?: Record<string, number>` and `serverElapsedMs?: number` to the `_proxyMeta` interface in `extraction-schema.ts`
- **Purpose**: Provider adapters (openai.ts, claude.ts) populate these fields from the proxy response, enabling the full diagnostic chain from server → client → user-visible error message
- **File Changed**: `src/lib/ai/extraction-schema.ts`
- **Commit**: `0a430e8`

### 167. Exclusions Not Displaying in English When Locale is EN (Fixed Mar 9, 2026)
- **Problem**: PolicyDetailView showed Turkish exclusion text even when app locale was set to English
- **Root Cause**: Three-layer gap: (1) AI prompts didn't strongly require `exclusionsEn` population, (2) no fallback translation when AI failed to provide English exclusions, (3) `convertToAnalyzedPolicy()` passed `exclusionsEn: null` when AI didn't comply
- **Solution**:
  - Created `src/lib/i18n/exclusion-translations.ts` — 60+ Turkish→English exclusion pattern translations
  - `ensureExclusionsEn()` fills gaps: AI-provided → pattern-match → Turkish fallback
  - Wired into all 3 extraction paths in `policy-extractor.ts`
  - Strengthened AI prompts in `server/routes/ai.ts` (Anthropic) and `extraction-schema.ts` (OpenAI)
- **Key Pattern**:
  ```typescript
  import { ensureExclusionsEn } from '@/lib/i18n/exclusion-translations'
  // Fills missing English translations for Turkish exclusions
  exclusionsEn = ensureExclusionsEn(exclusions, exclusionsEn)
  ```
- **Tests**: 21 tests in `exclusion-translations.test.ts`
- **Commit**: `4a3e26f`

### 168. Mobile Tab Suspension Killing Extraction Fetch (Fixed Mar 9, 2026)
- **Problem**: On mobile, backgrounding the tab during extraction killed the HTTP fetch but froze JS timers. On return, `CLIENT_TIMEOUT_UMBRELLA` error shown with ugly diagnostic codes like `[code=CLIENT_TIMEOUT_UMBRELLA]`
- **Root Cause**: Mobile browsers suspend background tabs, killing network connections. Fetch promise never resolves/rejects because `AbortSignal.timeout` was also frozen. When tab resumes, the umbrella timeout fires.
- **Solution (3 fixes)**:
  1. **Visibility change auto-retry**: `visibilitychange` listener detects tab resume during in-flight extraction. Checks for saved result first (extraction may have completed), then auto-retries (up to 2 times) with 1.5s delay for network reconnect.
  2. **Clean error messages**: Diagnostic codes moved to `console.warn`; users see clean "timed out, please try again"
  3. **Timeout alignment**: Client fetch timeout 120s → 135s (was less than server's 125s budget)
- **Key Refs Added**: `extractionInFlightRef`, `lastFileRef`, `retryCountRef` in `TryAnalysis.tsx`
- **Files Changed**: `src/components/TryAnalysis.tsx`, `src/lib/ai/config.ts`
- **Commit**: `303da34`

### 169. Hardcoded Backend Configs Migrated to Admin-Configurable app_settings (Added Mar 12, 2026; Production-Verified Mar 13, 2026)
- **Feature**: 29 previously hardcoded backend constants are now stored in `app_settings` and admin-configurable
- **Migration**: `supabase/migrations/033_seed_hardcoded_configs.sql` — idempotent via `ON CONFLICT DO NOTHING`
- **Production Status**: Both migrations 033 and 034 applied to production Supabase (Mar 13, 2026). All 30 keys verified via admin API smoke test (login → read all categories → write round-trip on `fx.api_timeout_ms` → restore). FX endpoint confirmed consuming DB config (7 currencies, 6h cache TTL).
- **Categories Seeded** (8 categories, 29 keys):
  - `ai` (5 keys): `request_budget_ms`, `primary_provider_timeout_ms`, `fallback_provider_timeout_ms`, `client_fetch_timeout_ms`, `trial_extraction_timeout_ms`
  - `fx` (5 keys): `server_cache_ttl_ms`, `supported_currencies`, `fallback_rates`, `api_timeout_ms`, `client_cache_ttl_ms`
  - `server` (5 keys): `db_query_timeout_ms`, `config_cache_ttl_ms`, `prompt_cache_ttl_ms`, `translation_cache_ttl_ms`, `rate_limit_config_cache_ttl_ms`
  - `webhooks` (3 keys): `max_delivery_attempts`, `delivery_timeout_ms`, `max_response_body_length`
  - `ocr` (3 keys): `pdf_load_timeout_ms`, `max_worker_failures`, `ocr_cleanup_timeout_ms`
  - `cost` (1 key): `token_pricing` (JSON — per-model pricing for 17 AI models)
  - `ui` (1 key): `trial_expiry_ms`
  - `monitoring` (6 keys): `extraction_buffer_size`, `max_metrics_buffer_size`, `max_alert_history`, `max_response_times`, `server_perf_max_events`, `server_perf_max_age_ms`
- **Config Service** (`server/services/config-service.ts`):
  - 6 new typed getters: `getFXConfig()`, `getServerConfig()`, `getWebhooksConfig()`, `getCostConfig()`, `getMonitoringConfig()` (extended with buffer keys), `getRetentionConfig()`
  - Each has `DEFAULT_*_CONFIG` object + `*_KEY_MAP` record for snake_case→camelCase mapping
  - DB-first with hardcoded fallback — if DB unavailable, code uses `DEFAULT_*_CONFIG`
  - In-memory cache with 5-minute TTL
- **Consumer Integration** (30 files changed):
  - `server/routes/ai.ts` — Extraction timeouts read from `getAIConfig()`
  - `server/routes/fx.ts` — Cache TTL, supported currencies, fallback rates from `getFXConfig()`
  - `server/routes/settings.ts` — Rate limit config cache TTL from `getServerConfig()`
  - `server/middleware/cost-control.ts` — Token pricing from `getCostConfig()`
  - `server/middleware/rate-limit.ts` — Rate limit config refresh from `getServerConfig()`
  - `server/middleware/monitoring.ts` — Buffer sizes from `getMonitoringConfig()`
  - `server/services/prompt-service.ts` — Prompt cache TTL from `getServerConfig()`
  - `server/services/translation-service.ts` — Translation cache TTL from `getServerConfig()`
  - `server/services/webhook-service.ts` — Delivery config from `getWebhooksConfig()`
  - `src/lib/ai/config.ts` — Client fetch timeout from `getAIConfig()`
  - `src/lib/ai/pdf-parser.ts` — PDF load timeout, worker failure threshold from config
  - `src/lib/free-trial.ts` — Trial expiry from `getUIConfig()`
  - `src/components/TryAnalysis.tsx` — Umbrella timeout from `getAIConfig()`
  - `src/lib/config/configuration-service.ts` — Client-side mirrors for FX, server, webhooks, cost
  - `src/lib/config/types.ts` — All new TypeScript interfaces and defaults
  - `src/components/admin/tabs/settings/GenericSettingsPanel.tsx` — **NEW** Reusable admin panel for any config category
  - `src/components/admin/tabs/SettingsTab.tsx` — New category tabs (FX, Server, Webhooks, Cost, Monitoring buffers)
- **Admin UI**: `GenericSettingsPanel.tsx` — renders editable forms for any config category using metadata from `SETTINGS_CATEGORIES` registry. Supports number, string, boolean, JSON value types with live JSON validation (save blocked on invalid JSON, inline error message, red border).
- **JSON Validation** (commit `b90635e`): JSON fields now have live validation on keystroke — Save button disabled when JSON is invalid, error message shown inline below textarea with AlertCircle icon.
- **Tests**: 49 new tests in `server/__tests__/config-migration-validation.test.ts`:
  - SQL↔TypeScript drift detection: parses migration SQL, validates all 29 seeded values match `DEFAULT_*_CONFIG` objects
  - JSON field validation: `supported_currencies`, `fallback_rates`, `token_pricing` parse correctly
  - New getter tests: all 6 new getters tested with DB data, empty DB fallback, error fallback, JSON parsing, boolean coercion
  - Cache invalidation: validates cache clear + re-fetch behavior
  - Barrel export completeness
- **Files Changed**: 30 files (+2,894 / −530 lines)
- **Commits**: `26c7524`, `2e61dfc`, `314f744`

### 170. `/api/ai/diagnose` Test Timeouts — Global Fetch Not Mocked (Fixed Mar 14, 2026)
- **Problem**: 10 tests for the `/api/ai/diagnose` endpoint in `ai-routes-extended.test.ts` consistently timed out
- **Root Cause**: `setupDefaultMocks()` mocked Supabase, OpenAI, Anthropic, and prompt services but never stubbed `global.fetch`. The Google Vision diagnostic check calls `fetch('https://vision.googleapis.com/...')` directly, causing real HTTP requests that timed out in CI/test environments.
- **Solution**: Added `vi.stubGlobal('fetch', mockFetch)` in `setupDefaultMocks()` returning `{ ok: true, status: 200, json: async () => ({ responses: [{}] }) }`
- **Pattern**: Any test file that exercises code calling `fetch()` directly (not through axios/supertest) must stub global fetch. This is different from the `supertest(app)` pattern used for Express routes.
- **File Changed**: `server/__tests__/ai-routes-extended.test.ts`
- **Commit**: `6ad5b66`

### 171. Confidence Diagnostic Checkpoints Added (Mar 14, 2026)
- **Feature**: Added `[ConfidenceDiag]` diagnostic `console.warn` checkpoints across the entire AI extraction confidence pipeline to trace how confidence scores flow from AI provider → server → client → UI
- **Files Changed** (5 files, +105 lines):
  - `server/routes/ai.ts` — 3 server-side checkpoints at OpenAI standalone, Anthropic unified, and OpenAI fallback/unified success paths
  - `src/lib/ai/policy-extractor.ts` — Client-side checkpoint after `recalculateOverallConfidence()` with weights source (`admin_db_config` vs `hardcoded_defaults`), per-field breakdown, and delta from AI-reported overall
  - `src/lib/ai/providers/claude.ts` — Cache HIT checkpoint, missing confidence default checkpoint, AI-returned confidence checkpoint
  - `src/lib/ai/providers/openai.ts` — Same 3 checkpoints (cache, missing, returned) for both proxy and direct API paths
  - `src/components/TryAnalysis.tsx` — UI-level checkpoint before confidence warning/tier decision
- **Log Prefix**: All checkpoints use `[ConfidenceDiag]` — search Railway logs to trace confidence flow
- **Note**: These are diagnostic logs intended for investigation. Consider removing or gating behind a feature flag once confidence scoring is validated in production.
- **Commit**: `fdedfea`

### 172. TryAnalysis `rawData` Property Access Build Error (Fixed Mar 14, 2026)
- **Problem**: Railway build failed with `TS2339: Property 'rawData' does not exist on type 'AnalyzedPolicy'` at `TryAnalysis.tsx:343`
- **Root Cause**: A confidence diagnostic checkpoint (added in commit `fdedfea`) referenced `policy.rawData?.confidence`, but `AnalyzedPolicy` has `aiConfidence: number` directly — there is no `rawData` property on the type
- **Solution**: Changed `rawConfidenceObject: policy.rawData?.confidence ?? 'not in rawData'` to `aiConfidenceValue: policy.aiConfidence`
- **File Changed**: `src/components/TryAnalysis.tsx`
- **Commit**: `2f819a3`

### 173. Admin Password Reset Procedure (Documented Mar 14, 2026)
- **Problem**: Admin login returns "Invalid email or password" when the password hash in the `admin_users` table doesn't match the password being entered
- **Root Cause**: Password was changed at some point after initial setup, or migrations ran in an unexpected order
- **Diagnosis**: Run `SELECT id, email, status, role FROM admin_users;` in Supabase SQL Editor to verify the user exists and is `active`
- **Fix**: Generate a new bcrypt hash and update the DB directly:
  ```bash
  # Generate hash locally:
  node -e "const b = require('bcryptjs'); b.hash('YourNewPassword', 12, (e, h) => console.log(h))"
  ```
  ```sql
  -- Update in Supabase SQL Editor:
  UPDATE admin_users SET password_hash = '<hash_from_above>' WHERE email = 'your-email@example.com';
  ```
- **Default Credentials** (from migration `005b_admin_tables.sql`): `admin@insurai.com` / `secure-password`
- **Note**: The `admin_users` table may lack `display_name`, `failed_login_attempts`, and `locked_until` columns if `005a_admin_schema.sql` ran instead of `005b_admin_tables.sql`. The login code only requires `id`, `email`, `password_hash`, `role`, `status`, and `permissions`.

### 174. Migration 040 NOT NULL Constraint Fix (Fixed Mar 16, 2026)
- **Problem**: Migration 040 failed with `null value in column "name" of relation "feature_flags" violates not-null constraint`
- **Root Cause**: `feature_flags` table (created in migration 012) has `name VARCHAR(200) NOT NULL`, but migration 040's INSERT omitted the `name` column
- **Solution**: Added `name` to INSERT column list and `'KASKO AI Extraction Pilot'` as the value
- **File Changed**: `supabase/migrations/040_kasko_pilot_flag_and_segment.sql`
- **Commit**: `71a5113`

### 175. KASKO Pilot 12-Section Operational Audit (Added Mar 16, 2026)
- **Feature**: Comprehensive evidence-structured audit report for KASKO pilot readiness
- **File**: `docs/KASKO_PILOT_OPERATIONAL_AUDIT_2026_03_16.md` (515 lines)
- **Sections**: Executive verdict, pass/fail table (9/9 pass at code level), feature-flag evidence, flow wiring audit, result-object proof (expected JSON), banner UI audit, QA logging audit, rollback trigger audit (4 thresholds), admission gate audit (5 checks), safety behavior (7 failure modes → safe-off), docs-vs-reality mismatches (6 items checked, 1 minor dead path), required fixes table, go/no-go recommendation (CONDITIONAL GO), SQL appendix for 3 manual actions
- **Verdict**: Code-level GO. Operationally blocked on 3 manual admin actions (apply migration, assign reviewers, enable flag)
- **Commit**: `2d3f540`

### 176. KASKO Reviewer-Mode Output Quality Hardening (Fixed Mar 19, 2026)
- **Scope**: 12 commits across this branch fixing KASKO reviewer-mode output from raw/unsafe AI output to production-quality reviewer-facing content
- **Key Fixes** (final 2 commits):
  1. **Text/Export Parity** (`b25d61d`): Text export and CSV export now use `formatCoverageLimit()` (same logic as UI), ensuring `isUnlimited`, `isMarketValue`, zero-limit-as-included, and `applySafeWording` all apply consistently. Added 5 shared formatting helpers: `formatPremiumForExport()`, `formatDeductibleForExport()`, `formatInsuredForExport()`, `formatCoverageItemLimit()`, `formatCoverageDeductible()`.
  2. **5-Issue Cleanup** (`6e12f51`): (a) Personalization leak filter (`isPersonalizationLeak()`), (b) malformed Turkish insight fix (broader `applySafeWording` patterns), (c) mapping warning rewritten to Turkish, (d) `generateStrengths()` output translated to Turkish, (e) `normalizeTurkishLegalEntityName()` for merged legal entity tokens.
- **Earlier commits in branch**: Safety hardening (missing value flags, deductible uncertainty, coverage limit sanitization), OCR vs real extraction labeling fix, TASLAK/DRAFT banner wiring, Supabase database linter fixes, pilot banner i18n
- **Tests Added**: 21 reviewer-insight-cleanup tests + 6 text-export-parity tests
- **Files Changed**: `policy-extractor.ts`, `display-interpreter.ts`, `PolicyDetailView.tsx`, `policy-extractor-validation.test.ts`

### 177. Reviewer-Mode Phase 2 — Benchmark Provenance, Canonical Summary Builder, Export Unification (Added Mar 20, 2026)
- **Feature**: 5 commits completing reviewer-mode Phase 2 with 3 major improvements
- **Benchmark Provenance Gating** (`fdd4720`):
  - Added `BenchmarkProvenance` interface (source, date, cohort) to `PolicyTypeMarketData` in `src/types/market-data.ts`
  - `generateRecommendationsAsync()` now reads `benchmark.provenance` — gate opens only when all 3 fields are non-empty strings
  - Static benchmarks intentionally omit provenance → gate stays closed by default
  - To enable benchmark claims: add a verified `provenance` object to the `MARKET_BENCHMARKS` entry
- **Conditional Deductible Classification** (`7d83b1c`):
  - New `classifyExclusions()` function separates percentage-based deductibles (muafiyet/tenzil/%N patterns) from true exclusions
  - New `conditionalDeductibles?: string[]` field on `AnalyzedPolicy` type
  - Two-layer deductible reporting when `deductibleUncertain` AND conditional deductibles detected
  - Evidence-softening via `softenReviewerInsight()` — transforms assertive Turkish phrasing to hedged reviewer-safe language
- **Canonical Summary Builder** (`684b11b`):
  - `src/lib/reviewer/policy-reviewer-summary.ts` — `buildPolicyReviewerSummary()` is single source of truth
  - All 8 inline formatting patterns in `export.ts` replaced with canonical function calls
  - Ensures CSV, Excel, PDF, and text export paths all apply identical governance rules (applySafeWording, coverage limit cascade, locale-aware names)
- **Tests**: 143 tests across 5 files (37 + 16 + 43 + 26 + 21), all passing
- **Files**: `src/lib/reviewer/policy-reviewer-summary.ts` (new), `src/types/market-data.ts`, `src/types/policy.ts`, `src/lib/ai/policy-extractor.ts`, `src/lib/export.ts`, `src/data/market-data/benchmarks.ts`
- **Commits**: `4c3ad6c`, `d4d5124`, `fdd4720`, `7d83b1c`, `684b11b`

---

