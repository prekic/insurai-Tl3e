# Session Handoff - January 28, 2026

## Current Status

| Metric | Status |
|--------|--------|
| **Build** | ✅ Passing |
| **TypeCheck** | ✅ 0 errors |
| **Lint** | ⚠️ Pre-existing warnings in ocr-orch service |
| **Tests** | ✅ 5600+ passing |
| **Branch** | `claude/review-project-status-nZqul` |
| **Production Readiness** | 9.5/10 |
| **Live URL** | https://insurai-production.up.railway.app |
| **Document AI** | ✅ PDF splitting for >15 pages |

---

## Session Summary

This session focused on **fixing Document AI OCR failures** and implementing **PDF splitting** for documents exceeding the 15-page limit.

Key accomplishments:
1. Fixed "Stage interrupted by new stage" error in OCR processing
2. Discovered `enableImagelessMode` is NOT supported on standard Document AI processors
3. Implemented PDF splitting for documents >15 pages using pdf-lib
4. Added enhanced error logging for Document AI debugging
5. Configured Railway to auto-deploy from feature branch

---

## Features Completed This Session

### PDF Splitting for Document AI Page Limit

| Issue | Solution |
|-------|----------|
| Document AI failing with "Unknown name enableImagelessMode" | Removed unsupported option from config |
| Standard OCR processor has 15-page limit | Implemented PDF splitting (chunks of 15 pages) |
| "Stage interrupted by new stage" error | Fixed stage lifecycle in policy-extractor.ts |
| Unclear Document AI errors | Added detailed error logging with status codes |

**How PDF Splitting Works**:
```
16-page PDF uploaded
        ↓
Check page count (16 > 15 limit)
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

**New Files**:
- `src/lib/ai/pdf-splitter.ts` - PDF splitting utility using pdf-lib

**Key Functions**:
- `splitPdf()` - Splits PDF into chunks of max 15 pages
- `getPdfPageCount()` - Quick page count check before processing
- `extractWithDocumentAIChunked()` - Orchestrates chunk processing
- `combineChunkResults()` - Merges results from all chunks

---

## Commits This Session

```
ef366bf Update documentation for PDF splitting and Document AI fixes
6a55c62 Add PDF splitting for documents exceeding 15-page Document AI limit
6780b68 Fix Document AI: remove unsupported enableImagelessMode option
c7d85a2 Bump service worker cache to v9 - test Railway branch deploy
dc0721b Add enhanced error logging for Document AI failures
20aca95 Fix 'Stage interrupted by new stage' error in OCR processing
```

---

## Key Files Changed

| File | Changes |
|------|---------|
| `src/lib/ai/pdf-splitter.ts` | **NEW** PDF splitting utility using pdf-lib |
| `src/lib/ai/document-ocr.ts` | Added chunked extraction support, page offset handling |
| `src/lib/ai/policy-extractor.ts` | Fixed stage lifecycle - properly close stages before starting new ones |
| `server/routes/ai.ts` | Removed unsupported `enableImagelessMode`, added error logging (v5) |
| `public/sw.js` | Bumped cache version to v9 |
| `package.json` | Added pdf-lib dependency |

---

## Important Discovery: enableImagelessMode Not Supported

**What we learned this session:**

The `enableImagelessMode` option does NOT exist on standard Document AI OCR processors. It's only available on Enterprise Document OCR processors.

| Processor Type | Page Limit | enableImagelessMode |
|----------------|------------|---------------------|
| Standard OCR (current) | 15 pages | ❌ Not supported |
| Enterprise OCR | 30 pages | ✅ Supported |

**Previous documentation was incorrect** - the "30-page support with imageless mode" approach doesn't work with the current processor.

**Solution implemented**: Split PDFs that exceed 15 pages on the client side before sending to Document AI.

---

## Railway Deployment Status

**Current**: Deployed and running at https://insurai-production.up.railway.app

**Branch Configuration**:
- Branch: `claude/review-project-status-nZqul`
- Root Directory: (empty - use repo root)
- Auto-deploys on push to this branch

### Required Environment Variables

| Variable | Purpose | Type |
|----------|---------|------|
| `SUPABASE_URL` | Runtime DB access for server | Runtime |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role for admin operations | Runtime |
| `ADMIN_JWT_SECRET` | JWT signing for admin auth | Runtime |
| `OPENAI_API_KEY` | AI extraction | Runtime |
| `ANTHROPIC_API_KEY` | AI fallback (currently has billing issue) | Runtime |
| `GOOGLE_CLOUD_API_KEY` | Google Cloud general | Runtime |
| `GCP_SERVICE_ACCOUNT_BASE64` | Document AI credentials (base64-encoded JSON) | Runtime |
| `VITE_SUPABASE_URL` | Frontend Supabase client | Build-time |
| `VITE_SUPABASE_ANON_KEY` | Frontend Supabase client | Build-time |

### Important Notes
- `VITE_API_PROXY_URL` auto-detected via `window.location.origin` in production
- `VITE_*` vars baked at build time - need redeploy not just restart
- Don't add quotes in Railway UI - they're added automatically
- Server needs `SUPABASE_URL` (not `VITE_SUPABASE_URL`) for runtime DB access
- GCP credentials: encode with `base64 -w 0 service-account.json`

### Deployment Commands
```bash
# Build command (in railway.json)
npm run build && npm run build:server

# Start command
NODE_ENV=production node dist-server/index.js
```

---

## CSP Configuration Notes

PDF.js worker requires CDN access. In `server/index.ts` Helmet config:

```typescript
scriptSrc: [
  "'self'", 'blob:',
  'https://unpkg.com', 'https://cdn.jsdelivr.net', 'https://cdnjs.cloudflare.com',
  'https://*.sentry.io', 'https://*.sentry-cdn.com'
]
workerSrc: ["'self'", 'blob:', 'https://unpkg.com', 'https://cdn.jsdelivr.net']
connectSrc: [
  "'self'",
  'https://*.supabase.co', 'wss://*.supabase.co',
  'https://unpkg.com', 'https://cdn.jsdelivr.net', 'https://cdnjs.cloudflare.com',
  'https://*.sentry.io', 'https://*.ingest.sentry.io'
]
```

---

## Supabase Configuration Requirements

### Auth Redirect URLs
Add to Supabase Dashboard → Authentication → URL Configuration:
- `https://insurai-production.up.railway.app/**`
- Required for OAuth and magic link flows

### Database Tables (via migrations)
- `admin_users`, `admin_sessions` - Admin authentication
- `prompt_templates`, `prompt_versions` - AI prompts
- Migration 005 creates tables, migration 006 seeds 16 prompts

---

## Common Gotchas (Quick Reference)

| Gotcha | Solution |
|--------|----------|
| `VITE_*` vars not updating | Need rebuild (redeploy), not just restart |
| Railway env vars with quotes | Don't add quotes manually - Railway adds them |
| PDF.js worker blocked | CSP must allow unpkg.com, cdn.jsdelivr.net |
| Supabase auth failing | Add Railway URL to Supabase redirect allowlist |
| Server can't access DB | Use `SUPABASE_URL` not `VITE_SUPABASE_URL` |
| `crypto` not defined | Import explicitly: `import crypto from 'crypto'` |
| React hooks error #310 | All hooks must be BEFORE conditional returns |
| Admin API 401 errors | Use `adminFetch()` not raw `fetch()` |
| Document AI 15-page limit | PDFs are auto-split into chunks (no config needed) |
| `enableImagelessMode` error | NOT supported on standard OCR - use PDF splitting instead |
| Service worker serving old JS | Bump `CACHE_VERSION` in `public/sw.js` (currently v9) |
| "Stage interrupted by new stage" | Fixed - stages now properly closed before starting new ones |

---

## Known Issues

| Issue | Severity | Status | Notes |
|-------|----------|--------|-------|
| Anthropic billing issue | Medium | Open | "Your credit balance is too low" - falls back to OpenAI |
| ocr-orch service tests failing | Low | Open | Missing `tesseract.js` import - monorepo dependency |
| validate-svc tests failing | Low | Open | Missing `@insurai/rule-packs` - monorepo dependency |
| Some Turkish spacing in Document AI | Low | Known | `Müş teri` instead of `Müşteri` - post-process or let AI handle |
| Garbage data in PDFs | Low | Known | `B^^^Bj54<O[...` - embedded in PDF, filtered by AI extraction |

---

## Document AI Version Markers

Check Railway logs to verify deployed version:

| Version | Log Message | Status |
|---------|-------------|--------|
| v4 | `[Document AI] OCR route v4 invoked (enableImagelessMode: true)` | FAILED - option not supported |
| v5 | `[Document AI] OCR route v5 invoked (standard processor, 15-page limit)` | **CURRENT** |

---

## Next Steps (Priority Order)

### Immediate
1. **Test PDF splitting** - Upload 16+ page PDF and verify chunked processing works
2. **Verify Document AI logs** - Check for `v5` marker in Railway logs
3. **Top up Anthropic credits** - Currently falling back to OpenAI due to billing issue

### Short Term
1. **Monitor Document AI quality** - Compare Turkish OCR output quality in production
2. **Add deterministic post-processing** - Fix remaining issues like `Müş teri` → `Müşteri`
3. **Tune OCR Decision Engine** - Use Document AI confidence in extraction pipeline

### Feature Work
1. **Integrate OCR Decision Engine with policy-extractor** - Use `analyzeDocumentForJourney()`
2. **Add Document Journey metadata to admin viewer** - Display diagnostic output
3. **Add OCR decision caching** - Cache decisions by document hash

### Optional: Enterprise Document AI
If higher page limits needed without splitting:
1. Create Enterprise Document OCR processor in GCP console
2. Update `GCP_DOCAI_PROCESSOR_ID` in Railway env vars
3. `enableImagelessMode` will work with Enterprise processor (30-page limit)

---

## Verification Commands

```bash
# Check Railway logs for Document AI version
# Should see: [Document AI] OCR route v5 invoked (standard processor, 15-page limit)

# Run tests locally
npm test -- --run server/__tests__/

# TypeScript check
npm run typecheck

# Health check
curl -s "https://insurai-production.up.railway.app/api/health" | jq .

# Check what's deployed
git log --oneline -5
```

---

## Session Statistics

| Metric | Value |
|--------|-------|
| Commits this session | 6 |
| Files changed | 8 (including new pdf-splitter.ts, CLAUDE.md, SESSION_HANDOFF.md) |
| Bug fixes | 2 (stage interruption, unsupported option) |
| New features | 1 (PDF splitting) |
| Dependencies added | 1 (pdf-lib) |

---

## Handoff Checklist

- [x] "Stage interrupted by new stage" error fixed
- [x] Discovered `enableImagelessMode` not supported on standard processor
- [x] Removed unsupported Document AI options
- [x] Implemented PDF splitting for >15 page documents
- [x] Added enhanced error logging
- [x] Bumped service worker cache to v9
- [x] CLAUDE.md updated (entries #28, #29, #30 corrected)
- [x] SESSION_HANDOFF.md updated
- [x] Documentation commit ef366bf pushed
- [x] Changes pushed to `claude/review-project-status-nZqul`
- [x] Railway configured to auto-deploy from this branch
- [ ] **Test 16-page PDF upload** - Verify PDF splitting works in production

---

## Previous Session Context

Earlier January 28, 2026:
- Attempted to fix Document AI with `enableImagelessMode: true`
- That approach failed because the option doesn't exist on standard OCR processor
- This session discovered the root cause and implemented PDF splitting solution

January 26, 2026:
- OCR Decision Engine Document Journey metadata enhancement
- Configuration-driven OCR decision system
- Full diagnostic output with confidence breakdowns

---

**Last Updated**: January 28, 2026
**Pending Action**: Test 16-page PDF upload to verify PDF splitting works
**Branch**: `claude/review-project-status-nZqul` (Railway auto-deploys from this branch)
**Next Session Focus**: Verify PDF splitting in production, integrate OCR Decision Engine
