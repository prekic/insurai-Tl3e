# InsurAI Core Development Playbook

This playbook outlines essential rules, architecture decisions, and testing gotchas for developing within the InsurAI codebase.

---

## 1. Internationalization (i18n) Strategy

InsurAI utilizes a heavily optimized, asynchronous translation framework designed specifically to drop main bundle sizes beneath the 250kb threshold.

### Architecture & Pattern
To avoid serving heavy, unused translation dictionaries on initial page load, translations are code-split:
1. **`translations-skeleton.ts`**: The synchronous backbone loaded with the main bundle. This file contains **only identical empty string values** for every i18n key (`{ key: "" }`). It prevents `undefined` UI flashes but retains zero text payload.
2. **`translations-[lang].ts`**: The isolated asynchronous Vite chunks containing all language-specific text (e.g., Turkish or English).

**How to Add New Translations:**
You must strictly update **all three** related dictionaries:
1. Update `src/lib/i18n/translations-skeleton.ts` with an empty string.
2. Update `src/lib/i18n/translations-en.ts` with English content.
3. Update `src/lib/i18n/translations-tr.ts` with Turkish content.

*Failing to add to the skeleton breaks TS interfaces. Adding actual text to the skeleton bloats the initial bundle footprint.*

---

## 2. Testing Constraints & Gotchas

Our test suite (Vitest + Playwright) verifies over 15,000 assertions. Strict adherence to state isolation is required.

### A. Supabase Client Mocking & Cache Poisioning
Mocking `@supabase/supabase-js` broadly often leads to shared mock states bleeding between files. **Always clear the module cache** via Vitest's explicit reset hooks.

**Mandatory Pattern:**
```typescript
import { beforeEach, vi } from 'vitest';

const { mockSupabaseClient } = vi.hoisted(() => ({
  mockSupabaseClient: { from: vi.fn(), auth: { getUser: vi.fn() } }
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabaseClient)
}));

beforeEach(() => {
  // CRITICAL: Prevents inter-test state bleeding for Supabase connections
  vi.resetModules();
});
```

### B. Mocking `i18n-context` (Preventing the Empty String Flash Issue)
Because `SKELETON_TRANSLATIONS` are loaded synchronously (with empty strings) before dynamic chunks load, React component tests *will* fail to match localized text unless you explicitly mock the translation context correctly.

**Mandatory Pattern:**
```typescript
import { vi } from 'vitest';
import { EN_TRANSLATIONS } from '@/lib/i18n/translations-en';

vi.mock('@/lib/i18n/i18n-context', () => ({
  useTranslation: () => ({ t: EN_TRANSLATIONS, locale: 'en', isLoading: false }),
  useI18n: () => ({ t: EN_TRANSLATIONS, locale: 'en', isLoading: false }),
}));
```

### C. Backend Proxy Arguments `extractViaProxy`
The backend AI extraction proxying functions (`extractViaProxy`) require exactly four arguments. Passing fewer causes TS and upstream execution failures.
**Signature**: `extractViaProxy(text, provider, options, notifyUserId)`

When mocking or spying, ensure the 4th parameter (`notifyUserId`, which can be `undefined`) is present:
```typescript
expect(extractViaProxy).toHaveBeenCalledWith(
  'sample text',
  'openai',
  expect.any(Object),
  undefined // Critical 4th parameter
);
```
