# InsurAI Launch Checklist

> Pre-launch verification and testing guide
> Created: January 30, 2026

---

## 1. Anthropic Credits Top-Up (URGENT)

### Current Issue
The system is falling back to OpenAI because Anthropic credits are low/exhausted. This adds latency and increases costs.

### Steps to Top Up Anthropic Credits

1. **Log in to Anthropic Console**
   - Go to: https://console.anthropic.com
   - Sign in with your account credentials

2. **Navigate to Billing**
   - Click on your organization name (top right)
   - Select "Billing" from the dropdown
   - Or go directly to: https://console.anthropic.com/settings/billing

3. **Add Credits**
   - Click "Add credits" or "Top up"
   - Recommended initial amount: **$100-200**
   - This covers ~3,000-6,000 policy extractions

4. **Verify API Key**
   - Go to: https://console.anthropic.com/settings/keys
   - Confirm your API key is active
   - Copy the key if you need to update Railway

5. **Update Railway (if key changed)**
   ```bash
   # In Railway dashboard:
   # Settings → Variables → ANTHROPIC_API_KEY
   # Paste new key and save
   ```

6. **Verify on Production**
   ```bash
   # Check health endpoint
   curl https://insurai-production.up.railway.app/api/health

   # Should show:
   # "providers": { "anthropic": true, "openai": true, "google": true }
   ```

### Cost Estimation
| Usage Level | Extractions/Month | Anthropic Cost | OpenAI Fallback Cost |
|-------------|-------------------|----------------|---------------------|
| Light | 100 | ~$3 | ~$2 |
| Medium | 500 | ~$15 | ~$10 |
| Heavy | 2,000 | ~$60 | ~$40 |
| Enterprise | 10,000 | ~$300 | ~$200 |

**Note**: Anthropic (Claude) produces higher quality extractions for Turkish documents but costs ~50% more than OpenAI.

---

## 2. End-to-End User Flow Test Checklist

### Test Environment
- **URL**: https://insurai-production.up.railway.app
- **Browser**: Chrome (latest), Firefox (latest), Safari (latest)
- **Mobile**: iOS Safari, Android Chrome

### Pre-Test Setup
- [ ] Clear browser cache and cookies
- [ ] Disable ad blockers
- [ ] Have a test PDF policy file ready (kasko or traffic)
- [ ] Have valid email for signup

---

### Flow 1: Anonymous Free Trial

| Step | Action | Expected Result | Pass? |
|------|--------|-----------------|-------|
| 1.1 | Visit homepage | Landing page loads, upload widget visible | [ ] |
| 1.2 | Click upload widget | File picker opens | [ ] |
| 1.3 | Select PDF file (<10MB) | File accepted, redirects to /try | [ ] |
| 1.4 | Wait for analysis | Progress bar shows, updates every 10s | [ ] |
| 1.5 | View results | Policy details, score, coverages displayed | [ ] |
| 1.6 | Click "Share Results" | Share modal opens with URL | [ ] |
| 1.7 | Copy share URL | URL copied to clipboard | [ ] |
| 1.8 | Open share URL (incognito) | Shared results page loads | [ ] |
| 1.9 | Try second upload | Shows "trial used" message or prompts signup | [ ] |

**Timeout Test**:
- [ ] Upload large/complex PDF (15+ pages)
- [ ] Verify progress updates appear
- [ ] Verify 90-second timeout works (shows error message, not infinite loading)

---

### Flow 2: User Signup & Login

| Step | Action | Expected Result | Pass? |
|------|--------|-----------------|-------|
| 2.1 | Click "Sign Up" | Auth page loads | [ ] |
| 2.2 | Enter email + password | Form validates inputs | [ ] |
| 2.3 | Submit signup | Success message, redirect to dashboard | [ ] |
| 2.4 | Check email | Confirmation email received (if enabled) | [ ] |
| 2.5 | Log out | Redirects to landing page | [ ] |
| 2.6 | Log in | Dashboard loads with empty state | [ ] |
| 2.7 | Test "Forgot Password" | Reset email sent | [ ] |

---

### Flow 3: Authenticated Policy Upload

| Step | Action | Expected Result | Pass? |
|------|--------|-----------------|-------|
| 3.1 | Navigate to /upload | Upload page loads | [ ] |
| 3.2 | Drag-drop PDF | File preview shows | [ ] |
| 3.3 | Click "Analyze" | Progress indicator appears | [ ] |
| 3.4 | Wait for extraction | AI processes document | [ ] |
| 3.5 | View extracted data | Policy details form populated | [ ] |
| 3.6 | Edit fields (optional) | Fields editable | [ ] |
| 3.7 | Save policy | Success toast, redirects to dashboard | [ ] |
| 3.8 | Verify on dashboard | New policy card appears | [ ] |

---

### Flow 4: Policy Analysis & Chat

| Step | Action | Expected Result | Pass? |
|------|--------|-----------------|-------|
| 4.1 | Click policy card | Detail view opens | [ ] |
| 4.2 | View score breakdown | Grade (A-F) and breakdown visible | [ ] |
| 4.3 | View coverages | Coverage list with limits | [ ] |
| 4.4 | View gaps | Gap warnings if any | [ ] |
| 4.5 | View recommendations | Actionable recommendations | [ ] |
| 4.6 | Navigate to /chat | Chat page loads | [ ] |
| 4.7 | Select policy | Policy context loaded | [ ] |
| 4.8 | Ask question | AI response within 10s | [ ] |
| 4.9 | Follow-up question | Maintains context | [ ] |

---

### Flow 5: Policy Comparison

| Step | Action | Expected Result | Pass? |
|------|--------|-----------------|-------|
| 5.1 | Upload second policy | Now have 2+ policies | [ ] |
| 5.2 | Navigate to /compare | Comparison page loads | [ ] |
| 5.3 | Select 2 policies | Both appear in comparison view | [ ] |
| 5.4 | View differences | Side-by-side comparison | [ ] |
| 5.5 | View coverage diff | Highlights missing coverages | [ ] |

---

### Flow 6: Duplicate Detection

| Step | Action | Expected Result | Pass? |
|------|--------|-----------------|-------|
| 6.1 | Upload same policy again | Duplicate detected | [ ] |
| 6.2 | View conflict dialog | Options: Skip, Replace, Keep Both, Amendment | [ ] |
| 6.3 | Choose "Keep Both" | Both versions saved | [ ] |
| 6.4 | Upload with minor change | Amendment option available | [ ] |

---

### Flow 7: Mobile Responsiveness

| Step | Action | Expected Result | Pass? |
|------|--------|-----------------|-------|
| 7.1 | Open on mobile (375px) | Layout adapts, no horizontal scroll | [ ] |
| 7.2 | Navigation menu | Hamburger menu works | [ ] |
| 7.3 | Upload on mobile | Touch-friendly file picker | [ ] |
| 7.4 | Policy detail view | Collapsible sections work | [ ] |
| 7.5 | Chat on mobile | Keyboard doesn't break layout | [ ] |

---

### Flow 8: Error Handling

| Step | Action | Expected Result | Pass? |
|------|--------|-----------------|-------|
| 8.1 | Upload invalid file (txt) | Clear error message | [ ] |
| 8.2 | Upload huge file (>50MB) | Size limit error | [ ] |
| 8.3 | Upload empty PDF | Appropriate error | [ ] |
| 8.4 | Disconnect network during upload | Error with retry option | [ ] |
| 8.5 | Access /dashboard without login | Redirects to /auth | [ ] |
| 8.6 | Access invalid route | 404 page shows | [ ] |

---

### Flow 9: Performance

| Metric | Target | Actual | Pass? |
|--------|--------|--------|-------|
| Landing page FCP | < 2s | ___s | [ ] |
| Landing page LCP | < 2.5s | ___s | [ ] |
| Time to interactive | < 3s | ___s | [ ] |
| Policy extraction | < 90s | ___s | [ ] |
| Chat response | < 10s | ___s | [ ] |
| Dashboard load | < 1s | ___s | [ ] |

**How to measure**:
1. Open Chrome DevTools → Lighthouse
2. Run "Performance" audit
3. Record metrics above

---

### Flow 10: Admin Panel

| Step | Action | Expected Result | Pass? |
|------|--------|-----------------|-------|
| 10.1 | Navigate to /admin/login | Admin login page | [ ] |
| 10.2 | Login with admin creds | Dashboard loads | [ ] |
| 10.3 | View Overview tab | Stats display | [ ] |
| 10.4 | View Users tab | User list loads | [ ] |
| 10.5 | View Prompts tab | 16 prompts listed | [ ] |
| 10.6 | Edit a prompt | Changes saved | [ ] |
| 10.7 | View Audit Log | Actions logged | [ ] |
| 10.8 | Logout | Returns to login | [ ] |

---

## 3. Production Environment Verification

### Environment Variables Check

```bash
# These should all be set in Railway:
curl https://insurai-production.up.railway.app/api/admin/diagnostics
```

Expected response:
```json
{
  "success": true,
  "status": "configured",
  "config": {
    "hasJwtSecret": true,
    "hasSupabaseUrl": true,
    "hasServiceKey": true,
    "supabaseClientInitialized": true
  }
}
```

### Health Check

```bash
curl https://insurai-production.up.railway.app/api/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2026-01-30T...",
  "providers": {
    "openai": true,
    "anthropic": true,  // Should be true after top-up
    "google": true
  }
}
```

### Database Verification

- [ ] Supabase dashboard accessible
- [ ] Tables exist: users, policies, policy_documents, admin_users, prompt_templates
- [ ] RLS policies enabled
- [ ] Storage bucket configured

---

## 4. Final Go/No-Go Checklist

### Must Have (Blockers)
- [ ] All critical user flows pass
- [ ] Health check returns healthy
- [ ] Anthropic credits topped up
- [ ] No console errors on key pages
- [ ] Mobile responsive works

### Should Have (Launch Day Fixes)
- [ ] All secondary flows pass
- [ ] Performance targets met
- [ ] Admin panel functional
- [ ] Email notifications work (if configured)

### Nice to Have (Post-Launch)
- [ ] Perfect Lighthouse scores
- [ ] All edge cases handled
- [ ] Analytics configured
- [ ] Social sharing tested

---

## 5. Launch Day Procedure

### T-1 Hour
1. Run full E2E test suite
2. Verify all environment variables
3. Check Anthropic/OpenAI credit levels
4. Clear CDN cache (if applicable)

### T-0 (Launch)
1. Merge final PR to main
2. Monitor GitHub Actions deployment
3. Run health check
4. Test critical flow (upload → analysis)
5. Announce launch

### T+1 Hour
1. Monitor Sentry for errors
2. Check Railway metrics
3. Review first user uploads (admin panel)
4. Be ready to rollback if needed

---

## 6. Rollback Procedure

If critical issues are found post-launch:

1. **Immediate**: Revert to previous Railway deployment
   ```bash
   # In Railway dashboard: Deployments → Previous → Redeploy
   ```

2. **Git Revert** (if code issue):
   ```bash
   git revert HEAD
   git push origin main
   ```

3. **Database Rollback** (if schema issue):
   - Restore from Supabase backup
   - Or run migration rollback script

4. **Communication**:
   - Update status page (if exists)
   - Notify users via email (if configured)

---

*Document owner: Erdem*
*Last updated: January 30, 2026*
