# InsurAI Business Model Recommendation

> Decision document for monetization strategy
> Created: January 30, 2026

---

## Executive Summary

**Recommended Model**: Freemium with usage-based pricing

**Why**: Balances user acquisition (free tier attracts users) with sustainable revenue (power users pay). Fits the Turkish market where price sensitivity is high but professionals will pay for productivity tools.

---

## Option Analysis

### Option 1: Free Forever (Lead Generation)
**Model**: Fully free, monetize via partnerships/referrals

| Pros | Cons |
|------|------|
| Maximum user adoption | No direct revenue |
| Low barrier to entry | Dependent on partnerships |
| Good for market validation | Unsustainable long-term |

**Revenue potential**: $0 direct, potential affiliate revenue from insurance providers

**Verdict**: Not recommended for sustainable business

---

### Option 2: Freemium (RECOMMENDED)
**Model**: Free tier with paid upgrades

#### Proposed Tier Structure

| Feature | Free | Pro ($29/mo) | Business ($99/mo) |
|---------|------|--------------|-------------------|
| Policies analyzed/month | 3 | 50 | Unlimited |
| Policy storage | 5 | 100 | Unlimited |
| AI chat questions/month | 10 | 200 | Unlimited |
| Gap analysis | Basic | Full | Full + Benchmarks |
| PDF export | - | Yes | Yes + Branded |
| API access | - | - | Yes |
| Team members | 1 | 1 | 10 |
| Support | Community | Email | Priority |
| Data retention | 30 days | 1 year | Unlimited |

#### Revenue Projections (Year 1)

| Metric | Conservative | Moderate | Optimistic |
|--------|-------------|----------|------------|
| Free users | 5,000 | 15,000 | 30,000 |
| Pro conversion | 2% | 3% | 5% |
| Business conversion | 0.5% | 1% | 2% |
| Pro subscribers | 100 | 450 | 1,500 |
| Business subscribers | 25 | 150 | 600 |
| **Monthly Revenue** | $5,375 | $28,000 | $103,000 |
| **Annual Revenue** | $64,500 | $336,000 | $1,236,000 |

**Verdict**: Best balance of growth and revenue. Recommended.

---

### Option 3: Enterprise Only
**Model**: B2B sales to brokers, insurers, corporates

| Pros | Cons |
|------|------|
| High ARPU ($500-2000/mo) | Long sales cycles |
| Sticky customers | Requires sales team |
| Feature requests drive roadmap | Slow initial growth |

**Target customers**:
- Insurance brokers (200+ in Turkey)
- Corporate risk managers
- Insurance companies (internal use)

**Verdict**: Good long-term strategy, but requires sales investment. Consider after freemium validation.

---

### Option 4: Pay-Per-Use
**Model**: Credits/tokens for each analysis

| Pros | Cons |
|------|------|
| Direct cost alignment | Unpredictable revenue |
| Low commitment | Users may churn |
| Fair pricing | Complex to explain |

**Pricing example**:
- $0.50 per policy analysis
- $0.10 per AI chat question
- $1.00 per PDF export

**Verdict**: Consider as add-on to freemium, not primary model.

---

## Recommended Implementation Plan

### Phase 1: Soft Launch (Now - February 2026)
- Launch with **free tier only**
- Gather usage data and feedback
- No payment integration yet
- Goal: 500 active users

### Phase 2: Monetization (March 2026)
- Add **Stripe integration**
- Launch **Pro tier** at $29/mo
- Implement usage limits for free tier
- Goal: 50 paying customers

### Phase 3: Expansion (Q2 2026)
- Add **Business tier** at $99/mo
- Team/organization features
- API access for integrations
- Goal: $10K MRR

### Phase 4: Enterprise (Q3 2026)
- Custom pricing for large accounts
- SSO/SAML integration
- Dedicated support
- Goal: 5 enterprise contracts

---

## Cost Analysis

### Current Monthly Costs
| Service | Cost | Notes |
|---------|------|-------|
| Railway (hosting) | $20-50 | Scales with traffic |
| Supabase (database) | $25 | Pro tier |
| OpenAI API | $50-200 | ~$0.02 per extraction |
| Anthropic API | $50-200 | ~$0.03 per extraction |
| Google Cloud (OCR) | $20-50 | ~$1.50/1000 pages |
| Sentry | $0 | Free tier |
| **Total** | **$165-525** | Before revenue |

### Break-Even Analysis
- **Freemium break-even**: 18 Pro subscribers ($522/mo)
- **Target margin**: 70% (industry standard for SaaS)
- **At 100 Pro + 25 Business**: $5,375 revenue, ~$400 cost = 93% margin

### Cost Per User
| User Type | Avg. Cost/Month | Lifetime Value |
|-----------|----------------|----------------|
| Free | $0.10 | $0 (lead value) |
| Pro | $0.50 | $261 (9-mo avg) |
| Business | $2.00 | $891 (9-mo avg) |

---

## Turkish Market Considerations

### Pricing Sensitivity
- Turkey inflation ~40% (2025)
- Consider TRY pricing option: 899 TL/mo for Pro
- Offer annual discounts (20% off)

### Local Payment Methods
- Credit cards (Visa, Mastercard)
- BKM Express (local)
- Bank transfer for enterprise
- Consider iyzico for Turkish payments

### Competitive Landscape
| Competitor | Pricing | Gap |
|------------|---------|-----|
| Manual (spreadsheets) | Free | Time-consuming |
| Generic PDF tools | $10-30/mo | No insurance knowledge |
| Enterprise solutions | $500+/mo | Overkill for individuals |
| **InsurAI** | $29/mo | Sweet spot |

---

## Implementation Checklist

### Stripe Integration
- [ ] Create Stripe account
- [ ] Add Stripe SDK to frontend
- [ ] Create subscription plans in Stripe
- [ ] Build checkout flow
- [ ] Add webhook handlers for subscription events
- [ ] Build customer portal for billing management
- [ ] Add invoice generation
- [ ] Test subscription lifecycle (create, upgrade, cancel)

### Feature Gating
- [ ] Add `subscription_tier` to user profile
- [ ] Create `useSubscription` hook
- [ ] Gate features based on tier
- [ ] Add upgrade prompts at limits
- [ ] Implement soft limits (warnings before cutoff)

### Usage Tracking
- [ ] Track policies analyzed per month
- [ ] Track AI chat messages per month
- [ ] Track storage usage
- [ ] Build usage dashboard in account settings
- [ ] Add usage alerts (80%, 100% of limit)

---

## Decision Required

**Please choose your preferred model**:

1. [ ] **Free Forever** - Launch now, monetize later via partnerships
2. [x] **Freemium** (Recommended) - Free tier + paid upgrades
3. [ ] **Enterprise Only** - Focus on B2B sales
4. [ ] **Pay-Per-Use** - Credit-based system

**Selected tier pricing** (if Freemium):
- Free: 3 policies/month
- Pro: $29/month (or 899 TL)
- Business: $99/month (or 2,999 TL)

---

## Next Steps

1. **Confirm business model selection**
2. **Set up Stripe account** (requires business registration)
3. **Design upgrade flow UI**
4. **Implement subscription management**
5. **Add usage tracking**
6. **Test payment flows**
7. **Launch paid tiers**

---

*Document owner: Erdem*
*Last updated: January 30, 2026*
