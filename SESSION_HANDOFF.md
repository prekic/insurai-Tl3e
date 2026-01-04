# Session Handoff - January 4, 2026

## Current Status

**Branch**: `claude/build-app-from-design-GBWjx`

### What's Working
- Full-stack app running (Frontend:5173, Backend:4001)
- AI providers configured (OpenAI, Anthropic, Google)
- Supabase auth and database connected
- PDF upload and text extraction functional
- Sentry error monitoring configured
- Test coverage at 80%+
- GitHub Codespaces compatible

### Recent Changes (This Session)
1. **Sign out button fixed** - Added toast feedback, shows "Sign In" for guests
2. **Guest display** - Shows "Guest" + "Not signed in" when not authenticated
3. **dev:sync script** - One command to pull, install, and run
4. **CLAUDE.md updated** - Comprehensive project documentation

---

## Unfinished Tasks / Known Bugs

### 1. PDF Extraction Failing in Codespaces
- **Symptom**: "Failed to extract policy data" on upload
- **Likely Cause**: API keys in .env may not be valid or backend isn't receiving them
- **Debug**: Check server terminal for detailed error after upload
- **Files**: `server/index.ts`, `src/lib/ai/policy-extractor.ts`

### 2. Cached Auth Session
- **Symptom**: User appears logged in when they shouldn't be
- **Fix**: Run `localStorage.clear(); location.reload();` in browser console
- **Root Cause**: Supabase persists session in localStorage

### 3. Performance (Web Vitals)
- **FCP/LCP showing as "poor"** (4-5 seconds)
- **Cause**: Large bundle, CDN dependencies
- **Next Step**: Bundle analysis, code splitting

---

## Next Logical Steps

### Immediate (High Priority)
1. **Debug PDF extraction in Codespaces** - Check server logs for actual error
2. **Verify API keys are valid** - Test each provider individually
3. **Add extraction error details to UI** - Show specific error message, not just "Failed"

### Short Term
1. **Protected routes** - Require auth for /dashboard, /upload
2. **Policy storage** - Save extracted policies to Supabase
3. **Error boundary** - Catch and display React errors gracefully

### Medium Term
1. **Bundle optimization** - Code splitting for routes
2. **Offline support** - Service worker for cached policies
3. **Export feature** - Download analysis as PDF/Excel

---

## Environment Setup Quick Reference

```bash
# Codespaces or Local
git checkout claude/build-app-from-design-GBWjx
npm install

# Create .env with:
VITE_SUPABASE_URL=https://exykhfulkbwzatpesruv.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_API_PROXY_URL=http://localhost:4001
API_PORT=4001
OPENAI_API_KEY=sk-proj-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_CLOUD_API_KEY=AIza...

# Run
npm run dev:all
```

---

## Key Contacts / Resources

- **Owner**: Erdem
- **Repo**: github.com/prekic/insurai
- **Supabase Project**: exykhfulkbwzatpesruv
- **Sentry**: o4510132617216000 (DE region)

---

## Files Changed This Session

| File | Change |
|------|--------|
| `src/components/GlobalNavigation.tsx` | Sign out fix, guest display |
| `package.json` | Added dev:sync script |
| `CLAUDE.md` | Complete rewrite with current state |
| `SESSION_HANDOFF.md` | Created (this file) |
