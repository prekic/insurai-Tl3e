# Configuration System Implementation Plan

> Making InsurAI's hardcoded values configurable through Admin UI and user preferences

**Document Version**: 1.0
**Created**: February 4, 2026
**Author**: Claude Code Analysis
**Status**: Draft - Awaiting Review

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current State Analysis](#current-state-analysis)
3. [Target Architecture](#target-architecture)
4. [Implementation Phases](#implementation-phases)
5. [Database Schema Design](#database-schema-design)
6. [API Design](#api-design)
7. [Admin UI Components](#admin-ui-components)
8. [Migration Strategy](#migration-strategy)
9. [Testing Strategy](#testing-strategy)
10. [Rollback Plan](#rollback-plan)
11. [Success Metrics](#success-metrics)
12. [Appendix: Full Hardcoded Values Inventory](#appendix-full-hardcoded-values-inventory)

---

## Executive Summary

### Problem Statement

InsurAI currently has **843 hardcoded values** spread across the codebase, including:
- AI model configurations (models, temperatures, timeouts)
- Policy evaluation weights and grade thresholds
- OCR decision thresholds
- Rate limiting settings
- Market benchmark data
- Regional risk factors

**Impact**: Admins cannot tune the system without code deployments. Users cannot personalize their experience. Market data becomes stale without manual code updates.

### Proposed Solution

Implement a three-tier configuration system:

| Tier | Scope | Managed By | Storage |
|------|-------|------------|---------|
| **System Defaults** | Fallback values | Developers | Code constants |
| **Admin Settings** | Organization-wide | Admin users | Database |
| **User Preferences** | Per-user | End users | Database |

### Expected Outcomes

- ✅ Admins can tune AI, evaluation, and rate limit settings via UI
- ✅ Market data can be updated without code deployments
- ✅ Users can customize their dashboard and notification preferences
- ✅ A/B testing becomes possible for scoring algorithms
- ✅ Audit trail for all configuration changes

---

## Current State Analysis

### Configuration Distribution

```
┌─────────────────────────────────────────────────────────────────┐
│                    CURRENT STATE (843 values)                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────┐     ┌──────────────────┐                  │
│  │   TypeScript     │     │   JSON Config    │                  │
│  │   Constants      │     │   Files          │                  │
│  │   (728 values)   │     │   (115 values)   │                  │
│  └────────┬─────────┘     └────────┬─────────┘                  │
│           │                        │                             │
│           ▼                        ▼                             │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              Runtime Application                         │    │
│  │  • Values baked into JS bundle                          │    │
│  │  • Requires rebuild + redeploy to change                │    │
│  │  • No audit trail                                       │    │
│  │  • No per-user customization                            │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Pain Points

| Issue | Impact | Frequency |
|-------|--------|-----------|
| Can't change AI model without deploy | High | Monthly |
| Evaluation weights need tuning | High | Quarterly |
| Market data becomes stale | High | Annually |
| Rate limits too restrictive/permissive | Medium | As needed |
| Users want different preferences | Medium | Daily requests |
| No audit trail for changes | Medium | Compliance risk |

### Files with Most Hardcoded Values

| File | Count | Category |
|------|-------|----------|
| `src/lib/policy-evaluation/evaluator.ts` | 95 | Evaluation thresholds |
| `src/data/coverage-limits.ts` | 120 | Regulatory limits |
| `src/data/market-data/benchmarks.ts` | 180 | Market data |
| `src/lib/policy-utils.ts` | 45 | Fuzzy matching |
| `src/lib/ai/config.ts` | 25 | AI settings |
| `server/middleware/rate-limit.ts` | 15 | Rate limits |
| `config/ocr_settings.json` | 85 | OCR thresholds |

---

## Target Architecture

### Three-Tier Configuration System

```
┌─────────────────────────────────────────────────────────────────┐
│                    TARGET STATE                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    TIER 1: System Defaults               │    │
│  │  • Hardcoded in code (DEFAULT_* constants)              │    │
│  │  • Used when no override exists                         │    │
│  │  • Version controlled                                   │    │
│  └─────────────────────────────────────────────────────────┘    │
│                           │                                      │
│                           ▼                                      │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    TIER 2: Admin Settings                │    │
│  │  • Stored in `app_settings` table                       │    │
│  │  • Managed via Admin Dashboard                          │    │
│  │  • Overrides system defaults                            │    │
│  │  • Audit logged                                         │    │
│  └─────────────────────────────────────────────────────────┘    │
│                           │                                      │
│                           ▼                                      │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    TIER 3: User Preferences              │    │
│  │  • Stored in `user_preferences` table                   │    │
│  │  • Managed via user Settings page                       │    │
│  │  • Overrides admin settings (where allowed)             │    │
│  │  • Per-user customization                               │    │
│  └─────────────────────────────────────────────────────────┘    │
│                           │                                      │
│                           ▼                                      │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                Configuration Service                     │    │
│  │  • getConfig(key, userId?) → resolves tier hierarchy    │    │
│  │  • Caches frequently accessed settings                  │    │
│  │  • Validates against schema                             │    │
│  │  • Emits change events                                  │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Configuration Categories

| Category | Admin Configurable | User Configurable | Examples |
|----------|-------------------|-------------------|----------|
| `ai` | ✅ Yes | ❌ No | Models, temperatures, timeouts |
| `evaluation` | ✅ Yes | ⚠️ View only | Weights, grade thresholds |
| `ocr` | ✅ Yes | ❌ No | Confidence thresholds, providers |
| `rate_limits` | ✅ Yes | ❌ No | Requests per hour/day |
| `market_data` | ✅ Yes | ❌ No | Benchmarks, providers, regions |
| `email` | ✅ Yes | ✅ Yes | Templates (admin), frequency (user) |
| `ui` | ⚠️ Defaults only | ✅ Yes | Theme, language, items per page |
| `notifications` | ✅ Yes | ✅ Yes | Channels, thresholds |

---

## Implementation Phases

### Phase Overview

```
┌────────────────────────────────────────────────────────────────────────────┐
│                         IMPLEMENTATION TIMELINE                             │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Phase 1          Phase 2          Phase 3          Phase 4                │
│  Foundation       Core Settings    Market Data      User Prefs             │
│  ─────────        ────────────     ───────────      ──────────             │
│  Week 1-2         Week 3-4         Week 5-6         Week 7-8               │
│                                                                             │
│  • Database       • AI Settings    • Benchmark      • User prefs           │
│  • API scaffold   • Evaluation     • Provider       • Dashboard            │
│  • Config svc     • Rate Limits    • Regional       • Notifications        │
│  • Admin tab      • OCR Settings   • Import/Export  • A/B testing          │
│                                                                             │
│  ════════════════════════════════════════════════════════════════════════  │
│                                                                             │
│  Deliverables:    Deliverables:    Deliverables:    Deliverables:          │
│  • Migration      • 4 Admin tabs   • Data editor    • Settings page        │
│  • Settings API   • Live preview   • Version ctrl   • Preference API       │
│  • Audit logging  • Validation     • Audit trail    • Sync service         │
│                                                                             │
└────────────────────────────────────────────────────────────────────────────┘
```

---

### Phase 1: Foundation (Week 1-2)

#### Goals
- Create database schema for configuration storage
- Build configuration service with caching
- Set up audit logging for changes
- Create base Admin Settings UI scaffold

#### Tasks

| ID | Task | Est. Hours | Dependencies |
|----|------|------------|--------------|
| 1.1 | Create `app_settings` migration | 4h | None |
| 1.2 | Create `settings_audit_log` migration | 2h | 1.1 |
| 1.3 | Create `user_preferences` migration | 3h | 1.1 |
| 1.4 | Build `ConfigurationService` class | 8h | 1.1-1.3 |
| 1.5 | Add caching layer (5-min TTL) | 4h | 1.4 |
| 1.6 | Create `/api/admin/settings` routes | 6h | 1.4 |
| 1.7 | Add Zod schemas for validation | 4h | 1.6 |
| 1.8 | Build `SettingsTab.tsx` scaffold | 4h | 1.6 |
| 1.9 | Write unit tests (target: 90%) | 8h | 1.4-1.8 |
| 1.10 | Write integration tests | 4h | 1.9 |

**Total Phase 1**: ~47 hours

#### Deliverables
- [ ] Database migrations applied
- [ ] `ConfigurationService` with get/set/delete
- [ ] REST API endpoints with auth
- [ ] Admin UI tab skeleton
- [ ] Audit logging operational

---

### Phase 2: Core Settings (Week 3-4)

#### Goals
- Implement AI settings configuration
- Implement evaluation settings configuration
- Implement rate limit configuration
- Implement OCR settings configuration

#### Tasks

| ID | Task | Est. Hours | Dependencies |
|----|------|------------|--------------|
| 2.1 | Define AI settings schema | 2h | Phase 1 |
| 2.2 | Build `AISettingsTab.tsx` | 8h | 2.1 |
| 2.3 | Integrate AI config loader | 4h | 2.2 |
| 2.4 | Define evaluation settings schema | 2h | Phase 1 |
| 2.5 | Build `EvaluationSettingsTab.tsx` | 8h | 2.4 |
| 2.6 | Add live preview for evaluation | 6h | 2.5 |
| 2.7 | Integrate evaluation config loader | 4h | 2.6 |
| 2.8 | Define rate limit settings schema | 2h | Phase 1 |
| 2.9 | Build `RateLimitsTab.tsx` | 6h | 2.8 |
| 2.10 | Integrate rate limit config loader | 3h | 2.9 |
| 2.11 | Define OCR settings schema | 2h | Phase 1 |
| 2.12 | Build `OCRSettingsTab.tsx` | 8h | 2.11 |
| 2.13 | Integrate OCR config loader | 4h | 2.12 |
| 2.14 | Add settings validation UI | 4h | 2.2-2.12 |
| 2.15 | Write tests for all tabs | 8h | 2.2-2.14 |

**Total Phase 2**: ~71 hours

#### Deliverables
- [ ] AI Settings tab with model/temperature/timeout controls
- [ ] Evaluation Settings tab with weight sliders and grade thresholds
- [ ] Rate Limits tab with per-endpoint configuration
- [ ] OCR Settings tab with threshold controls
- [ ] All settings load from database with fallback to defaults

---

### Phase 3: Market Data (Week 5-6)

#### Goals
- Create market benchmark data management
- Create provider data management
- Create regional risk factor management
- Implement data versioning and import/export

#### Tasks

| ID | Task | Est. Hours | Dependencies |
|----|------|------------|--------------|
| 3.1 | Create `market_benchmarks` migration | 4h | Phase 1 |
| 3.2 | Create `insurance_providers` migration | 3h | Phase 1 |
| 3.3 | Create `regional_factors` migration | 3h | Phase 1 |
| 3.4 | Build benchmark data API | 6h | 3.1 |
| 3.5 | Build provider data API | 4h | 3.2 |
| 3.6 | Build regional factors API | 4h | 3.3 |
| 3.7 | Build `MarketDataTab.tsx` | 10h | 3.4-3.6 |
| 3.8 | Add data grid editing | 8h | 3.7 |
| 3.9 | Implement version history | 6h | 3.7 |
| 3.10 | Build CSV/JSON import | 6h | 3.7 |
| 3.11 | Build CSV/JSON export | 4h | 3.10 |
| 3.12 | Migrate existing data to tables | 4h | 3.1-3.3 |
| 3.13 | Update evaluator to use DB data | 6h | 3.12 |
| 3.14 | Write tests | 8h | 3.4-3.13 |

**Total Phase 3**: ~76 hours

#### Deliverables
- [ ] Market Data tab with benchmark editor
- [ ] Provider data management with ratings
- [ ] Regional risk factor editor
- [ ] Import/export functionality
- [ ] Version history with rollback capability

---

### Phase 4: User Preferences (Week 7-8)

#### Goals
- Create user preferences system
- Build user settings page
- Implement preference sync across devices
- Enable A/B testing infrastructure

#### Tasks

| ID | Task | Est. Hours | Dependencies |
|----|------|------------|--------------|
| 4.1 | Define user preferences schema | 3h | Phase 1 |
| 4.2 | Build `/api/user/preferences` routes | 6h | 4.1 |
| 4.3 | Build `UserSettingsPage.tsx` | 10h | 4.2 |
| 4.4 | Add dashboard preferences | 6h | 4.3 |
| 4.5 | Add notification preferences | 6h | 4.3 |
| 4.6 | Add language/theme preferences | 4h | 4.3 |
| 4.7 | Implement preference sync | 6h | 4.2 |
| 4.8 | Add preference migration on login | 4h | 4.7 |
| 4.9 | Build A/B testing infrastructure | 8h | 4.1 |
| 4.10 | Create feature flag system | 6h | 4.9 |
| 4.11 | Write tests | 8h | 4.2-4.10 |
| 4.12 | Documentation and training | 4h | All |

**Total Phase 4**: ~71 hours

#### Deliverables
- [ ] User Settings page with all preferences
- [ ] Cross-device preference sync
- [ ] A/B testing capability
- [ ] Feature flag system
- [ ] Admin documentation

---

## Database Schema Design

### Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         DATABASE SCHEMA                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────┐        ┌─────────────────────┐                 │
│  │    app_settings     │        │  settings_audit_log │                 │
│  ├─────────────────────┤        ├─────────────────────┤                 │
│  │ id (PK)             │───────►│ id (PK)             │                 │
│  │ category            │        │ setting_id (FK)     │                 │
│  │ key                 │        │ previous_value      │                 │
│  │ value (JSONB)       │        │ new_value           │                 │
│  │ schema (JSONB)      │        │ changed_by (FK)     │                 │
│  │ description         │        │ changed_at          │                 │
│  │ is_sensitive        │        │ reason              │                 │
│  │ updated_by (FK)     │        │ ip_address          │                 │
│  │ updated_at          │        └─────────────────────┘                 │
│  │ created_at          │                                                │
│  └─────────────────────┘                                                │
│           │                                                              │
│           │                     ┌─────────────────────┐                 │
│           │                     │  user_preferences   │                 │
│           │                     ├─────────────────────┤                 │
│           │                     │ id (PK)             │                 │
│           │                     │ user_id (FK)        │                 │
│           │                     │ category            │                 │
│           │                     │ preferences (JSONB) │                 │
│           │                     │ updated_at          │                 │
│           │                     └─────────────────────┘                 │
│           │                                                              │
│           ▼                                                              │
│  ┌─────────────────────┐        ┌─────────────────────┐                 │
│  │  market_benchmarks  │        │ insurance_providers │                 │
│  ├─────────────────────┤        ├─────────────────────┤                 │
│  │ id (PK)             │        │ id (PK)             │                 │
│  │ policy_type         │        │ code                │                 │
│  │ coverage_type       │        │ name                │                 │
│  │ region_code         │        │ market_share        │                 │
│  │ year                │        │ customer_rating     │                 │
│  │ min_limit           │        │ established_year    │                 │
│  │ typical_limit       │        │ logo_url            │                 │
│  │ max_limit           │        │ is_active           │                 │
│  │ typical_deductible  │        │ updated_at          │                 │
│  │ inclusion_rate      │        └─────────────────────┘                 │
│  │ source              │                                                │
│  │ effective_date      │        ┌─────────────────────┐                 │
│  │ created_at          │        │  regional_factors   │                 │
│  │ version             │        ├─────────────────────┤                 │
│  └─────────────────────┘        │ id (PK)             │                 │
│                                 │ region_code         │                 │
│                                 │ policy_type         │                 │
│                                 │ risk_factor         │                 │
│                                 │ year                │                 │
│                                 │ source              │                 │
│                                 │ notes               │                 │
│                                 │ updated_at          │                 │
│                                 └─────────────────────┘                 │
│                                                                          │
│  ┌─────────────────────┐        ┌─────────────────────┐                 │
│  │   feature_flags     │        │    ab_experiments   │                 │
│  ├─────────────────────┤        ├─────────────────────┤                 │
│  │ id (PK)             │        │ id (PK)             │                 │
│  │ key                 │        │ name                │                 │
│  │ enabled             │        │ description         │                 │
│  │ rollout_percentage  │        │ variants (JSONB)    │                 │
│  │ user_segments       │        │ allocation (JSONB)  │                 │
│  │ description         │        │ metrics (JSONB)     │                 │
│  │ expires_at          │        │ status              │                 │
│  │ updated_at          │        │ started_at          │                 │
│  └─────────────────────┘        │ ended_at            │                 │
│                                 └─────────────────────┘                 │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Migration: `009_configuration_system.sql`

```sql
-- ============================================================================
-- Configuration System Tables
-- Migration: 009_configuration_system.sql
-- Description: Creates tables for admin settings, user preferences, and market data
-- ============================================================================

-- ===========================================
-- 1. App Settings (Admin-managed configuration)
-- ===========================================
CREATE TABLE IF NOT EXISTS public.app_settings (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  category VARCHAR(50) NOT NULL,
  key VARCHAR(100) NOT NULL,
  value JSONB NOT NULL,
  schema JSONB, -- JSON Schema for validation
  description TEXT,
  is_sensitive BOOLEAN DEFAULT FALSE,
  is_readonly BOOLEAN DEFAULT FALSE,
  display_order INT DEFAULT 0,
  updated_by UUID REFERENCES public.admin_users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT app_settings_category_key_unique UNIQUE (category, key)
);

-- Index for fast lookups
CREATE INDEX idx_app_settings_category ON public.app_settings(category);
CREATE INDEX idx_app_settings_key ON public.app_settings(key);

-- ===========================================
-- 2. Settings Audit Log
-- ===========================================
CREATE TABLE IF NOT EXISTS public.settings_audit_log (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  setting_id UUID REFERENCES public.app_settings(id) ON DELETE SET NULL,
  category VARCHAR(50) NOT NULL,
  key VARCHAR(100) NOT NULL,
  previous_value JSONB,
  new_value JSONB,
  changed_by UUID REFERENCES public.admin_users(id),
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  reason TEXT,
  ip_address INET,
  user_agent TEXT
);

-- Index for querying audit history
CREATE INDEX idx_settings_audit_setting ON public.settings_audit_log(setting_id);
CREATE INDEX idx_settings_audit_category ON public.settings_audit_log(category);
CREATE INDEX idx_settings_audit_changed_at ON public.settings_audit_log(changed_at DESC);

-- ===========================================
-- 3. User Preferences
-- ===========================================
CREATE TABLE IF NOT EXISTS public.user_preferences (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  category VARCHAR(50) NOT NULL,
  preferences JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT user_preferences_user_category_unique UNIQUE (user_id, category)
);

-- Index for fast user lookups
CREATE INDEX idx_user_preferences_user ON public.user_preferences(user_id);

-- ===========================================
-- 4. Market Benchmarks (versioned)
-- ===========================================
CREATE TABLE IF NOT EXISTS public.market_benchmarks (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  policy_type VARCHAR(50) NOT NULL,
  coverage_type VARCHAR(100) NOT NULL,
  region_code VARCHAR(20) DEFAULT 'TR', -- 'TR' for national, or region code
  year INT NOT NULL,
  min_limit NUMERIC,
  typical_limit NUMERIC,
  max_limit NUMERIC,
  typical_deductible NUMERIC,
  inclusion_rate NUMERIC, -- 0-100 percentage
  importance VARCHAR(20) DEFAULT 'standard', -- critical, standard, optional
  source VARCHAR(200),
  notes TEXT,
  effective_date DATE,
  version INT DEFAULT 1,
  is_active BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES public.admin_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT market_benchmarks_unique UNIQUE (policy_type, coverage_type, region_code, year, version)
);

-- Indexes
CREATE INDEX idx_market_benchmarks_type ON public.market_benchmarks(policy_type);
CREATE INDEX idx_market_benchmarks_year ON public.market_benchmarks(year);
CREATE INDEX idx_market_benchmarks_active ON public.market_benchmarks(is_active) WHERE is_active = TRUE;

-- ===========================================
-- 5. Insurance Providers
-- ===========================================
CREATE TABLE IF NOT EXISTS public.insurance_providers (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  name_tr VARCHAR(200),
  market_share NUMERIC, -- percentage 0-100
  customer_rating NUMERIC, -- 0-5 stars
  established_year INT,
  headquarters VARCHAR(100),
  website VARCHAR(200),
  logo_url VARCHAR(500),
  specialties JSONB DEFAULT '[]', -- ['kasko', 'health', etc.]
  is_active BOOLEAN DEFAULT TRUE,
  notes TEXT,
  updated_by UUID REFERENCES public.admin_users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX idx_insurance_providers_active ON public.insurance_providers(is_active) WHERE is_active = TRUE;

-- ===========================================
-- 6. Regional Risk Factors
-- ===========================================
CREATE TABLE IF NOT EXISTS public.regional_factors (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  region_code VARCHAR(20) NOT NULL,
  region_name VARCHAR(100) NOT NULL,
  region_name_tr VARCHAR(100),
  policy_type VARCHAR(50) NOT NULL, -- 'all' or specific type
  risk_factor NUMERIC NOT NULL, -- multiplier (e.g., 1.15 for 15% higher)
  year INT NOT NULL,
  source VARCHAR(200),
  notes TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  updated_by UUID REFERENCES public.admin_users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT regional_factors_unique UNIQUE (region_code, policy_type, year)
);

-- Index
CREATE INDEX idx_regional_factors_region ON public.regional_factors(region_code);
CREATE INDEX idx_regional_factors_year ON public.regional_factors(year);

-- ===========================================
-- 7. Feature Flags
-- ===========================================
CREATE TABLE IF NOT EXISTS public.feature_flags (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  key VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  enabled BOOLEAN DEFAULT FALSE,
  rollout_percentage INT DEFAULT 0, -- 0-100
  user_segments JSONB DEFAULT '[]', -- ['beta', 'premium', etc.]
  conditions JSONB DEFAULT '{}', -- Additional conditions
  expires_at TIMESTAMPTZ,
  updated_by UUID REFERENCES public.admin_users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- 8. A/B Experiments
-- ===========================================
CREATE TABLE IF NOT EXISTS public.ab_experiments (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  key VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  variants JSONB NOT NULL, -- [{name: 'control', weight: 50}, {name: 'variant_a', weight: 50}]
  config_overrides JSONB DEFAULT '{}', -- Settings to override per variant
  metrics JSONB DEFAULT '[]', -- Metrics to track
  status VARCHAR(20) DEFAULT 'draft', -- draft, running, paused, completed
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  winner_variant VARCHAR(100),
  created_by UUID REFERENCES public.admin_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- 9. A/B Experiment Assignments
-- ===========================================
CREATE TABLE IF NOT EXISTS public.ab_assignments (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  experiment_id UUID REFERENCES public.ab_experiments(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  variant VARCHAR(100) NOT NULL,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT ab_assignments_unique UNIQUE (experiment_id, user_id)
);

-- Index
CREATE INDEX idx_ab_assignments_experiment ON public.ab_assignments(experiment_id);
CREATE INDEX idx_ab_assignments_user ON public.ab_assignments(user_id);

-- ===========================================
-- Row Level Security
-- ===========================================

-- App Settings: Admin only
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin users can manage settings"
  ON public.app_settings
  FOR ALL
  USING (true); -- Enforced at API level via admin middleware

-- User Preferences: Users can only access their own
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own preferences"
  ON public.user_preferences
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own preferences"
  ON public.user_preferences
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own preferences"
  ON public.user_preferences
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ===========================================
-- Triggers
-- ===========================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_app_settings_updated_at
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_preferences_updated_at
  BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_market_benchmarks_updated_at
  BEFORE UPDATE ON public.market_benchmarks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_insurance_providers_updated_at
  BEFORE UPDATE ON public.insurance_providers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_regional_factors_updated_at
  BEFORE UPDATE ON public.regional_factors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ===========================================
-- Audit Trigger for Settings Changes
-- ===========================================
CREATE OR REPLACE FUNCTION audit_settings_change()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.settings_audit_log (
    setting_id,
    category,
    key,
    previous_value,
    new_value,
    changed_by
  ) VALUES (
    NEW.id,
    NEW.category,
    NEW.key,
    OLD.value,
    NEW.value,
    NEW.updated_by
  );
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER audit_app_settings_changes
  AFTER UPDATE ON public.app_settings
  FOR EACH ROW
  WHEN (OLD.value IS DISTINCT FROM NEW.value)
  EXECUTE FUNCTION audit_settings_change();
```

---

## API Design

### Settings API Endpoints

#### Admin Settings

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/admin/settings` | List all settings | Admin |
| GET | `/api/admin/settings/:category` | Get settings by category | Admin |
| GET | `/api/admin/settings/:category/:key` | Get specific setting | Admin |
| PUT | `/api/admin/settings/:category/:key` | Update setting | Admin |
| POST | `/api/admin/settings/:category/:key/reset` | Reset to default | Admin |
| GET | `/api/admin/settings/:category/:key/history` | Get audit history | Admin |

#### User Preferences

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/user/preferences` | Get all preferences | User |
| GET | `/api/user/preferences/:category` | Get category preferences | User |
| PUT | `/api/user/preferences/:category` | Update preferences | User |
| DELETE | `/api/user/preferences/:category` | Reset to defaults | User |

#### Market Data

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/admin/market-data/benchmarks` | List benchmarks | Admin |
| GET | `/api/admin/market-data/benchmarks/:type` | Get by policy type | Admin |
| PUT | `/api/admin/market-data/benchmarks/:id` | Update benchmark | Admin |
| POST | `/api/admin/market-data/benchmarks` | Create benchmark | Admin |
| POST | `/api/admin/market-data/benchmarks/import` | Bulk import | Admin |
| GET | `/api/admin/market-data/benchmarks/export` | Export to CSV/JSON | Admin |
| GET | `/api/admin/market-data/providers` | List providers | Admin |
| PUT | `/api/admin/market-data/providers/:id` | Update provider | Admin |
| GET | `/api/admin/market-data/regions` | List regional factors | Admin |
| PUT | `/api/admin/market-data/regions/:id` | Update factor | Admin |

### Request/Response Examples

#### Get Settings by Category

```typescript
// GET /api/admin/settings/ai
// Response
{
  "success": true,
  "data": {
    "category": "ai",
    "settings": [
      {
        "key": "openai_model",
        "value": "gpt-4o",
        "schema": {
          "type": "string",
          "enum": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"]
        },
        "description": "OpenAI model for policy extraction",
        "updatedAt": "2026-02-04T10:30:00Z",
        "updatedBy": "admin@insurai.com"
      },
      {
        "key": "temperature",
        "value": 0.1,
        "schema": {
          "type": "number",
          "minimum": 0,
          "maximum": 2
        },
        "description": "AI response temperature (lower = more deterministic)",
        "updatedAt": "2026-02-04T10:30:00Z"
      }
      // ... more settings
    ]
  }
}
```

#### Update Setting

```typescript
// PUT /api/admin/settings/ai/openai_model
// Request
{
  "value": "gpt-4o-mini",
  "reason": "Switching to faster model for cost optimization"
}

// Response
{
  "success": true,
  "data": {
    "key": "openai_model",
    "previousValue": "gpt-4o",
    "newValue": "gpt-4o-mini",
    "updatedAt": "2026-02-04T11:00:00Z"
  }
}
```

#### Get User Preferences

```typescript
// GET /api/user/preferences/dashboard
// Response
{
  "success": true,
  "data": {
    "category": "dashboard",
    "preferences": {
      "itemsPerPage": 20,
      "defaultSort": "created_at",
      "defaultSortDirection": "desc",
      "showExpiredPolicies": false,
      "compactView": false
    },
    "updatedAt": "2026-02-04T09:00:00Z"
  }
}
```

---

## Admin UI Components

### Component Hierarchy

```
AdminDashboard
├── SettingsTab (new)
│   ├── SettingsCategoryNav
│   │   ├── AI Settings
│   │   ├── Evaluation
│   │   ├── OCR
│   │   ├── Rate Limits
│   │   ├── Email
│   │   └── Market Data
│   └── SettingsContent
│       ├── AISettingsPanel
│       │   ├── ModelSelector
│       │   ├── TemperatureSlider
│       │   ├── TimeoutInput
│       │   └── ProviderToggle
│       ├── EvaluationSettingsPanel
│       │   ├── WeightSliders
│       │   ├── GradeThresholds
│       │   ├── ScorePreview
│       │   └── ResetButton
│       ├── OCRSettingsPanel
│       │   ├── ConfidenceSliders
│       │   ├── DensityThresholds
│       │   └── ProviderConfig
│       ├── RateLimitsPanel
│       │   ├── EndpointLimitInputs
│       │   ├── WindowDurationInputs
│       │   └── ExemptIPList
│       └── MarketDataPanel
│           ├── BenchmarkTable
│           ├── ProviderList
│           ├── RegionalFactorsMap
│           ├── ImportButton
│           └── ExportButton
```

### AISettingsTab Component

```tsx
// src/components/admin/tabs/AISettingsTab.tsx

import { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { adminFetch } from '@/lib/admin/api'
import { useToast } from '@/hooks/useToast'

interface AISettings {
  openai_model: string
  anthropic_model: string
  temperature: number
  max_tokens: number
  extraction_timeout_ms: number
  chat_temperature: number
  enable_fallback: boolean
  preferred_provider: 'openai' | 'anthropic' | 'auto'
}

const DEFAULT_SETTINGS: AISettings = {
  openai_model: 'gpt-4o',
  anthropic_model: 'claude-sonnet-4-20250514',
  temperature: 0.1,
  max_tokens: 4096,
  extraction_timeout_ms: 90000,
  chat_temperature: 0.7,
  enable_fallback: true,
  preferred_provider: 'auto'
}

const OPENAI_MODELS = [
  { value: 'gpt-4o', label: 'GPT-4o (Recommended)' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini (Faster, Cheaper)' },
  { value: 'gpt-4-turbo', label: 'GPT-4 Turbo (Legacy)' }
]

const ANTHROPIC_MODELS = [
  { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4 (Recommended)' },
  { value: 'claude-3-5-haiku-latest', label: 'Claude 3.5 Haiku (Faster)' },
  { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus (Most Capable)' }
]

export function AISettingsTab() {
  const [settings, setSettings] = useState<AISettings>(DEFAULT_SETTINGS)
  const [originalSettings, setOriginalSettings] = useState<AISettings>(DEFAULT_SETTINGS)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    fetchSettings()
  }, [])

  useEffect(() => {
    setHasChanges(JSON.stringify(settings) !== JSON.stringify(originalSettings))
  }, [settings, originalSettings])

  const fetchSettings = async () => {
    try {
      setIsLoading(true)
      const response = await adminFetch('/api/admin/settings/ai')
      if (response.ok) {
        const data = await response.json()
        const loadedSettings = data.data.settings.reduce((acc: Partial<AISettings>, s: { key: string; value: unknown }) => {
          acc[s.key as keyof AISettings] = s.value as AISettings[keyof AISettings]
          return acc
        }, {} as Partial<AISettings>)
        const merged = { ...DEFAULT_SETTINGS, ...loadedSettings }
        setSettings(merged)
        setOriginalSettings(merged)
      }
    } catch (error) {
      console.error('Failed to fetch AI settings:', error)
      toast({ title: 'Error', description: 'Failed to load AI settings', variant: 'destructive' })
    } finally {
      setIsLoading(false)
    }
  }

  const saveSettings = async () => {
    try {
      setIsSaving(true)
      for (const [key, value] of Object.entries(settings)) {
        if (settings[key as keyof AISettings] !== originalSettings[key as keyof AISettings]) {
          await adminFetch(`/api/admin/settings/ai/${key}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value })
          })
        }
      }
      setOriginalSettings(settings)
      toast({ title: 'Success', description: 'AI settings saved successfully' })
    } catch (error) {
      console.error('Failed to save AI settings:', error)
      toast({ title: 'Error', description: 'Failed to save AI settings', variant: 'destructive' })
    } finally {
      setIsSaving(false)
    }
  }

  const resetToDefaults = () => {
    setSettings(DEFAULT_SETTINGS)
  }

  if (isLoading) {
    return <div className="flex items-center justify-center p-8">Loading AI settings...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">AI Configuration</h2>
          <p className="text-muted-foreground">Configure AI models, temperatures, and timeouts</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={resetToDefaults} disabled={!hasChanges}>
            Reset to Defaults
          </Button>
          <Button onClick={saveSettings} disabled={!hasChanges || isSaving}>
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {hasChanges && (
        <Alert>
          <AlertDescription>You have unsaved changes</AlertDescription>
        </Alert>
      )}

      {/* Model Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Model Selection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Preferred Provider</Label>
              <Select
                value={settings.preferred_provider}
                onValueChange={(v) => setSettings(s => ({ ...s, preferred_provider: v as AISettings['preferred_provider'] }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto (Cost-optimized)</SelectItem>
                  <SelectItem value="openai">OpenAI Only</SelectItem>
                  <SelectItem value="anthropic">Anthropic Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center space-x-2 pt-8">
              <Switch
                checked={settings.enable_fallback}
                onCheckedChange={(v) => setSettings(s => ({ ...s, enable_fallback: v }))}
              />
              <Label>Enable fallback on provider failure</Label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>OpenAI Model</Label>
              <Select
                value={settings.openai_model}
                onValueChange={(v) => setSettings(s => ({ ...s, openai_model: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OPENAI_MODELS.map(m => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Anthropic Model</Label>
              <Select
                value={settings.anthropic_model}
                onValueChange={(v) => setSettings(s => ({ ...s, anthropic_model: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ANTHROPIC_MODELS.map(m => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Temperature & Tokens */}
      <Card>
        <CardHeader>
          <CardTitle>Response Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Extraction Temperature: {settings.temperature}</Label>
              <span className="text-sm text-muted-foreground">
                Lower = more deterministic, Higher = more creative
              </span>
            </div>
            <Slider
              value={[settings.temperature]}
              onValueChange={([v]) => setSettings(s => ({ ...s, temperature: v }))}
              min={0}
              max={2}
              step={0.1}
            />
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Chat Temperature: {settings.chat_temperature}</Label>
              <span className="text-sm text-muted-foreground">
                Higher values make chat responses more varied
              </span>
            </div>
            <Slider
              value={[settings.chat_temperature]}
              onValueChange={([v]) => setSettings(s => ({ ...s, chat_temperature: v }))}
              min={0}
              max={2}
              step={0.1}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Max Tokens</Label>
              <Input
                type="number"
                value={settings.max_tokens}
                onChange={(e) => setSettings(s => ({ ...s, max_tokens: parseInt(e.target.value) || 4096 }))}
                min={1000}
                max={16000}
              />
              <p className="text-sm text-muted-foreground">Maximum response length (1000-16000)</p>
            </div>
            <div className="space-y-2">
              <Label>Extraction Timeout (ms)</Label>
              <Input
                type="number"
                value={settings.extraction_timeout_ms}
                onChange={(e) => setSettings(s => ({ ...s, extraction_timeout_ms: parseInt(e.target.value) || 90000 }))}
                min={30000}
                max={300000}
              />
              <p className="text-sm text-muted-foreground">30-300 seconds</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cost Estimation */}
      <Card>
        <CardHeader>
          <CardTitle>Estimated Costs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-2xl font-bold">
                ${settings.openai_model === 'gpt-4o' ? '0.015' : '0.003'}
              </p>
              <p className="text-sm text-muted-foreground">Per extraction (OpenAI)</p>
            </div>
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-2xl font-bold">
                ${settings.anthropic_model.includes('haiku') ? '0.001' : '0.015'}
              </p>
              <p className="text-sm text-muted-foreground">Per extraction (Anthropic)</p>
            </div>
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-2xl font-bold">~$0.002</p>
              <p className="text-sm text-muted-foreground">Per chat message</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
```

### EvaluationSettingsTab Component

```tsx
// src/components/admin/tabs/EvaluationSettingsTab.tsx

import { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Slider } from '@/components/ui/slider'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { adminFetch } from '@/lib/admin/api'
import { useToast } from '@/hooks/useToast'

interface EvaluationWeights {
  premium: number
  coverage: number
  deductible: number
  compliance: number
  value: number
}

interface GradeThresholds {
  A: number
  B: number
  C: number
  D: number
}

interface EvaluationSettings {
  weights: EvaluationWeights
  gradeThresholds: GradeThresholds
}

const DEFAULT_SETTINGS: EvaluationSettings = {
  weights: {
    premium: 20,
    coverage: 30,
    deductible: 15,
    compliance: 20,
    value: 15
  },
  gradeThresholds: {
    A: 90,
    B: 80,
    C: 70,
    D: 60
  }
}

const WEIGHT_DESCRIPTIONS = {
  premium: 'How much weight to give to premium cost efficiency',
  coverage: 'How much weight to give to coverage comprehensiveness',
  deductible: 'How much weight to give to deductible/out-of-pocket exposure',
  compliance: 'How much weight to give to regulatory compliance',
  value: 'How much weight to give to overall value for money'
}

// Sample policy for preview
const SAMPLE_SCORES = {
  premium: 75,
  coverage: 85,
  deductible: 70,
  compliance: 90,
  value: 80
}

export function EvaluationSettingsTab() {
  const [settings, setSettings] = useState<EvaluationSettings>(DEFAULT_SETTINGS)
  const [originalSettings, setOriginalSettings] = useState<EvaluationSettings>(DEFAULT_SETTINGS)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const { toast } = useToast()

  const totalWeight = Object.values(settings.weights).reduce((a, b) => a + b, 0)
  const isValidWeights = totalWeight === 100

  useEffect(() => {
    fetchSettings()
  }, [])

  useEffect(() => {
    setHasChanges(JSON.stringify(settings) !== JSON.stringify(originalSettings))
  }, [settings, originalSettings])

  const fetchSettings = async () => {
    try {
      setIsLoading(true)
      const response = await adminFetch('/api/admin/settings/evaluation')
      if (response.ok) {
        const data = await response.json()
        // Parse settings from response
        const loadedSettings = { ...DEFAULT_SETTINGS }
        for (const s of data.data.settings) {
          if (s.key === 'weights') loadedSettings.weights = s.value
          if (s.key === 'grade_thresholds') loadedSettings.gradeThresholds = s.value
        }
        setSettings(loadedSettings)
        setOriginalSettings(loadedSettings)
      }
    } catch (error) {
      console.error('Failed to fetch evaluation settings:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const saveSettings = async () => {
    if (!isValidWeights) {
      toast({ title: 'Error', description: 'Weights must sum to 100%', variant: 'destructive' })
      return
    }

    try {
      setIsSaving(true)
      await adminFetch('/api/admin/settings/evaluation/weights', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: settings.weights })
      })
      await adminFetch('/api/admin/settings/evaluation/grade_thresholds', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: settings.gradeThresholds })
      })
      setOriginalSettings(settings)
      toast({ title: 'Success', description: 'Evaluation settings saved' })
    } catch (error) {
      console.error('Failed to save settings:', error)
      toast({ title: 'Error', description: 'Failed to save settings', variant: 'destructive' })
    } finally {
      setIsSaving(false)
    }
  }

  const updateWeight = (key: keyof EvaluationWeights, value: number) => {
    setSettings(s => ({
      ...s,
      weights: { ...s.weights, [key]: value }
    }))
  }

  const updateThreshold = (grade: keyof GradeThresholds, value: number) => {
    setSettings(s => ({
      ...s,
      gradeThresholds: { ...s.gradeThresholds, [grade]: value }
    }))
  }

  // Calculate preview score
  const previewScore = Object.entries(SAMPLE_SCORES).reduce((total, [key, score]) => {
    return total + (score * settings.weights[key as keyof EvaluationWeights] / 100)
  }, 0)

  const getGradeFromScore = (score: number): string => {
    if (score >= settings.gradeThresholds.A) return 'A'
    if (score >= settings.gradeThresholds.B) return 'B'
    if (score >= settings.gradeThresholds.C) return 'C'
    if (score >= settings.gradeThresholds.D) return 'D'
    return 'F'
  }

  const getGradeColor = (grade: string): string => {
    switch (grade) {
      case 'A': return 'bg-green-500'
      case 'B': return 'bg-blue-500'
      case 'C': return 'bg-yellow-500'
      case 'D': return 'bg-orange-500'
      case 'F': return 'bg-red-500'
      default: return 'bg-gray-500'
    }
  }

  if (isLoading) {
    return <div className="flex items-center justify-center p-8">Loading evaluation settings...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Evaluation Configuration</h2>
          <p className="text-muted-foreground">Configure how policies are scored and graded</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setSettings(DEFAULT_SETTINGS)} disabled={!hasChanges}>
            Reset to Defaults
          </Button>
          <Button onClick={saveSettings} disabled={!hasChanges || isSaving || !isValidWeights}>
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {!isValidWeights && (
        <Alert variant="destructive">
          <AlertDescription>
            Weights must sum to 100%. Current total: {totalWeight}%
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-3 gap-6">
        {/* Weights Configuration */}
        <Card className="col-span-2">
          <CardHeader>
            <CardTitle>Scoring Weights</CardTitle>
            <CardDescription>
              Adjust how much each factor contributes to the overall score.
              Total must equal 100%.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {(Object.keys(settings.weights) as Array<keyof EvaluationWeights>).map(key => (
              <div key={key} className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="capitalize">{key}: {settings.weights[key]}%</Label>
                  <span className="text-sm text-muted-foreground">
                    Sample score: {SAMPLE_SCORES[key]}
                  </span>
                </div>
                <Slider
                  value={[settings.weights[key]]}
                  onValueChange={([v]) => updateWeight(key, v)}
                  min={0}
                  max={50}
                  step={5}
                />
                <p className="text-xs text-muted-foreground">{WEIGHT_DESCRIPTIONS[key]}</p>
              </div>
            ))}

            <div className="pt-4 border-t">
              <div className="flex items-center justify-between">
                <span className="font-medium">Total</span>
                <Badge variant={isValidWeights ? 'default' : 'destructive'}>
                  {totalWeight}%
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Live Preview */}
        <Card>
          <CardHeader>
            <CardTitle>Live Preview</CardTitle>
            <CardDescription>
              How a sample policy would score with current settings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center p-6 bg-muted rounded-lg">
              <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full ${getGradeColor(getGradeFromScore(previewScore))} text-white text-3xl font-bold mb-2`}>
                {getGradeFromScore(previewScore)}
              </div>
              <p className="text-2xl font-bold">{previewScore.toFixed(1)}</p>
              <p className="text-sm text-muted-foreground">Overall Score</p>
            </div>

            <div className="space-y-2">
              <h4 className="font-medium text-sm">Score Breakdown</h4>
              {(Object.keys(SAMPLE_SCORES) as Array<keyof typeof SAMPLE_SCORES>).map(key => (
                <div key={key} className="flex justify-between text-sm">
                  <span className="capitalize">{key}</span>
                  <span>
                    {SAMPLE_SCORES[key]} × {settings.weights[key]}% = {(SAMPLE_SCORES[key] * settings.weights[key] / 100).toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Grade Thresholds */}
      <Card>
        <CardHeader>
          <CardTitle>Grade Thresholds</CardTitle>
          <CardDescription>
            Define the minimum score required for each grade
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4">
            {(['A', 'B', 'C', 'D'] as const).map(grade => (
              <div key={grade} className="space-y-2">
                <Label className="flex items-center gap-2">
                  <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full ${getGradeColor(grade)} text-white font-bold`}>
                    {grade}
                  </span>
                  Minimum Score
                </Label>
                <Input
                  type="number"
                  value={settings.gradeThresholds[grade]}
                  onChange={(e) => updateThreshold(grade, parseInt(e.target.value) || 0)}
                  min={0}
                  max={100}
                />
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Scores below Grade D threshold will receive Grade F
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
```

---

## Migration Strategy

### Phase 1: Database Setup

1. **Apply migrations in order**:
   ```bash
   supabase migration up 009_configuration_system.sql
   ```

2. **Seed default settings**:
   ```sql
   -- 010_seed_configuration_defaults.sql
   INSERT INTO app_settings (category, key, value, description, display_order) VALUES
   -- AI Settings
   ('ai', 'openai_model', '"gpt-4o"', 'OpenAI model for extraction', 1),
   ('ai', 'anthropic_model', '"claude-sonnet-4-20250514"', 'Anthropic model for extraction', 2),
   ('ai', 'temperature', '0.1', 'AI temperature for extraction', 3),
   ('ai', 'max_tokens', '4096', 'Maximum response tokens', 4),
   ('ai', 'extraction_timeout_ms', '90000', 'Extraction timeout in ms', 5),
   ('ai', 'chat_temperature', '0.7', 'Chat response temperature', 6),
   ('ai', 'enable_fallback', 'true', 'Enable provider fallback', 7),
   ('ai', 'preferred_provider', '"auto"', 'Preferred AI provider', 8),

   -- Evaluation Settings
   ('evaluation', 'weights', '{"premium":20,"coverage":30,"deductible":15,"compliance":20,"value":15}', 'Scoring weights', 1),
   ('evaluation', 'grade_thresholds', '{"A":90,"B":80,"C":70,"D":60}', 'Grade thresholds', 2),

   -- Rate Limits
   ('rate_limits', 'ai_extraction', '{"max":20,"window":"hour"}', 'AI extraction rate limit', 1),
   ('rate_limits', 'ai_chat', '{"max":60,"window":"hour"}', 'AI chat rate limit', 2),
   ('rate_limits', 'ocr', '{"max":30,"window":"hour"}', 'OCR rate limit', 3),

   -- OCR Settings (migrate from JSON file)
   ('ocr', 'confidence_thresholds', '{"skip_ocr":0.85,"selective_ocr":0.60,"full_ocr":0.0}', 'OCR decision thresholds', 1),
   ('ocr', 'density_threshold', '200', 'Chars per page for digital PDF detection', 2)
   ON CONFLICT (category, key) DO NOTHING;
   ```

### Phase 2: Code Integration

1. **Create ConfigurationService**:
   ```typescript
   // src/lib/config/configuration-service.ts

   import { supabase } from '@/lib/supabase/client'

   interface CacheEntry {
     value: unknown
     expiresAt: number
   }

   const cache = new Map<string, CacheEntry>()
   const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

   export class ConfigurationService {
     private static instance: ConfigurationService

     static getInstance(): ConfigurationService {
       if (!this.instance) {
         this.instance = new ConfigurationService()
       }
       return this.instance
     }

     async get<T>(category: string, key: string, defaultValue: T): Promise<T> {
       const cacheKey = `${category}:${key}`

       // Check cache first
       const cached = cache.get(cacheKey)
       if (cached && cached.expiresAt > Date.now()) {
         return cached.value as T
       }

       try {
         const { data, error } = await supabase
           .from('app_settings')
           .select('value')
           .eq('category', category)
           .eq('key', key)
           .single()

         if (error || !data) {
           return defaultValue
         }

         const value = data.value as T

         // Update cache
         cache.set(cacheKey, {
           value,
           expiresAt: Date.now() + CACHE_TTL
         })

         return value
       } catch {
         return defaultValue
       }
     }

     async getCategory(category: string): Promise<Record<string, unknown>> {
       const { data, error } = await supabase
         .from('app_settings')
         .select('key, value')
         .eq('category', category)

       if (error || !data) {
         return {}
       }

       return data.reduce((acc, { key, value }) => {
         acc[key] = value
         return acc
       }, {} as Record<string, unknown>)
     }

     async set(category: string, key: string, value: unknown, updatedBy?: string): Promise<void> {
       const { error } = await supabase
         .from('app_settings')
         .upsert({
           category,
           key,
           value,
           updated_by: updatedBy,
           updated_at: new Date().toISOString()
         }, {
           onConflict: 'category,key'
         })

       if (error) {
         throw error
       }

       // Invalidate cache
       cache.delete(`${category}:${key}`)
     }

     invalidateCache(category?: string): void {
       if (category) {
         for (const key of cache.keys()) {
           if (key.startsWith(`${category}:`)) {
             cache.delete(key)
           }
         }
       } else {
         cache.clear()
       }
     }
   }

   export const configService = ConfigurationService.getInstance()
   ```

2. **Update AI config to use ConfigurationService**:
   ```typescript
   // src/lib/ai/config.ts - Updated

   import { configService } from '@/lib/config/configuration-service'

   // Default values (Tier 1)
   const DEFAULT_AI_CONFIG = {
     openai_model: 'gpt-4o',
     anthropic_model: 'claude-sonnet-4-20250514',
     temperature: 0.1,
     max_tokens: 4096,
     extraction_timeout_ms: 90000
   }

   export async function getAIConfig() {
     const dbConfig = await configService.getCategory('ai')
     return { ...DEFAULT_AI_CONFIG, ...dbConfig }
   }

   export async function getOpenAIModel(): Promise<string> {
     return configService.get('ai', 'openai_model', DEFAULT_AI_CONFIG.openai_model)
   }

   export async function getTemperature(): Promise<number> {
     return configService.get('ai', 'temperature', DEFAULT_AI_CONFIG.temperature)
   }
   ```

### Phase 3: Gradual Rollout

1. **Feature flag the new configuration system**:
   ```typescript
   const useNewConfig = await configService.get('feature_flags', 'use_db_config', false)

   if (useNewConfig) {
     return await getAIConfig() // From database
   } else {
     return DEFAULT_AI_CONFIG // Hardcoded
   }
   ```

2. **Monitor for issues**:
   - Log all config reads with source (cache/db/default)
   - Track cache hit rates
   - Monitor for config-related errors

3. **Gradually increase rollout**:
   - Week 1: 10% of requests
   - Week 2: 50% of requests
   - Week 3: 100% of requests
   - Week 4: Remove feature flag

---

## Testing Strategy

### Unit Tests

```typescript
// src/lib/config/__tests__/configuration-service.test.ts

describe('ConfigurationService', () => {
  describe('get', () => {
    it('should return cached value if not expired', async () => {
      // ...
    })

    it('should fetch from database if cache expired', async () => {
      // ...
    })

    it('should return default value if not found', async () => {
      // ...
    })
  })

  describe('set', () => {
    it('should update database and invalidate cache', async () => {
      // ...
    })

    it('should trigger audit log', async () => {
      // ...
    })
  })
})
```

### Integration Tests

```typescript
// src/lib/config/__tests__/configuration-service.integration.test.ts

describe('ConfigurationService Integration', () => {
  it('should persist settings across requests', async () => {
    await configService.set('test', 'key', 'value1')
    expect(await configService.get('test', 'key', 'default')).toBe('value1')

    await configService.set('test', 'key', 'value2')
    expect(await configService.get('test', 'key', 'default')).toBe('value2')
  })

  it('should apply tier hierarchy correctly', async () => {
    // Tier 1: Default
    expect(await configService.get('ai', 'model', 'gpt-4o')).toBe('gpt-4o')

    // Tier 2: Admin override
    await configService.set('ai', 'model', 'gpt-4o-mini')
    expect(await configService.get('ai', 'model', 'gpt-4o')).toBe('gpt-4o-mini')
  })
})
```

### E2E Tests

```typescript
// e2e/admin-settings.spec.ts

test.describe('Admin Settings', () => {
  test('should update AI model and apply to extractions', async ({ page }) => {
    // Login as admin
    await page.goto('/admin/login')
    await page.fill('[name=email]', 'admin@test.com')
    await page.fill('[name=password]', 'password')
    await page.click('button[type=submit]')

    // Navigate to settings
    await page.click('text=Settings')
    await page.click('text=AI Configuration')

    // Change model
    await page.selectOption('[name=openai_model]', 'gpt-4o-mini')
    await page.click('text=Save Changes')

    // Verify toast
    await expect(page.locator('text=Settings saved')).toBeVisible()

    // Verify extraction uses new model
    // ...
  })
})
```

---

## Rollback Plan

### Database Rollback

```sql
-- Rollback migration 009
DROP TABLE IF EXISTS public.ab_assignments;
DROP TABLE IF EXISTS public.ab_experiments;
DROP TABLE IF EXISTS public.feature_flags;
DROP TABLE IF EXISTS public.regional_factors;
DROP TABLE IF EXISTS public.insurance_providers;
DROP TABLE IF EXISTS public.market_benchmarks;
DROP TABLE IF EXISTS public.settings_audit_log;
DROP TABLE IF EXISTS public.user_preferences;
DROP TABLE IF EXISTS public.app_settings;

DROP FUNCTION IF EXISTS audit_settings_change();
DROP FUNCTION IF EXISTS update_updated_at_column();
```

### Code Rollback

1. **Revert to hardcoded defaults**:
   ```typescript
   // Set feature flag to false
   await configService.set('feature_flags', 'use_db_config', false)
   ```

2. **Monitor for issues**:
   - Check error rates
   - Verify extraction quality
   - Monitor user complaints

3. **If critical issues**:
   - Deploy previous code version
   - Run database rollback
   - Notify affected users

---

## Success Metrics

### Technical Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Config read latency | < 10ms (cached) | P95 latency |
| Cache hit rate | > 95% | Hits / (Hits + Misses) |
| Database load | < 100 queries/min | Query count |
| Error rate | < 0.1% | Failed reads/writes |

### Business Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Time to change config | < 1 minute | Admin task time |
| Config-related incidents | 0 | Incident count |
| Admin satisfaction | > 4/5 | Survey |
| Market data freshness | < 30 days stale | Data age |

### User Experience Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Preference save success | > 99% | Success rate |
| Settings page load time | < 500ms | P95 latency |
| User preference adoption | > 50% | Users with custom prefs |

---

## Appendix: Full Hardcoded Values Inventory

### A. AI Configuration (`src/lib/ai/config.ts`)

| Line | Value | Type | Recommended Action |
|------|-------|------|-------------------|
| 421 | `gpt-4o` | Model | Admin configurable |
| 427 | `claude-sonnet-4-20250514` | Model | Admin configurable |
| 432 | `4096` | Max tokens | Admin configurable |
| 435 | `0.1` | Temperature | Admin configurable |

### B. Policy Evaluation (`src/lib/policy-evaluation/evaluator.ts`)

| Line | Value | Purpose | Recommended Action |
|------|-------|---------|-------------------|
| 145-227 | Score calculations | Premium scoring | Admin configurable |
| 232-350 | Score calculations | Coverage scoring | Admin configurable |
| 417-527 | Deductible thresholds | Deductible scoring | Admin configurable |
| 537-637 | Compliance rules | Compliance scoring | Admin configurable |
| 643-740 | Value calculations | Value scoring | Admin configurable |

### C. OCR Settings (`config/ocr_settings.json`)

| Key | Value | Purpose | Recommended Action |
|-----|-------|---------|-------------------|
| `skip_ocr` | 0.85 | Confidence threshold | Admin configurable |
| `selective_ocr` | 0.60 | Confidence threshold | Admin configurable |
| `chars_per_page_threshold` | 200 | Density threshold | Admin configurable |

### D. Rate Limits (`server/middleware/rate-limit.ts`)

| Line | Value | Purpose | Recommended Action |
|------|-------|---------|-------------------|
| 15 | 20/hr | AI extraction | Admin configurable |
| 16 | 30/hr | OCR | Admin configurable |
| 17 | 60/hr | Chat | Admin configurable |
| 18 | 100/15min | General | Admin configurable |

### E. Market Data (`src/data/market-data/*.ts`)

| File | Values | Purpose | Recommended Action |
|------|--------|---------|-------------------|
| `benchmarks.ts` | 180+ | Coverage benchmarks | Database + Admin UI |
| `providers.ts` | 15 | Provider data | Database + Admin UI |

### F. Regional Factors (`src/lib/regional-benchmark/data.ts`)

| Region | Factor | Purpose | Recommended Action |
|--------|--------|---------|-------------------|
| Marmara | 1.15 | Risk multiplier | Database + Admin UI |
| Ege | 1.05 | Risk multiplier | Database + Admin UI |
| İç Anadolu | 0.95 | Risk multiplier | Database + Admin UI |

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-04 | Claude Code | Initial draft |

---

## Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Technical Lead | | | |
| Product Owner | | | |
| QA Lead | | | |
