/**
 * Prompt Versioning and A/B Testing Middleware
 * Manages prompt templates with version control and A/B testing capabilities
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'

// ============================================================================
// TYPES
// ============================================================================

export type PromptCategory = 'extraction' | 'chat' | 'ocr' | 'analysis' | 'other'

export interface PromptTemplate {
  id: string
  name: string
  description: string
  category: PromptCategory
  systemPrompt: string
  userPromptTemplate: string
  variables: string[] // Extracted variable names from template
  isActive: boolean
  isDefault: boolean
  createdAt: string
  updatedAt: string
  createdBy?: string
}

export interface PromptVersion {
  id: string
  templateId: string
  version: number
  systemPrompt: string
  userPromptTemplate: string
  variables: string[]
  changeDescription: string
  createdAt: string
  createdBy?: string
  // Performance metrics
  usageCount: number
  successCount: number
  errorCount: number
  avgResponseTime: number
  avgTokensUsed: number
  avgCost: number
}

export interface ABTest {
  id: string
  name: string
  description: string
  templateId: string
  status: 'draft' | 'running' | 'paused' | 'completed' | 'cancelled'
  startDate?: string
  endDate?: string
  // Variants
  controlVersionId: string // The baseline version
  treatmentVersionIds: string[] // Versions being tested
  trafficAllocation: Record<string, number> // versionId -> percentage (0-100)
  // Metrics
  primaryMetric: 'success_rate' | 'response_time' | 'token_efficiency' | 'cost'
  minSampleSize: number
  // Results
  results?: ABTestResults
  createdAt: string
  updatedAt: string
  createdBy?: string
}

export interface ABTestResults {
  totalSamples: number
  byVersion: Record<string, VersionMetrics>
  winner?: string
  confidence?: number
  statisticallySignificant: boolean
  completedAt?: string
}

export interface VersionMetrics {
  versionId: string
  samples: number
  successRate: number
  avgResponseTime: number
  avgTokens: number
  avgCost: number
  // Statistical metrics
  standardDeviation?: number
  confidenceInterval?: [number, number]
}

export interface PromptUsageLog {
  id: string
  templateId: string
  versionId: string
  abTestId?: string
  provider: string
  model: string
  operation: string
  // Input
  inputVariables: Record<string, string>
  inputTokens: number
  // Output
  outputTokens: number
  responseTime: number
  success: boolean
  errorMessage?: string
  // Cost
  cost: number
  timestamp: string
  userId?: string
  sessionId?: string
}

// ============================================================================
// DATABASE CLIENT
// ============================================================================

let supabase: SupabaseClient | null = null

function getClient(): SupabaseClient | null {
  if (supabase) return supabase

  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    return null
  }

  supabase = createClient(url, serviceKey)
  return supabase
}

// ============================================================================
// IN-MEMORY STORAGE (fallback)
// ============================================================================

const templates: Map<string, PromptTemplate> = new Map()
const versions: Map<string, PromptVersion> = new Map()
const abTests: Map<string, ABTest> = new Map()
const usageLogs: PromptUsageLog[] = []

// Initialize default templates
function initializeDefaults(): void {
  if (templates.size > 0) return

  // Default extraction prompt
  const extractionTemplate: PromptTemplate = {
    id: 'extraction-default',
    name: 'Policy Extraction (Default)',
    description: 'Standard prompt for extracting policy data from Turkish insurance documents',
    category: 'extraction',
    systemPrompt: `You are an expert Turkish insurance document analyzer. Your task is to extract structured data from insurance policy documents.

Key guidelines:
- Extract all coverage types, limits, deductibles, and exclusions
- Identify policy number, provider, insured party, and dates
- Recognize Turkish insurance terminology (Kasko, DASK, Trafik Sigortası, etc.)
- Handle OCR errors gracefully (0/O confusion, 1/l/I confusion)
- Return data in the specified JSON format
- If information is unclear or missing, use null instead of guessing`,
    userPromptTemplate: `Extract all relevant insurance policy information from this document and return it as JSON:

{{document_text}}

Return the extracted data in the following JSON format:
{
  "policyNumber": string,
  "provider": string,
  "insuredPerson": string,
  "type": "kasko" | "traffic" | "home" | "health" | "life" | "dask" | "business",
  "startDate": "YYYY-MM-DD",
  "expiryDate": "YYYY-MM-DD",
  "premium": number,
  "coverage": number,
  "deductible": number,
  "coverages": [...],
  "exclusions": [...]
}`,
    variables: ['document_text'],
    isActive: true,
    isDefault: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  templates.set(extractionTemplate.id, extractionTemplate)

  // Create initial version
  const extractionVersion: PromptVersion = {
    id: 'extraction-default-v1',
    templateId: 'extraction-default',
    version: 1,
    systemPrompt: extractionTemplate.systemPrompt,
    userPromptTemplate: extractionTemplate.userPromptTemplate,
    variables: extractionTemplate.variables,
    changeDescription: 'Initial version',
    createdAt: new Date().toISOString(),
    usageCount: 0,
    successCount: 0,
    errorCount: 0,
    avgResponseTime: 0,
    avgTokensUsed: 0,
    avgCost: 0,
  }

  versions.set(extractionVersion.id, extractionVersion)

  // Default chat prompt
  const chatTemplate: PromptTemplate = {
    id: 'chat-default',
    name: 'Policy Chat Assistant (Default)',
    description: 'Standard prompt for policy Q&A chat',
    category: 'chat',
    systemPrompt: `You are an expert insurance policy assistant for the Turkish insurance market. You help users understand their insurance policies, answer questions about coverage, compare policies, and identify potential gaps or issues.

Key guidelines:
- Be helpful, professional, and concise
- When discussing coverage, always mention specific limits and deductibles when available
- If you're unsure about something, say so rather than making up information
- Use Turkish insurance terminology when appropriate (e.g., Kasko, DASK, Trafik Sigortası)
- Currency should be in TRY (Turkish Lira)
- When comparing policies, highlight key differences in coverage, limits, and exclusions
- If asked about something outside the scope of the provided policy information, politely redirect to the policy content

{{#if policy_context}}
Policy Information:
{{policy_context}}
{{/if}}`,
    userPromptTemplate: '{{user_message}}',
    variables: ['policy_context', 'user_message'],
    isActive: true,
    isDefault: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  templates.set(chatTemplate.id, chatTemplate)

  const chatVersion: PromptVersion = {
    id: 'chat-default-v1',
    templateId: 'chat-default',
    version: 1,
    systemPrompt: chatTemplate.systemPrompt,
    userPromptTemplate: chatTemplate.userPromptTemplate,
    variables: chatTemplate.variables,
    changeDescription: 'Initial version',
    createdAt: new Date().toISOString(),
    usageCount: 0,
    successCount: 0,
    errorCount: 0,
    avgResponseTime: 0,
    avgTokensUsed: 0,
    avgCost: 0,
  }

  versions.set(chatVersion.id, chatVersion)

  // OCR correction prompt
  const ocrTemplate: PromptTemplate = {
    id: 'ocr-correction-default',
    name: 'OCR Correction (Default)',
    description: 'Prompt for correcting OCR errors in scanned documents',
    category: 'ocr',
    systemPrompt: `You are an expert at correcting OCR errors in Turkish insurance documents. Your task is to fix common OCR mistakes while preserving the original meaning and structure.

Common OCR errors to fix:
- 0/O confusion (zero vs letter O)
- 1/l/I confusion (one vs lowercase L vs uppercase I)
- Turkish character issues (İ/I, Ş/S, Ğ/G, Ü/U, Ö/O, Ç/C)
- Broken words due to line breaks
- Missing spaces or extra spaces
- Special characters misread

Do NOT change:
- Policy numbers (preserve original, just fix obvious OCR errors)
- Names (preserve original spelling)
- Amounts and dates (only fix clear OCR errors)`,
    userPromptTemplate: `Please correct any OCR errors in this text while preserving its structure and meaning:

{{ocr_text}}

Return the corrected text only, without any explanations.`,
    variables: ['ocr_text'],
    isActive: true,
    isDefault: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  templates.set(ocrTemplate.id, ocrTemplate)

  const ocrVersion: PromptVersion = {
    id: 'ocr-correction-default-v1',
    templateId: 'ocr-correction-default',
    version: 1,
    systemPrompt: ocrTemplate.systemPrompt,
    userPromptTemplate: ocrTemplate.userPromptTemplate,
    variables: ocrTemplate.variables,
    changeDescription: 'Initial version',
    createdAt: new Date().toISOString(),
    usageCount: 0,
    successCount: 0,
    errorCount: 0,
    avgResponseTime: 0,
    avgTokensUsed: 0,
    avgCost: 0,
  }

  versions.set(ocrVersion.id, ocrVersion)
}

initializeDefaults()

// ============================================================================
// TEMPLATE MANAGEMENT
// ============================================================================

/**
 * Get all prompt templates
 */
export async function getTemplates(category?: PromptCategory): Promise<PromptTemplate[]> {
  const db = getClient()

  if (db) {
    let query = db.from('prompt_templates').select('*')

    if (category) {
      query = query.eq('category', category)
    }

    const { data, error } = await query.order('created_at', { ascending: false })

    if (!error && data) {
      return data.map(mapTemplateFromDb)
    }
  }

  // Fallback to in-memory
  let result = Array.from(templates.values())
  if (category) {
    result = result.filter((t) => t.category === category)
  }
  return result
}

/**
 * Get a specific template
 */
export async function getTemplate(id: string): Promise<PromptTemplate | null> {
  const db = getClient()

  if (db) {
    const { data, error } = await db
      .from('prompt_templates')
      .select('*')
      .eq('id', id)
      .single()

    if (!error && data) {
      return mapTemplateFromDb(data)
    }
  }

  return templates.get(id) || null
}

/**
 * Get default template for a category
 */
export async function getDefaultTemplate(category: PromptCategory): Promise<PromptTemplate | null> {
  const db = getClient()

  if (db) {
    const { data, error } = await db
      .from('prompt_templates')
      .select('*')
      .eq('category', category)
      .eq('is_default', true)
      .eq('is_active', true)
      .single()

    if (!error && data) {
      return mapTemplateFromDb(data)
    }
  }

  // Fallback to in-memory
  const result = Array.from(templates.values()).find(
    (t) => t.category === category && t.isDefault && t.isActive
  )
  return result || null
}

/**
 * Create a new template
 */
export async function createTemplate(
  template: Omit<PromptTemplate, 'id' | 'createdAt' | 'updatedAt' | 'variables'>
): Promise<PromptTemplate> {
  const now = new Date().toISOString()
  const id = `${template.category}-${Date.now()}`
  const variables = extractVariables(template.userPromptTemplate + template.systemPrompt)

  const newTemplate: PromptTemplate = {
    ...template,
    id,
    variables,
    createdAt: now,
    updatedAt: now,
  }

  const db = getClient()

  if (db) {
    const { data, error } = await db
      .from('prompt_templates')
      .insert({
        id: newTemplate.id,
        name: newTemplate.name,
        description: newTemplate.description,
        category: newTemplate.category,
        system_prompt: newTemplate.systemPrompt,
        user_prompt_template: newTemplate.userPromptTemplate,
        variables: newTemplate.variables,
        is_active: newTemplate.isActive,
        is_default: newTemplate.isDefault,
        created_by: newTemplate.createdBy,
      })
      .select()
      .single()

    if (!error && data) {
      // Create initial version
      await createVersion(newTemplate.id, {
        systemPrompt: newTemplate.systemPrompt,
        userPromptTemplate: newTemplate.userPromptTemplate,
        changeDescription: 'Initial version',
        createdBy: newTemplate.createdBy,
      })

      return mapTemplateFromDb(data)
    }
  }

  // Fallback to in-memory
  templates.set(id, newTemplate)

  // Create initial version
  await createVersion(id, {
    systemPrompt: newTemplate.systemPrompt,
    userPromptTemplate: newTemplate.userPromptTemplate,
    changeDescription: 'Initial version',
    createdBy: newTemplate.createdBy,
  })

  return newTemplate
}

/**
 * Update a template (creates a new version)
 */
export async function updateTemplate(
  id: string,
  updates: Partial<Pick<PromptTemplate, 'name' | 'description' | 'systemPrompt' | 'userPromptTemplate' | 'isActive' | 'isDefault'>>,
  changeDescription: string,
  updatedBy?: string
): Promise<PromptTemplate | null> {
  const existing = await getTemplate(id)
  if (!existing) return null

  const now = new Date().toISOString()
  const hasPromptChanges =
    (updates.systemPrompt && updates.systemPrompt !== existing.systemPrompt) ||
    (updates.userPromptTemplate && updates.userPromptTemplate !== existing.userPromptTemplate)

  const variables = hasPromptChanges
    ? extractVariables((updates.userPromptTemplate || existing.userPromptTemplate) + (updates.systemPrompt || existing.systemPrompt))
    : existing.variables

  const updatedTemplate: PromptTemplate = {
    ...existing,
    ...updates,
    variables,
    updatedAt: now,
  }

  const db = getClient()

  if (db) {
    const { data, error } = await db
      .from('prompt_templates')
      .update({
        name: updatedTemplate.name,
        description: updatedTemplate.description,
        system_prompt: updatedTemplate.systemPrompt,
        user_prompt_template: updatedTemplate.userPromptTemplate,
        variables: updatedTemplate.variables,
        is_active: updatedTemplate.isActive,
        is_default: updatedTemplate.isDefault,
        updated_at: now,
      })
      .eq('id', id)
      .select()
      .single()

    if (!error && data) {
      // Create new version if prompts changed
      if (hasPromptChanges) {
        await createVersion(id, {
          systemPrompt: updatedTemplate.systemPrompt,
          userPromptTemplate: updatedTemplate.userPromptTemplate,
          changeDescription,
          createdBy: updatedBy,
        })
      }

      return mapTemplateFromDb(data)
    }
  }

  // Fallback to in-memory
  templates.set(id, updatedTemplate)

  if (hasPromptChanges) {
    await createVersion(id, {
      systemPrompt: updatedTemplate.systemPrompt,
      userPromptTemplate: updatedTemplate.userPromptTemplate,
      changeDescription,
      createdBy: updatedBy,
    })
  }

  return updatedTemplate
}

/**
 * Delete a template (soft delete)
 */
export async function deleteTemplate(id: string): Promise<boolean> {
  const db = getClient()

  if (db) {
    const { error } = await db
      .from('prompt_templates')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id)

    return !error
  }

  const template = templates.get(id)
  if (template) {
    template.isActive = false
    return true
  }

  return false
}

function mapTemplateFromDb(row: Record<string, unknown>): PromptTemplate {
  return {
    id: row.id as string,
    name: row.name as string,
    description: row.description as string,
    category: row.category as PromptCategory,
    systemPrompt: row.system_prompt as string,
    userPromptTemplate: row.user_prompt_template as string,
    variables: (row.variables as string[]) || [],
    isActive: row.is_active as boolean,
    isDefault: row.is_default as boolean,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    createdBy: row.created_by as string | undefined,
  }
}

// ============================================================================
// VERSION MANAGEMENT
// ============================================================================

/**
 * Get all versions for a template
 */
export async function getVersions(templateId: string): Promise<PromptVersion[]> {
  const db = getClient()

  if (db) {
    const { data, error } = await db
      .from('prompt_versions')
      .select('*')
      .eq('template_id', templateId)
      .order('version', { ascending: false })

    if (!error && data) {
      return data.map(mapVersionFromDb)
    }
  }

  // Fallback to in-memory
  return Array.from(versions.values())
    .filter((v) => v.templateId === templateId)
    .sort((a, b) => b.version - a.version)
}

/**
 * Get a specific version
 */
export async function getVersion(versionId: string): Promise<PromptVersion | null> {
  const db = getClient()

  if (db) {
    const { data, error } = await db
      .from('prompt_versions')
      .select('*')
      .eq('id', versionId)
      .single()

    if (!error && data) {
      return mapVersionFromDb(data)
    }
  }

  return versions.get(versionId) || null
}

/**
 * Get latest version for a template
 */
export async function getLatestVersion(templateId: string): Promise<PromptVersion | null> {
  const db = getClient()

  if (db) {
    const { data, error } = await db
      .from('prompt_versions')
      .select('*')
      .eq('template_id', templateId)
      .order('version', { ascending: false })
      .limit(1)
      .single()

    if (!error && data) {
      return mapVersionFromDb(data)
    }
  }

  // Fallback to in-memory
  const templateVersions = Array.from(versions.values())
    .filter((v) => v.templateId === templateId)
    .sort((a, b) => b.version - a.version)

  return templateVersions[0] || null
}

/**
 * Create a new version
 */
export async function createVersion(
  templateId: string,
  data: {
    systemPrompt: string
    userPromptTemplate: string
    changeDescription: string
    createdBy?: string
  }
): Promise<PromptVersion> {
  const latestVersion = await getLatestVersion(templateId)
  const newVersionNumber = latestVersion ? latestVersion.version + 1 : 1
  const now = new Date().toISOString()
  const id = `${templateId}-v${newVersionNumber}`

  const newVersion: PromptVersion = {
    id,
    templateId,
    version: newVersionNumber,
    systemPrompt: data.systemPrompt,
    userPromptTemplate: data.userPromptTemplate,
    variables: extractVariables(data.userPromptTemplate + data.systemPrompt),
    changeDescription: data.changeDescription,
    createdAt: now,
    createdBy: data.createdBy,
    usageCount: 0,
    successCount: 0,
    errorCount: 0,
    avgResponseTime: 0,
    avgTokensUsed: 0,
    avgCost: 0,
  }

  const db = getClient()

  if (db) {
    const { data: row, error } = await db
      .from('prompt_versions')
      .insert({
        id: newVersion.id,
        template_id: newVersion.templateId,
        version: newVersion.version,
        system_prompt: newVersion.systemPrompt,
        user_prompt_template: newVersion.userPromptTemplate,
        variables: newVersion.variables,
        change_description: newVersion.changeDescription,
        created_by: newVersion.createdBy,
        usage_count: 0,
        success_count: 0,
        error_count: 0,
        avg_response_time: 0,
        avg_tokens_used: 0,
        avg_cost: 0,
      })
      .select()
      .single()

    if (!error && row) {
      return mapVersionFromDb(row)
    }
  }

  // Fallback to in-memory
  versions.set(id, newVersion)
  return newVersion
}

/**
 * Rollback to a specific version
 */
export async function rollbackToVersion(
  templateId: string,
  versionId: string,
  rolledBackBy?: string
): Promise<PromptTemplate | null> {
  const version = await getVersion(versionId)
  if (!version || version.templateId !== templateId) return null

  return updateTemplate(
    templateId,
    {
      systemPrompt: version.systemPrompt,
      userPromptTemplate: version.userPromptTemplate,
    },
    `Rollback to version ${version.version}`,
    rolledBackBy
  )
}

function mapVersionFromDb(row: Record<string, unknown>): PromptVersion {
  return {
    id: row.id as string,
    templateId: row.template_id as string,
    version: row.version as number,
    systemPrompt: row.system_prompt as string,
    userPromptTemplate: row.user_prompt_template as string,
    variables: (row.variables as string[]) || [],
    changeDescription: row.change_description as string,
    createdAt: row.created_at as string,
    createdBy: row.created_by as string | undefined,
    usageCount: row.usage_count as number,
    successCount: row.success_count as number,
    errorCount: row.error_count as number,
    avgResponseTime: row.avg_response_time as number,
    avgTokensUsed: row.avg_tokens_used as number,
    avgCost: row.avg_cost as number,
  }
}

// ============================================================================
// A/B TESTING
// ============================================================================

/**
 * Get all A/B tests
 */
export async function getABTests(status?: ABTest['status']): Promise<ABTest[]> {
  const db = getClient()

  if (db) {
    let query = db.from('ab_tests').select('*')

    if (status) {
      query = query.eq('status', status)
    }

    const { data, error } = await query.order('created_at', { ascending: false })

    if (!error && data) {
      return data.map(mapABTestFromDb)
    }
  }

  // Fallback to in-memory
  let result = Array.from(abTests.values())
  if (status) {
    result = result.filter((t) => t.status === status)
  }
  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/**
 * Get a specific A/B test
 */
export async function getABTest(id: string): Promise<ABTest | null> {
  const db = getClient()

  if (db) {
    const { data, error } = await db
      .from('ab_tests')
      .select('*')
      .eq('id', id)
      .single()

    if (!error && data) {
      return mapABTestFromDb(data)
    }
  }

  return abTests.get(id) || null
}

/**
 * Create a new A/B test
 */
export async function createABTest(
  test: Omit<ABTest, 'id' | 'createdAt' | 'updatedAt' | 'results'>
): Promise<ABTest> {
  const now = new Date().toISOString()
  const id = `ab-${Date.now()}`

  const newTest: ABTest = {
    ...test,
    id,
    createdAt: now,
    updatedAt: now,
  }

  const db = getClient()

  if (db) {
    const { data, error } = await db
      .from('ab_tests')
      .insert({
        id: newTest.id,
        name: newTest.name,
        description: newTest.description,
        template_id: newTest.templateId,
        status: newTest.status,
        start_date: newTest.startDate,
        end_date: newTest.endDate,
        control_version_id: newTest.controlVersionId,
        treatment_version_ids: newTest.treatmentVersionIds,
        traffic_allocation: newTest.trafficAllocation,
        primary_metric: newTest.primaryMetric,
        min_sample_size: newTest.minSampleSize,
        created_by: newTest.createdBy,
      })
      .select()
      .single()

    if (!error && data) {
      return mapABTestFromDb(data)
    }
  }

  // Fallback to in-memory
  abTests.set(id, newTest)
  return newTest
}

/**
 * Update A/B test status
 */
export async function updateABTestStatus(
  id: string,
  status: ABTest['status']
): Promise<ABTest | null> {
  const now = new Date().toISOString()
  const db = getClient()

  if (db) {
    const updates: Record<string, unknown> = {
      status,
      updated_at: now,
    }

    if (status === 'running' && !abTests.get(id)?.startDate) {
      updates.start_date = now
    }

    if (status === 'completed' || status === 'cancelled') {
      updates.end_date = now
    }

    const { data, error } = await db
      .from('ab_tests')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (!error && data) {
      return mapABTestFromDb(data)
    }
  }

  // Fallback to in-memory
  const test = abTests.get(id)
  if (test) {
    test.status = status
    test.updatedAt = now
    if (status === 'running' && !test.startDate) {
      test.startDate = now
    }
    if (status === 'completed' || status === 'cancelled') {
      test.endDate = now
    }
    return test
  }

  return null
}

/**
 * Select a version based on A/B test allocation
 */
export async function selectVersionForABTest(
  templateId: string
): Promise<{ versionId: string; abTestId?: string } | null> {
  // Find running A/B test for this template
  const runningTests = await getABTests('running')
  const activeTest = runningTests.find((t) => t.templateId === templateId)

  if (!activeTest) {
    // No active test, return latest version
    const latest = await getLatestVersion(templateId)
    return latest ? { versionId: latest.id } : null
  }

  // Select version based on traffic allocation
  const random = Math.random() * 100
  let cumulative = 0

  for (const [versionId, percentage] of Object.entries(activeTest.trafficAllocation)) {
    cumulative += percentage
    if (random < cumulative) {
      return { versionId, abTestId: activeTest.id }
    }
  }

  // Fallback to control version
  return { versionId: activeTest.controlVersionId, abTestId: activeTest.id }
}

/**
 * Calculate A/B test results
 */
export async function calculateABTestResults(testId: string): Promise<ABTestResults | null> {
  const test = await getABTest(testId)
  if (!test) return null

  // Get all versions involved in the test
  const allVersionIds = [test.controlVersionId, ...test.treatmentVersionIds]
  const versionMetrics: Record<string, VersionMetrics> = {}
  let totalSamples = 0

  for (const versionId of allVersionIds) {
    const logs = usageLogs.filter(
      (log) => log.abTestId === testId && log.versionId === versionId
    )

    const samples = logs.length
    totalSamples += samples

    if (samples === 0) {
      versionMetrics[versionId] = {
        versionId,
        samples: 0,
        successRate: 0,
        avgResponseTime: 0,
        avgTokens: 0,
        avgCost: 0,
      }
      continue
    }

    const successCount = logs.filter((l) => l.success).length
    const totalResponseTime = logs.reduce((sum, l) => sum + l.responseTime, 0)
    const totalTokens = logs.reduce((sum, l) => sum + l.inputTokens + l.outputTokens, 0)
    const totalCost = logs.reduce((sum, l) => sum + l.cost, 0)

    versionMetrics[versionId] = {
      versionId,
      samples,
      successRate: successCount / samples,
      avgResponseTime: totalResponseTime / samples,
      avgTokens: totalTokens / samples,
      avgCost: totalCost / samples,
    }
  }

  // Determine winner based on primary metric
  let winner: string | undefined
  let bestValue = -Infinity

  for (const [versionId, metrics] of Object.entries(versionMetrics)) {
    let value: number
    switch (test.primaryMetric) {
      case 'success_rate':
        value = metrics.successRate
        break
      case 'response_time':
        value = -metrics.avgResponseTime // Lower is better
        break
      case 'token_efficiency':
        value = -metrics.avgTokens // Lower is better
        break
      case 'cost':
        value = -metrics.avgCost // Lower is better
        break
    }

    if (value > bestValue && metrics.samples >= test.minSampleSize) {
      bestValue = value
      winner = versionId
    }
  }

  // Simple statistical significance check (would use proper statistical tests in production)
  const controlMetrics = versionMetrics[test.controlVersionId]
  const statisticallySignificant =
    winner !== undefined &&
    winner !== test.controlVersionId &&
    controlMetrics.samples >= test.minSampleSize &&
    totalSamples >= test.minSampleSize * 2

  const results: ABTestResults = {
    totalSamples,
    byVersion: versionMetrics,
    winner,
    confidence: statisticallySignificant ? 0.95 : 0.5, // Simplified
    statisticallySignificant,
  }

  // Update test with results
  const db = getClient()
  if (db) {
    await db
      .from('ab_tests')
      .update({ results, updated_at: new Date().toISOString() })
      .eq('id', testId)
  }

  test.results = results
  return results
}

function mapABTestFromDb(row: Record<string, unknown>): ABTest {
  return {
    id: row.id as string,
    name: row.name as string,
    description: row.description as string,
    templateId: row.template_id as string,
    status: row.status as ABTest['status'],
    startDate: row.start_date as string | undefined,
    endDate: row.end_date as string | undefined,
    controlVersionId: row.control_version_id as string,
    treatmentVersionIds: (row.treatment_version_ids as string[]) || [],
    trafficAllocation: (row.traffic_allocation as Record<string, number>) || {},
    primaryMetric: row.primary_metric as ABTest['primaryMetric'],
    minSampleSize: row.min_sample_size as number,
    results: row.results as ABTestResults | undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    createdBy: row.created_by as string | undefined,
  }
}

// ============================================================================
// USAGE TRACKING
// ============================================================================

/**
 * Log prompt usage
 */
export async function logPromptUsage(usage: Omit<PromptUsageLog, 'id'>): Promise<void> {
  const id = `usage-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  const log: PromptUsageLog = { id, ...usage }

  const db = getClient()

  if (db) {
    await db.from('prompt_usage_logs').insert({
      id: log.id,
      template_id: log.templateId,
      version_id: log.versionId,
      ab_test_id: log.abTestId,
      provider: log.provider,
      model: log.model,
      operation: log.operation,
      input_variables: log.inputVariables,
      input_tokens: log.inputTokens,
      output_tokens: log.outputTokens,
      response_time: log.responseTime,
      success: log.success,
      error_message: log.errorMessage,
      cost: log.cost,
      user_id: log.userId,
      session_id: log.sessionId,
    })
  }

  // Update version metrics
  await updateVersionMetrics(log.versionId, {
    responseTime: log.responseTime,
    tokens: log.inputTokens + log.outputTokens,
    cost: log.cost,
    success: log.success,
  })

  // Store in memory for quick access
  usageLogs.push(log)
  if (usageLogs.length > 10000) {
    usageLogs.splice(0, usageLogs.length - 10000)
  }
}

/**
 * Update version metrics with new usage data
 */
async function updateVersionMetrics(
  versionId: string,
  metrics: { responseTime: number; tokens: number; cost: number; success: boolean }
): Promise<void> {
  const version = await getVersion(versionId)
  if (!version) return

  const newUsageCount = version.usageCount + 1
  const newSuccessCount = version.successCount + (metrics.success ? 1 : 0)
  const newErrorCount = version.errorCount + (metrics.success ? 0 : 1)

  // Running average calculations
  const newAvgResponseTime =
    (version.avgResponseTime * version.usageCount + metrics.responseTime) / newUsageCount
  const newAvgTokens =
    (version.avgTokensUsed * version.usageCount + metrics.tokens) / newUsageCount
  const newAvgCost =
    (version.avgCost * version.usageCount + metrics.cost) / newUsageCount

  const db = getClient()

  if (db) {
    await db
      .from('prompt_versions')
      .update({
        usage_count: newUsageCount,
        success_count: newSuccessCount,
        error_count: newErrorCount,
        avg_response_time: newAvgResponseTime,
        avg_tokens_used: newAvgTokens,
        avg_cost: newAvgCost,
      })
      .eq('id', versionId)
  }

  // Update in-memory
  const inMemoryVersion = versions.get(versionId)
  if (inMemoryVersion) {
    inMemoryVersion.usageCount = newUsageCount
    inMemoryVersion.successCount = newSuccessCount
    inMemoryVersion.errorCount = newErrorCount
    inMemoryVersion.avgResponseTime = newAvgResponseTime
    inMemoryVersion.avgTokensUsed = newAvgTokens
    inMemoryVersion.avgCost = newAvgCost
  }
}

/**
 * Get usage statistics for a template
 */
export async function getTemplateStats(
  templateId: string,
  startDate?: string,
  endDate?: string
): Promise<{
  totalUsage: number
  successRate: number
  avgResponseTime: number
  avgCost: number
  byVersion: Array<{ versionId: string; version: number; stats: VersionMetrics }>
}> {
  const templateVersions = await getVersions(templateId)

  let totalUsage = 0
  let totalSuccess = 0
  let totalResponseTime = 0
  let totalCost = 0

  const byVersion = templateVersions.map((v) => {
    totalUsage += v.usageCount
    totalSuccess += v.successCount
    totalResponseTime += v.avgResponseTime * v.usageCount
    totalCost += v.avgCost * v.usageCount

    return {
      versionId: v.id,
      version: v.version,
      stats: {
        versionId: v.id,
        samples: v.usageCount,
        successRate: v.usageCount > 0 ? v.successCount / v.usageCount : 0,
        avgResponseTime: v.avgResponseTime,
        avgTokens: v.avgTokensUsed,
        avgCost: v.avgCost,
      },
    }
  })

  return {
    totalUsage,
    successRate: totalUsage > 0 ? totalSuccess / totalUsage : 0,
    avgResponseTime: totalUsage > 0 ? totalResponseTime / totalUsage : 0,
    avgCost: totalUsage > 0 ? totalCost / totalUsage : 0,
    byVersion,
  }
}

// ============================================================================
// PROMPT RENDERING
// ============================================================================

/**
 * Extract variable names from a template string
 */
export function extractVariables(template: string): string[] {
  const regex = /\{\{([^}]+)\}\}/g
  const variables: Set<string> = new Set()

  let match
  while ((match = regex.exec(template)) !== null) {
    // Handle conditional variables like {{#if var}} and {{/if}}
    const varName = match[1].trim()
    if (!varName.startsWith('#') && !varName.startsWith('/')) {
      variables.add(varName)
    } else if (varName.startsWith('#if ')) {
      variables.add(varName.replace('#if ', '').trim())
    }
  }

  return Array.from(variables)
}

/**
 * Render a template with variables
 */
export function renderPrompt(
  template: string,
  variables: Record<string, string | undefined>
): string {
  let result = template

  // Handle conditional blocks {{#if var}}...{{/if}}
  const conditionalRegex = /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g
  result = result.replace(conditionalRegex, (_, varName, content) => {
    return variables[varName] ? content : ''
  })

  // Replace simple variables {{var}}
  const simpleRegex = /\{\{(\w+)\}\}/g
  result = result.replace(simpleRegex, (_, varName) => {
    return variables[varName] || ''
  })

  return result.trim()
}

/**
 * Get rendered prompts for an operation
 */
export async function getRenderedPrompts(
  category: PromptCategory,
  variables: Record<string, string | undefined>,
  options?: {
    templateId?: string
    versionId?: string
    useABTest?: boolean
  }
): Promise<{
  systemPrompt: string
  userPrompt: string
  templateId: string
  versionId: string
  abTestId?: string
} | null> {
  let template: PromptTemplate | null = null
  let version: PromptVersion | null = null
  let abTestId: string | undefined

  if (options?.versionId) {
    // Use specific version
    version = await getVersion(options.versionId)
    if (!version) return null
    template = await getTemplate(version.templateId)
  } else if (options?.templateId) {
    // Use specific template (latest version)
    template = await getTemplate(options.templateId)
    if (!template) return null

    if (options.useABTest !== false) {
      const selection = await selectVersionForABTest(template.id)
      if (selection) {
        version = await getVersion(selection.versionId)
        abTestId = selection.abTestId
      }
    }

    if (!version) {
      version = await getLatestVersion(template.id)
    }
  } else {
    // Use default template for category
    template = await getDefaultTemplate(category)
    if (!template) return null

    if (options?.useABTest !== false) {
      const selection = await selectVersionForABTest(template.id)
      if (selection) {
        version = await getVersion(selection.versionId)
        abTestId = selection.abTestId
      }
    }

    if (!version) {
      version = await getLatestVersion(template.id)
    }
  }

  if (!template || !version) return null

  return {
    systemPrompt: renderPrompt(version.systemPrompt, variables),
    userPrompt: renderPrompt(version.userPromptTemplate, variables),
    templateId: template.id,
    versionId: version.id,
    abTestId,
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Templates
  getTemplates,
  getTemplate,
  getDefaultTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  // Versions
  getVersions,
  getVersion,
  getLatestVersion,
  createVersion,
  rollbackToVersion,
  // A/B Testing
  getABTests,
  getABTest,
  createABTest,
  updateABTestStatus,
  selectVersionForABTest,
  calculateABTestResults,
  // Usage
  logPromptUsage,
  getTemplateStats,
  // Rendering
  extractVariables,
  renderPrompt,
  getRenderedPrompts,
}
