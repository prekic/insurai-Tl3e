/**
 * Settings Templates
 *
 * Predefined configuration profiles that admins can apply with one click.
 * Each template overrides a subset of the 108+ configurable settings.
 */

export interface SettingsTemplateOverride {
  category: string
  key: string
  value: unknown
}

export interface SettingsTemplate {
  id: string
  name: string
  description: string
  icon: string // Lucide icon name
  color: string // Tailwind color prefix (e.g., 'blue', 'green')
  overrides: SettingsTemplateOverride[]
  tags: string[]
}

/**
 * High Performance: Fastest extraction, highest accuracy, more API resources
 */
const HIGH_PERFORMANCE: SettingsTemplate = {
  id: 'high_performance',
  name: 'High Performance',
  description:
    'Maximize extraction accuracy and speed with higher resource usage. Best for production environments with high throughput needs.',
  icon: 'Rocket',
  color: 'blue',
  tags: ['speed', 'accuracy', 'production'],
  overrides: [
    // AI: Use best models with higher resource allocation
    { category: 'ai', key: 'max_tokens', value: 8192 },
    { category: 'ai', key: 'temperature', value: 0.05 },
    { category: 'ai', key: 'extraction_timeout_ms', value: 120000 },
    { category: 'ai', key: 'enable_fallback', value: true },
    { category: 'ai', key: 'consensus_enabled', value: true },
    { category: 'ai', key: 'consensus_agreement_threshold', value: 0.85 },
    { category: 'ai', key: 'min_confidence', value: 0.8 },
    // Rate limits: Higher throughput
    { category: 'rate_limits', key: 'ai_extraction_max_requests', value: 40 },
    { category: 'rate_limits', key: 'ocr_max_requests', value: 60 },
    { category: 'rate_limits', key: 'chat_max_requests', value: 120 },
    // OCR: More aggressive quality checks
    { category: 'ocr', key: 'skip_ocr_threshold', value: 0.9 },
    { category: 'ocr', key: 'selective_ocr_threshold', value: 0.65 },
    { category: 'ocr', key: 'timeout_seconds', value: 60 },
    // UI: Faster feedback
    { category: 'ui', key: 'extraction_progress_interval_ms', value: 5000 },
  ],
}

/**
 * Cost Optimized: Minimize API costs while maintaining acceptable quality
 */
const COST_OPTIMIZED: SettingsTemplate = {
  id: 'cost_optimized',
  name: 'Cost Optimized',
  description:
    'Reduce API costs by using lighter models and fewer calls. Suitable for development, testing, or budget-conscious deployments.',
  icon: 'Wallet',
  color: 'green',
  tags: ['budget', 'savings', 'development'],
  overrides: [
    // AI: Use backup (cheaper) models, reduce token usage
    { category: 'ai', key: 'openai_extraction_model', value: 'gpt-4o-mini' },
    { category: 'ai', key: 'anthropic_extraction_model', value: 'claude-3-5-haiku-latest' },
    { category: 'ai', key: 'max_tokens', value: 2048 },
    { category: 'ai', key: 'temperature', value: 0.1 },
    { category: 'ai', key: 'extraction_timeout_ms', value: 60000 },
    { category: 'ai', key: 'enable_fallback', value: false },
    { category: 'ai', key: 'consensus_enabled', value: false },
    // Rate limits: Lower to reduce costs
    { category: 'rate_limits', key: 'ai_extraction_max_requests', value: 10 },
    { category: 'rate_limits', key: 'ocr_max_requests', value: 15 },
    { category: 'rate_limits', key: 'chat_max_requests', value: 30 },
    // OCR: Skip OCR more aggressively
    { category: 'ocr', key: 'skip_ocr_threshold', value: 0.7 },
    { category: 'ocr', key: 'selective_ocr_threshold', value: 0.45 },
    { category: 'ocr', key: 'timeout_seconds', value: 20 },
    { category: 'ocr', key: 'max_pages_quick_analysis', value: 3 },
  ],
}

/**
 * Balanced: System defaults - the recommended middle ground
 */
const BALANCED: SettingsTemplate = {
  id: 'balanced',
  name: 'Balanced (Default)',
  description:
    'The recommended configuration balancing accuracy, speed, and cost. Resets all settings to their default values.',
  icon: 'Scale',
  color: 'gray',
  tags: ['default', 'recommended', 'balanced'],
  overrides: [
    // AI defaults
    { category: 'ai', key: 'openai_extraction_model', value: 'gpt-4o' },
    { category: 'ai', key: 'openai_backup_model', value: 'gpt-4o-mini' },
    { category: 'ai', key: 'anthropic_extraction_model', value: 'claude-sonnet-4-20250514' },
    { category: 'ai', key: 'anthropic_backup_model', value: 'claude-3-5-haiku-latest' },
    { category: 'ai', key: 'max_tokens', value: 4096 },
    { category: 'ai', key: 'temperature', value: 0.1 },
    { category: 'ai', key: 'chat_temperature', value: 0.7 },
    { category: 'ai', key: 'min_confidence', value: 0.7 },
    { category: 'ai', key: 'extraction_timeout_ms', value: 90000 },
    { category: 'ai', key: 'preferred_provider', value: 'auto' },
    { category: 'ai', key: 'enable_fallback', value: true },
    { category: 'ai', key: 'consensus_enabled', value: true },
    { category: 'ai', key: 'consensus_agreement_threshold', value: 0.8 },
    // Evaluation defaults
    { category: 'evaluation', key: 'weight_premium', value: 20 },
    { category: 'evaluation', key: 'weight_coverage', value: 30 },
    { category: 'evaluation', key: 'weight_deductible', value: 15 },
    { category: 'evaluation', key: 'weight_compliance', value: 20 },
    { category: 'evaluation', key: 'weight_value', value: 15 },
    { category: 'evaluation', key: 'grade_a_threshold', value: 90 },
    { category: 'evaluation', key: 'grade_b_threshold', value: 80 },
    { category: 'evaluation', key: 'grade_c_threshold', value: 70 },
    { category: 'evaluation', key: 'grade_d_threshold', value: 60 },
    { category: 'evaluation', key: 'strict_compliance', value: true },
    { category: 'evaluation', key: 'include_optional_coverages', value: true },
    { category: 'evaluation', key: 'use_regional_benchmarks', value: true },
    // Rate limits defaults
    { category: 'rate_limits', key: 'ai_extraction_max_requests', value: 20 },
    { category: 'rate_limits', key: 'ocr_max_requests', value: 30 },
    { category: 'rate_limits', key: 'chat_max_requests', value: 60 },
    { category: 'rate_limits', key: 'health_max_requests', value: 60 },
    { category: 'rate_limits', key: 'auth_max_attempts', value: 10 },
    // OCR defaults
    { category: 'ocr', key: 'chars_per_page_threshold', value: 200 },
    { category: 'ocr', key: 'skip_ocr_threshold', value: 0.85 },
    { category: 'ocr', key: 'selective_ocr_threshold', value: 0.6 },
    { category: 'ocr', key: 'timeout_seconds', value: 30 },
    { category: 'ocr', key: 'max_pages_quick_analysis', value: 5 },
  ],
}

/**
 * Strict Compliance: Maximum regulatory compliance focus
 */
const STRICT_COMPLIANCE: SettingsTemplate = {
  id: 'strict_compliance',
  name: 'Strict Compliance',
  description:
    'Emphasize regulatory compliance and coverage quality in evaluations. Best for brokers and compliance officers.',
  icon: 'ShieldCheck',
  color: 'purple',
  tags: ['compliance', 'regulatory', 'brokers'],
  overrides: [
    // AI: Higher confidence requirements
    { category: 'ai', key: 'min_confidence', value: 0.85 },
    { category: 'ai', key: 'consensus_enabled', value: true },
    { category: 'ai', key: 'consensus_agreement_threshold', value: 0.9 },
    // Evaluation: Weight compliance and coverage heavily
    { category: 'evaluation', key: 'weight_premium', value: 10 },
    { category: 'evaluation', key: 'weight_coverage', value: 35 },
    { category: 'evaluation', key: 'weight_deductible', value: 10 },
    { category: 'evaluation', key: 'weight_compliance', value: 30 },
    { category: 'evaluation', key: 'weight_value', value: 15 },
    { category: 'evaluation', key: 'strict_compliance', value: true },
    { category: 'evaluation', key: 'include_optional_coverages', value: true },
    { category: 'evaluation', key: 'use_regional_benchmarks', value: true },
    // Stricter grade thresholds
    { category: 'evaluation', key: 'grade_a_threshold', value: 95 },
    { category: 'evaluation', key: 'grade_b_threshold', value: 85 },
    { category: 'evaluation', key: 'grade_c_threshold', value: 75 },
    { category: 'evaluation', key: 'grade_d_threshold', value: 65 },
    // Gap analysis: Flag more gaps
    { category: 'gap_analysis', key: 'missing_coverage_threshold', value: 40 },
    { category: 'gap_analysis', key: 'critical_importance_threshold', value: 85 },
    { category: 'gap_analysis', key: 'underinsured_threshold', value: 60 },
    { category: 'gap_analysis', key: 'penalty_critical_missing', value: 20 },
    { category: 'gap_analysis', key: 'penalty_recommended_missing', value: 12 },
    // Fuzzy matching: Tighter thresholds
    { category: 'fuzzy_matching', key: 'default_threshold', value: 0.9 },
    { category: 'fuzzy_matching', key: 'policy_number_threshold', value: 0.9 },
    { category: 'fuzzy_matching', key: 'provider_name_threshold', value: 0.85 },
  ],
}

/**
 * Quick Demo: Fast extraction for demos and presentations
 */
const QUICK_DEMO: SettingsTemplate = {
  id: 'quick_demo',
  name: 'Quick Demo',
  description:
    'Optimized for fast demos and presentations. Short timeouts, relaxed validation, and faster UI updates.',
  icon: 'Presentation',
  color: 'amber',
  tags: ['demo', 'presentation', 'fast'],
  overrides: [
    // AI: Faster but lower quality
    { category: 'ai', key: 'openai_extraction_model', value: 'gpt-4o-mini' },
    { category: 'ai', key: 'max_tokens', value: 2048 },
    { category: 'ai', key: 'extraction_timeout_ms', value: 45000 },
    { category: 'ai', key: 'enable_fallback', value: false },
    { category: 'ai', key: 'consensus_enabled', value: false },
    { category: 'ai', key: 'min_confidence', value: 0.5 },
    // Rate limits: Allow rapid testing
    { category: 'rate_limits', key: 'ai_extraction_max_requests', value: 60 },
    { category: 'rate_limits', key: 'chat_max_requests', value: 200 },
    // OCR: Skip when possible for speed
    { category: 'ocr', key: 'skip_ocr_threshold', value: 0.6 },
    { category: 'ocr', key: 'timeout_seconds', value: 15 },
    { category: 'ocr', key: 'max_pages_quick_analysis', value: 2 },
    // UI: Faster feedback
    { category: 'ui', key: 'extraction_progress_interval_ms', value: 3000 },
    { category: 'ui', key: 'toast_success_duration_ms', value: 2000 },
  ],
}

/**
 * All available templates
 */
export const SETTINGS_TEMPLATES: SettingsTemplate[] = [
  BALANCED,
  HIGH_PERFORMANCE,
  COST_OPTIMIZED,
  STRICT_COMPLIANCE,
  QUICK_DEMO,
]

/**
 * Get a template by ID
 */
export function getTemplate(id: string): SettingsTemplate | undefined {
  return SETTINGS_TEMPLATES.find((t) => t.id === id)
}

/**
 * Compute the diff between current settings and a template.
 * Returns only the overrides that would actually change a value.
 */
export function computeTemplateDiff(
  template: SettingsTemplate,
  currentSettings: Record<string, Array<{ key: string; value: unknown }>>
): {
  changes: Array<{
    category: string
    key: string
    currentValue: unknown
    newValue: unknown
  }>
  unchanged: number
} {
  const changes: Array<{
    category: string
    key: string
    currentValue: unknown
    newValue: unknown
  }> = []
  let unchanged = 0

  for (const override of template.overrides) {
    const categorySettings = currentSettings[override.category] || []
    const current = categorySettings.find((s) => s.key === override.key)
    const currentValue = current?.value

    // Compare values (handle type coercion for numbers stored as strings)
    const normalizedCurrent =
      typeof currentValue === 'string' && !isNaN(Number(currentValue))
        ? Number(currentValue)
        : currentValue
    const normalizedNew = override.value

    if (JSON.stringify(normalizedCurrent) !== JSON.stringify(normalizedNew)) {
      changes.push({
        category: override.category,
        key: override.key,
        currentValue,
        newValue: override.value,
      })
    } else {
      unchanged++
    }
  }

  return { changes, unchanged }
}

/**
 * Get category display name
 */
export function getCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    ai: 'AI',
    evaluation: 'Evaluation',
    rate_limits: 'Rate Limits',
    ocr: 'OCR',
    fuzzy_matching: 'Fuzzy Matching',
    gap_analysis: 'Gap Analysis',
    ui: 'UI',
    email: 'Email',
  }
  return labels[category] || category
}
