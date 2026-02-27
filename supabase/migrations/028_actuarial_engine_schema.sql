-- Migration 028: Actuarial Engine Schema
-- Creates tables for the 4-layer actuarial evaluation engine:
--   - policy_extractions: Extraction run metadata + normalized JSON
--   - extraction_evidence: Field-level evidence pointers (page, snippet, confidence)
--   - config_sets / config_set_versions: Versioned actuarial configuration containers
--   - evaluation_runs: Ties policy → extraction → config snapshot
--   - evaluation_results: Full evaluation output (JSONB)
-- Also seeds the actuarial_engine_enabled feature flag (default: false)

-- ============================================================================
-- POLICY EXTRACTIONS
-- Stores the normalized output of each AI extraction run, linking back to
-- the source policy and document.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.policy_extractions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES public.policies(id) ON DELETE CASCADE,
  document_id UUID,  -- Optional reference to policy_documents if available
  extraction_provider TEXT NOT NULL CHECK (extraction_provider IN ('openai', 'anthropic', 'consensus', 'manual')),
  extraction_model TEXT,  -- e.g., 'gpt-4o', 'claude-sonnet-4-20250514'

  -- The full normalized extraction in ActuarialPolicyInput shape
  normalized_data JSONB NOT NULL,

  -- Extraction quality metadata
  overall_confidence NUMERIC(4,3) CHECK (overall_confidence >= 0 AND overall_confidence <= 1),
  field_count INTEGER DEFAULT 0,
  fields_with_evidence INTEGER DEFAULT 0,
  evidence_coverage_percent NUMERIC(5,2) DEFAULT 0,

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'needs_review')),
  needs_review BOOLEAN DEFAULT false,
  review_reasons TEXT[] DEFAULT '{}',

  -- Timestamps
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for policy_extractions
CREATE INDEX IF NOT EXISTS idx_policy_extractions_policy_id
  ON public.policy_extractions(policy_id);

CREATE INDEX IF NOT EXISTS idx_policy_extractions_status
  ON public.policy_extractions(status);

CREATE INDEX IF NOT EXISTS idx_policy_extractions_created_at
  ON public.policy_extractions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_policy_extractions_needs_review
  ON public.policy_extractions(needs_review) WHERE needs_review = true;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_policy_extractions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_policy_extractions_updated_at
  BEFORE UPDATE ON public.policy_extractions
  FOR EACH ROW EXECUTE FUNCTION update_policy_extractions_updated_at();

COMMENT ON TABLE public.policy_extractions IS 'Stores normalized actuarial extraction data from AI providers, linked to source policies.';

-- ============================================================================
-- EXTRACTION EVIDENCE
-- Per-field evidence pointers tracing back to the source PDF.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.extraction_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  extraction_id UUID NOT NULL REFERENCES public.policy_extractions(id) ON DELETE CASCADE,

  -- Field identification
  field_path TEXT NOT NULL,  -- e.g., 'coverages.COLLISION.limit', 'indemnityMechanics.partsStandard'

  -- Evidence pointer data
  page_number INTEGER,
  snippet_id TEXT,
  raw_text TEXT,  -- Exact text from PDF
  confidence NUMERIC(4,3) CHECK (confidence >= 0 AND confidence <= 1),

  -- Validation status
  needs_review BOOLEAN DEFAULT false,
  review_reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for extraction_evidence
CREATE INDEX IF NOT EXISTS idx_extraction_evidence_extraction_id
  ON public.extraction_evidence(extraction_id);

CREATE INDEX IF NOT EXISTS idx_extraction_evidence_field_path
  ON public.extraction_evidence(field_path);

CREATE INDEX IF NOT EXISTS idx_extraction_evidence_confidence
  ON public.extraction_evidence(confidence) WHERE confidence < 0.6;

COMMENT ON TABLE public.extraction_evidence IS 'Per-field evidence pointers linking extracted values back to source PDF pages and snippets.';

-- ============================================================================
-- CONFIG SETS & VERSIONS
-- Versioned actuarial configuration containers. Each config set can have
-- multiple versions; evaluations reference a specific version snapshot.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.actuarial_config_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,  -- e.g., 'turkish_market_defaults', 'premium_tier_config'
  description TEXT,
  config_type TEXT NOT NULL DEFAULT 'actuarial' CHECK (config_type IN ('actuarial', 'scenario', 'topsis', 'compliance')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.actuarial_config_set_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_set_id UUID NOT NULL REFERENCES public.actuarial_config_sets(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,

  -- The full configuration as JSONB
  -- Shape depends on config_type:
  --   actuarial: MonteCarloConfig + ContractQualityWeights + CoverageBreadthWeights
  --   scenario: RiskScenario[] per policy type
  --   topsis: TOPSISCriterion[] with weights
  --   compliance: Compliance rule parameters (SEDDK limits, DASK rates, etc.)
  config_data JSONB NOT NULL,

  -- Metadata
  change_summary TEXT,
  created_by UUID,  -- Admin user who created this version
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(config_set_id, version)
);

-- Indexes for config sets
CREATE INDEX IF NOT EXISTS idx_actuarial_config_sets_name
  ON public.actuarial_config_sets(name);

CREATE INDEX IF NOT EXISTS idx_actuarial_config_sets_active
  ON public.actuarial_config_sets(is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_actuarial_config_set_versions_config_set_id
  ON public.actuarial_config_set_versions(config_set_id);

CREATE INDEX IF NOT EXISTS idx_actuarial_config_set_versions_active
  ON public.actuarial_config_set_versions(is_active) WHERE is_active = true;

-- Auto-update updated_at on config_sets
CREATE OR REPLACE FUNCTION update_actuarial_config_sets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_actuarial_config_sets_updated_at
  BEFORE UPDATE ON public.actuarial_config_sets
  FOR EACH ROW EXECUTE FUNCTION update_actuarial_config_sets_updated_at();

COMMENT ON TABLE public.actuarial_config_sets IS 'Named actuarial configuration containers (e.g., scenario libraries, TOPSIS weights).';
COMMENT ON TABLE public.actuarial_config_set_versions IS 'Versioned snapshots of actuarial configurations. Evaluations reference a specific version.';

-- ============================================================================
-- EVALUATION RUNS
-- Links a policy evaluation to its extraction, config snapshot, and options.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.actuarial_evaluation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES public.policies(id) ON DELETE CASCADE,
  extraction_id UUID REFERENCES public.policy_extractions(id) ON DELETE SET NULL,

  -- Config snapshot references
  monte_carlo_config_version_id UUID REFERENCES public.actuarial_config_set_versions(id),
  scenario_config_version_id UUID REFERENCES public.actuarial_config_set_versions(id),
  topsis_config_version_id UUID REFERENCES public.actuarial_config_set_versions(id),
  compliance_config_version_id UUID REFERENCES public.actuarial_config_set_versions(id),

  -- Evaluation options used
  effective_date DATE,
  skip_semantic_analysis BOOLEAN DEFAULT false,
  skip_ranking BOOLEAN DEFAULT false,
  monte_carlo_simulations INTEGER DEFAULT 10000,
  monte_carlo_seed INTEGER,

  -- Run status
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  error_message TEXT,
  duration_ms INTEGER,

  -- Timestamps
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for evaluation_runs
CREATE INDEX IF NOT EXISTS idx_actuarial_evaluation_runs_policy_id
  ON public.actuarial_evaluation_runs(policy_id);

CREATE INDEX IF NOT EXISTS idx_actuarial_evaluation_runs_extraction_id
  ON public.actuarial_evaluation_runs(extraction_id);

CREATE INDEX IF NOT EXISTS idx_actuarial_evaluation_runs_status
  ON public.actuarial_evaluation_runs(status);

CREATE INDEX IF NOT EXISTS idx_actuarial_evaluation_runs_created_at
  ON public.actuarial_evaluation_runs(created_at DESC);

COMMENT ON TABLE public.actuarial_evaluation_runs IS 'Records each actuarial evaluation execution, linking policy → extraction → config versions.';

-- ============================================================================
-- EVALUATION RESULTS
-- Full evaluation output stored as JSONB for flexibility.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.actuarial_evaluation_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.actuarial_evaluation_runs(id) ON DELETE CASCADE,
  policy_id UUID NOT NULL REFERENCES public.policies(id) ON DELETE CASCADE,

  -- Summary fields for querying (denormalized from JSONB)
  eligible BOOLEAN NOT NULL,
  blocking_reason_count INTEGER DEFAULT 0,
  warning_count INTEGER DEFAULT 0,
  expected_oop_amount NUMERIC(12,2),
  expected_oop_currency TEXT DEFAULT 'TRY',
  contract_quality_score NUMERIC(5,2),
  needs_review BOOLEAN DEFAULT false,

  -- TOPSIS ranking (null if single-policy evaluation)
  topsis_closeness NUMERIC(6,4),
  topsis_rank INTEGER,
  topsis_grade TEXT CHECK (topsis_grade IN ('A', 'B', 'C', 'D', 'F')),

  -- Full result payload — stores the entire PolicyEvaluationResult
  result_data JSONB NOT NULL,

  -- Config snapshot reference string
  config_snapshot TEXT,  -- e.g., 'seddk-2026-v1 | mc-10000-seed42'

  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for evaluation_results
CREATE INDEX IF NOT EXISTS idx_actuarial_evaluation_results_run_id
  ON public.actuarial_evaluation_results(run_id);

CREATE INDEX IF NOT EXISTS idx_actuarial_evaluation_results_policy_id
  ON public.actuarial_evaluation_results(policy_id);

CREATE INDEX IF NOT EXISTS idx_actuarial_evaluation_results_eligible
  ON public.actuarial_evaluation_results(eligible);

CREATE INDEX IF NOT EXISTS idx_actuarial_evaluation_results_needs_review
  ON public.actuarial_evaluation_results(needs_review) WHERE needs_review = true;

CREATE INDEX IF NOT EXISTS idx_actuarial_evaluation_results_topsis_rank
  ON public.actuarial_evaluation_results(topsis_rank) WHERE topsis_rank IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_actuarial_evaluation_results_evaluated_at
  ON public.actuarial_evaluation_results(evaluated_at DESC);

-- GIN index on result_data for JSONB queries
CREATE INDEX IF NOT EXISTS idx_actuarial_evaluation_results_data
  ON public.actuarial_evaluation_results USING GIN (result_data);

COMMENT ON TABLE public.actuarial_evaluation_results IS 'Complete actuarial evaluation output. Summary fields denormalized for efficient querying; full result in JSONB.';

-- ============================================================================
-- FEATURE FLAG: actuarial_engine_enabled
-- Seeds the feature flag (default: false) using the 012 schema (key-based).
-- ============================================================================

INSERT INTO public.feature_flags (key, name, description, enabled, rollout_percentage)
VALUES (
  'actuarial_engine_enabled',
  'Actuarial Engine',
  'Enable the 4-layer actuarial evaluation engine (Monte Carlo EOOP, TOPSIS ranking, semantic exclusion analysis, compliance gates). When disabled, the existing policy evaluation system is used.',
  false,
  0
)
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- SEED DEFAULT CONFIG SETS
-- Pre-populate configuration containers so the engine has defaults on first run.
-- ============================================================================

-- Monte Carlo defaults
INSERT INTO public.actuarial_config_sets (name, description, config_type)
VALUES (
  'monte_carlo_defaults',
  'Default Monte Carlo simulation parameters for the actuarial engine',
  'actuarial'
)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.actuarial_config_set_versions (config_set_id, version, config_data, change_summary, is_active)
SELECT
  cs.id,
  1,
  '{"numSimulations": 10000, "confidenceInterval": 0.90, "seed": null, "contractQualityWeights": {"partsStandard": 0.35, "repairNetwork": 0.30, "rayicMethod": 0.35}, "coverageBreadthWeights": {"COLLISION": 0.20, "THEFT": 0.15, "FIRE": 0.10, "NATURAL_DISASTER": 0.10, "FLOOD": 0.10, "EARTHQUAKE": 0.10, "GLASS": 0.05, "PERSONAL_ACCIDENT": 0.05, "THIRD_PARTY_LIABILITY": 0.10, "LEGAL_PROTECTION": 0.05}}'::jsonb,
  'Initial Turkish market defaults',
  true
FROM public.actuarial_config_sets cs
WHERE cs.name = 'monte_carlo_defaults'
AND NOT EXISTS (
  SELECT 1 FROM public.actuarial_config_set_versions v
  WHERE v.config_set_id = cs.id AND v.version = 1
);

-- TOPSIS criteria defaults
INSERT INTO public.actuarial_config_sets (name, description, config_type)
VALUES (
  'topsis_criteria_defaults',
  'Default TOPSIS multi-criteria decision analysis weights',
  'topsis'
)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.actuarial_config_set_versions (config_set_id, version, config_data, change_summary, is_active)
SELECT
  cs.id,
  1,
  '{"criteria": [{"name": "eoop", "weight": 0.30, "direction": "cost"}, {"name": "premium", "weight": 0.20, "direction": "cost"}, {"name": "coverage_breadth", "weight": 0.20, "direction": "benefit"}, {"name": "compliance_score", "weight": 0.10, "direction": "benefit"}, {"name": "contract_quality", "weight": 0.10, "direction": "benefit"}, {"name": "deductible_exposure", "weight": 0.10, "direction": "cost"}]}'::jsonb,
  'Initial TOPSIS criteria with Turkish market weights',
  true
FROM public.actuarial_config_sets cs
WHERE cs.name = 'topsis_criteria_defaults'
AND NOT EXISTS (
  SELECT 1 FROM public.actuarial_config_set_versions v
  WHERE v.config_set_id = cs.id AND v.version = 1
);

-- Kasko scenario library defaults
INSERT INTO public.actuarial_config_sets (name, description, config_type)
VALUES (
  'kasko_scenarios',
  'Turkish kasko risk scenario library with market-calibrated frequencies and loss distributions',
  'scenario'
)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.actuarial_config_set_versions (config_set_id, version, config_data, change_summary, is_active)
SELECT
  cs.id,
  1,
  '{"scenarios": [{"code": "SCN_PARTIAL_COLLISION", "frequency": 0.06, "lossDistribution": {"type": "lognormal", "mu": 9.2, "sigma": 0.8}}, {"code": "SCN_TOTAL_LOSS", "frequency": 0.015, "lossDistribution": {"type": "lognormal", "mu": 11.5, "sigma": 0.6}}, {"code": "SCN_THEFT", "frequency": 0.008, "lossDistribution": {"type": "lognormal", "mu": 11.0, "sigma": 0.7}}, {"code": "SCN_FLOOD", "frequency": 0.012, "lossDistribution": {"type": "lognormal", "mu": 10.0, "sigma": 1.0}}, {"code": "SCN_EARTHQUAKE", "frequency": 0.005, "lossDistribution": {"type": "pareto", "alpha": 2.5, "xMin": 50000}}, {"code": "SCN_FIRE", "frequency": 0.003, "lossDistribution": {"type": "lognormal", "mu": 10.5, "sigma": 1.2}}, {"code": "SCN_GLASS", "frequency": 0.04, "lossDistribution": {"type": "lognormal", "mu": 7.5, "sigma": 0.5}}, {"code": "SCN_NATURAL_DISASTER", "frequency": 0.01, "lossDistribution": {"type": "lognormal", "mu": 10.2, "sigma": 1.0}}]}'::jsonb,
  'Initial kasko scenarios calibrated from TSB/SEDDK statistics',
  true
FROM public.actuarial_config_sets cs
WHERE cs.name = 'kasko_scenarios'
AND NOT EXISTS (
  SELECT 1 FROM public.actuarial_config_set_versions v
  WHERE v.config_set_id = cs.id AND v.version = 1
);

-- Compliance rules defaults
INSERT INTO public.actuarial_config_sets (name, description, config_type)
VALUES (
  'compliance_rules',
  'SEDDK/DASK/ZAS compliance rule parameters',
  'compliance'
)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.actuarial_config_set_versions (config_set_id, version, config_data, change_summary, is_active)
SELECT
  cs.id,
  1,
  '{"seddk": {"2025": {"bodilyInjuryPerPerson": 2700000, "bodilyInjuryPerAccident": 13500000, "materialDamagePerVehicle": 300000, "materialDamagePerAccident": 600000}, "2026": {"bodilyInjuryPerPerson": 3600000, "bodilyInjuryPerAccident": 18000000, "materialDamagePerVehicle": 400000, "materialDamagePerAccident": 800000}}, "dask": {"mandatoryDeductiblePercent": 2, "limits": {"2024": 2095462, "2025": 2800000, "2026": 3200000}}, "zas": {"mandatoryDeductiblePercent": 2, "draft": true}}'::jsonb,
  'Initial compliance rules: SEDDK 2025/2026 limits, DASK 2% deductible, ZAS draft',
  true
FROM public.actuarial_config_sets cs
WHERE cs.name = 'compliance_rules'
AND NOT EXISTS (
  SELECT 1 FROM public.actuarial_config_set_versions v
  WHERE v.config_set_id = cs.id AND v.version = 1
);
