/**
 * Prompt Service
 *
 * Centralized service for fetching AI prompts from the admin system.
 * Provides:
 * - Database-first retrieval with fallback to hardcoded prompts
 * - In-memory caching for performance
 * - Template variable rendering
 * - Prompt versioning support
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { logger } from '../lib/logger.js'

const log = logger.child('PromptService')

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
  variables: string[]
  isActive: boolean
  version: number
  defaultProvider?: string
  defaultModel?: string
  parameters?: Record<string, unknown>
}

export interface RenderedPrompt {
  systemPrompt: string
  userPrompt: string
  templateId: string
  templateName: string
  version: number
  provider?: string
  model?: string
  parameters?: Record<string, unknown>
}

// ============================================================================
// DATABASE CLIENT
// ============================================================================

let supabase: SupabaseClient | null = null

function getClient(): SupabaseClient | null {
  if (supabase) return supabase

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    log.warn('Supabase not configured, using fallback prompts')
    return null
  }

  supabase = createClient(url, serviceKey)
  return supabase
}

// ============================================================================
// CACHE
// ============================================================================

interface CacheEntry {
  template: PromptTemplate
  timestamp: number
}

const promptCache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

function getCached(key: string): PromptTemplate | null {
  const entry = promptCache.get(key)
  if (!entry) return null

  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    promptCache.delete(key)
    return null
  }

  return entry.template
}

function setCache(key: string, template: PromptTemplate): void {
  promptCache.set(key, { template, timestamp: Date.now() })
}

export function clearPromptCache(): void {
  promptCache.clear()
  log.info('Cache cleared')
}

// ============================================================================
// FALLBACK PROMPTS (hardcoded)
// These are used when database is unavailable
// ============================================================================

const FALLBACK_PROMPTS: Record<string, PromptTemplate> = {
  // Master extraction prompt
  'Policy Extraction - Master': {
    id: 'fallback-extraction-master',
    name: 'Policy Extraction - Master',
    description: 'Master extraction prompt (fallback)',
    category: 'extraction',
    version: 1,
    isActive: true,
    variables: ['document_text'],
    defaultProvider: 'openai',
    defaultModel: 'gpt-4o',
    parameters: { temperature: 0.1, maxTokens: 4096 },
    systemPrompt: `You are an expert insurance document analyst specializing in Turkish insurance policies.

Your task is to extract structured information from insurance policy documents.

## Guidelines:

1. **Language**: Documents may be in Turkish or English. Common Turkish terms:
   - Poliçe = Policy
   - Sigortalı = Insured
   - Sigorta Ettiren = Policyholder
   - Prim = Premium
   - Teminat = Coverage
   - Muafiyet = Deductible
   - Başlangıç Tarihi = Start Date
   - Bitiş Tarihi = End Date

2. **Policy Types**:
   - kasko = Comprehensive auto insurance
   - traffic = Mandatory traffic/liability insurance
   - home = Home/property insurance (Konut)
   - health = Health insurance (Sağlık)
   - life = Life insurance (Hayat)
   - dask = Earthquake insurance (mandatory)
   - business = Commercial/business insurance
   - nakliyat = Transportation/Cargo insurance

3. **Date Format**: Always convert dates to YYYY-MM-DD format

4. **Currency Detection**: Look for ₺, TL, TRY for Turkish Lira. Default to TRY.

5. **Confidence Scores**: Rate confidence 0-1 based on text clarity.

6. **Missing Information**: Use null for fields you cannot confidently extract.

Be thorough but accurate. It's better to return null than to guess incorrectly.`,
    userPromptTemplate: `Extract all relevant insurance policy information from this document and return it as JSON:

{{document_text}}

Return the extracted data following the schema provided.`,
  },

  // Chat prompt
  'Policy Chat Assistant': {
    id: 'fallback-chat-assistant',
    name: 'Policy Chat Assistant',
    description: 'Chat assistant (fallback)',
    category: 'chat',
    version: 1,
    isActive: true,
    variables: ['policy_context', 'user_message'],
    defaultProvider: 'openai',
    defaultModel: 'gpt-4o-mini',
    parameters: { temperature: 0.5, maxTokens: 2048 },
    systemPrompt: `You are an expert insurance policy assistant for the Turkish insurance market. You help users understand their insurance policies, answer questions about coverage, compare policies, and identify potential gaps or issues.

Key guidelines:
- Be helpful, professional, and concise
- When discussing coverage, always mention specific limits and deductibles when available
- If you're unsure about something, say so rather than making up information
- Use Turkish insurance terminology when appropriate (e.g., Kasko, DASK, Trafik Sigortası)
- Currency should be in TRY (Turkish Lira)
- When comparing policies, highlight key differences in coverage, limits, and exclusions
- If asked about something outside the scope of the provided policy information, politely redirect to the policy content

{{#if policy_context}}Policy Information:
{{policy_context}}
{{/if}}`,
    userPromptTemplate: `{{user_message}}`,
  },

  // OCR correction prompt
  'OCR Correction - Lightweight': {
    id: 'fallback-ocr-correction',
    name: 'OCR Correction - Lightweight',
    description: 'OCR correction (fallback)',
    category: 'ocr',
    version: 1,
    isActive: true,
    variables: ['raw_text'],
    defaultProvider: 'openai',
    defaultModel: 'gpt-4o-mini',
    parameters: { temperature: 0.2, maxTokens: 8192 },
    systemPrompt: `You are a document text normalizer for Turkish insurance documents. Fix OCR errors while preserving the original meaning exactly.

RULES:
1. Fix spaced Turkish characters in headings: B İ RLE Şİ K → BİRLEŞİK
2. Fix common Turkish word fragments: poli ç e → poliçe
3. Normalize whitespace: collapse multiple spaces
4. Remove obvious garbage: binary data, QR code artifacts
5. Preserve EXACTLY: numbers, dates, policy numbers, IDs, names

DO NOT:
- Paraphrase or rewrite any text
- Add or invent information
- Change the meaning of any sentence

Output the cleaned text only, no explanations.`,
    userPromptTemplate: `Please correct any OCR errors in this Turkish insurance document text:

{{raw_text}}

Return the corrected text only.`,
  },

  // Policy type detection
  'Policy Type Detection': {
    id: 'fallback-type-detection',
    name: 'Policy Type Detection',
    description: 'Policy type detection (fallback)',
    category: 'extraction',
    version: 1,
    isActive: true,
    variables: ['document_text'],
    defaultProvider: 'openai',
    defaultModel: 'gpt-4o-mini',
    parameters: { temperature: 0, maxTokens: 50 },
    systemPrompt: `Analyze this insurance document and determine the policy type.

Look for these indicators:
- KASKO: "Kasko", "Araç", "Plaka", "Şasi No", vehicle-related terms
- TRAFFIC: "Trafik Sigortası", "Zorunlu Mali Sorumluluk", "MTPL"
- HOME: "Konut", "Ev", "Daire", "Bina"
- HEALTH: "Sağlık", "Hastane", "Tedavi"
- LIFE: "Hayat", "Vefat", "Lehdar"
- DASK: "DASK", "Deprem", "Zorunlu Deprem Sigortası"
- BUSINESS: "İşyeri", "Ticari", "İşletme"
- NAKLIYAT: "Nakliyat", "Emtia", "Kargo", "CMR"

Return ONLY the policy type as a single word.`,
    userPromptTemplate: `Determine the policy type for this document:

{{document_text}}

Return only: kasko, traffic, home, health, life, dask, business, or nakliyat`,
  },
}

// ============================================================================
// PROMPT FETCHING
// ============================================================================

/**
 * Get a prompt template by ID
 */
export async function getPromptById(id: string): Promise<PromptTemplate | null> {
  // Check cache first
  const cacheKey = `id:${id}`
  const cached = getCached(cacheKey)
  if (cached) {
    return cached
  }

  // Try database
  const db = getClient()
  if (db) {
    try {
      const { data, error } = await db
        .from('prompt_templates')
        .select('*')
        .eq('id', id)
        .single()

      if (!error && data) {
        const template = mapFromDatabase(data)
        setCache(cacheKey, template)
        return template
      }
    } catch (err) {
      log.warn('Database error for id', { id, error: err instanceof Error ? err.message : String(err) })
    }
  }

  // Check fallback prompts by id
  const fallback = Object.values(FALLBACK_PROMPTS).find((p) => p.id === id)
  if (fallback) {
    log.info('Using fallback prompt', { id })
    return fallback
  }

  return null
}

/**
 * Get a prompt template by name
 */
export async function getPromptByName(name: string): Promise<PromptTemplate | null> {
  // Check cache first
  const cacheKey = `name:${name}`
  const cached = getCached(cacheKey)
  if (cached) {
    return cached
  }

  // Try database
  const db = getClient()
  if (db) {
    try {
      const { data, error } = await db
        .from('prompt_templates')
        .select('*')
        .eq('name', name)
        .eq('is_active', true)
        .single()

      if (!error && data) {
        const template = mapFromDatabase(data)
        setCache(cacheKey, template)
        return template
      }
    } catch (err) {
      log.warn('Database error for name', { name, error: err instanceof Error ? err.message : String(err) })
    }
  }

  // Fallback to hardcoded
  const fallback = FALLBACK_PROMPTS[name]
  if (fallback) {
    log.info('Using fallback prompt', { name })
    return fallback
  }

  return null
}

/**
 * Get all prompts for a category
 */
export async function getPromptsByCategory(category: PromptCategory): Promise<PromptTemplate[]> {
  const db = getClient()
  if (db) {
    try {
      const { data, error } = await db
        .from('prompt_templates')
        .select('*')
        .eq('category', category)
        .eq('is_active', true)
        .order('name')

      if (!error && data) {
        return data.map(mapFromDatabase)
      }
    } catch (err) {
      log.warn('Database error for category', { category, error: err instanceof Error ? err.message : String(err) })
    }
  }

  // Return fallback prompts for category
  return Object.values(FALLBACK_PROMPTS).filter((p) => p.category === category)
}

/**
 * Get all available prompts
 */
export async function getAllPrompts(): Promise<PromptTemplate[]> {
  const db = getClient()
  if (db) {
    try {
      const { data, error } = await db
        .from('prompt_templates')
        .select('*')
        .eq('is_active', true)
        .order('category')
        .order('name')

      if (!error && data) {
        return data.map(mapFromDatabase)
      }
    } catch (err) {
      log.warn('Database error', { error: err instanceof Error ? err.message : String(err) })
    }
  }

  return Object.values(FALLBACK_PROMPTS)
}

// ============================================================================
// PROMPT RENDERING
// ============================================================================

/**
 * Render a prompt template with variables
 */
export function renderTemplate(
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
 * Get a rendered prompt ready for use
 */
export async function getRenderedPrompt(
  name: string,
  variables: Record<string, string | undefined>
): Promise<RenderedPrompt | null> {
  const template = await getPromptByName(name)
  if (!template) {
    log.error('Prompt not found', { name })
    return null
  }

  return {
    systemPrompt: renderTemplate(template.systemPrompt, variables),
    userPrompt: renderTemplate(template.userPromptTemplate, variables),
    templateId: template.id,
    templateName: template.name,
    version: template.version,
    provider: template.defaultProvider,
    model: template.defaultModel,
    parameters: template.parameters,
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Get extraction prompt for a document
 */
export async function getExtractionPrompt(
  documentText: string,
  policyType?: string
): Promise<RenderedPrompt | null> {
  // Try type-specific prompt first
  if (policyType) {
    const typeSpecificName = getTypeSpecificPromptName(policyType)
    const typePrompt = await getRenderedPrompt(typeSpecificName, { document_text: documentText })
    if (typePrompt) return typePrompt
  }

  // Fall back to master extraction prompt
  return getRenderedPrompt('Policy Extraction - Master', { document_text: documentText })
}

/**
 * Get chat prompt
 */
export async function getChatPrompt(
  userMessage: string,
  policyContext?: string
): Promise<RenderedPrompt | null> {
  return getRenderedPrompt('Policy Chat Assistant', {
    user_message: userMessage,
    policy_context: policyContext,
  })
}

/**
 * Get OCR correction prompt
 */
export async function getOCRPrompt(rawText: string): Promise<RenderedPrompt | null> {
  return getRenderedPrompt('OCR Correction - Lightweight', { raw_text: rawText })
}

/**
 * Get policy type detection prompt
 */
export async function getTypeDetectionPrompt(documentText: string): Promise<RenderedPrompt | null> {
  return getRenderedPrompt('Policy Type Detection', { document_text: documentText })
}

// ============================================================================
// HELPERS
// ============================================================================

function getTypeSpecificPromptName(policyType: string): string {
  const typeMap: Record<string, string> = {
    kasko: 'Kasko Extraction',
    traffic: 'Traffic Insurance Extraction',
    home: 'Home Insurance Extraction',
    health: 'Health Insurance Extraction',
    life: 'Life Insurance Extraction',
    dask: 'DASK Extraction',
    business: 'Business Insurance Extraction',
    nakliyat: 'Nakliyat Insurance Extraction',
  }
  return typeMap[policyType.toLowerCase()] || 'Policy Extraction - Master'
}

function mapFromDatabase(row: Record<string, unknown>): PromptTemplate {
  return {
    id: row.id as string,
    name: row.name as string,
    description: row.description as string || '',
    category: row.category as PromptCategory,
    systemPrompt: row.system_prompt as string,
    userPromptTemplate: row.user_prompt_template as string,
    variables: (row.variables as string[]) || [],
    isActive: row.is_active as boolean,
    version: row.version as number || 1,
    defaultProvider: row.default_provider as string | undefined,
    defaultModel: row.default_model as string | undefined,
    parameters: row.parameters as Record<string, unknown> | undefined,
  }
}

// ============================================================================
// ADMIN OPERATIONS
// ============================================================================

/**
 * Update a prompt template (admin only)
 */
export async function updatePrompt(
  id: string,
  updates: Partial<Pick<PromptTemplate, 'name' | 'description' | 'systemPrompt' | 'userPromptTemplate' | 'isActive' | 'parameters'>>
): Promise<PromptTemplate | null> {
  const db = getClient()
  if (!db) {
    log.error('Cannot update: database not configured')
    return null
  }

  try {
    // Get current template to increment version
    const { data: current } = await db
      .from('prompt_templates')
      .select('version')
      .eq('id', id)
      .single()

    const newVersion = (current?.version || 0) + 1

    const { data, error } = await db
      .from('prompt_templates')
      .update({
        name: updates.name,
        description: updates.description,
        system_prompt: updates.systemPrompt,
        user_prompt_template: updates.userPromptTemplate,
        is_active: updates.isActive,
        parameters: updates.parameters,
        version: newVersion,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      log.error('Update error', { error: String(error) })
      return null
    }

    // Clear cache for this prompt
    clearPromptCache()

    // Create version record
    if (updates.systemPrompt || updates.userPromptTemplate) {
      await db.from('prompt_versions').insert({
        template_id: id,
        version: newVersion,
        system_prompt: data.system_prompt,
        user_prompt_template: data.user_prompt_template,
        variables: data.variables,
        change_notes: 'Updated via admin',
      })
    }

    return mapFromDatabase(data)
  } catch (err) {
    log.error('Update exception', { error: err instanceof Error ? err.message : String(err) })
    return null
  }
}

/**
 * Create a new prompt template (admin only)
 */
export async function createPrompt(
  template: Omit<PromptTemplate, 'id' | 'version'>
): Promise<PromptTemplate | null> {
  const db = getClient()
  if (!db) {
    log.error('Cannot create: database not configured')
    return null
  }

  try {
    const { data, error } = await db
      .from('prompt_templates')
      .insert({
        name: template.name,
        description: template.description,
        category: template.category,
        system_prompt: template.systemPrompt,
        user_prompt_template: template.userPromptTemplate,
        variables: template.variables,
        is_active: template.isActive,
        default_provider: template.defaultProvider,
        default_model: template.defaultModel,
        parameters: template.parameters,
        version: 1,
      })
      .select()
      .single()

    if (error) {
      log.error('Create error', { error: String(error) })
      return null
    }

    // Create initial version record
    await db.from('prompt_versions').insert({
      template_id: data.id,
      version: 1,
      system_prompt: data.system_prompt,
      user_prompt_template: data.user_prompt_template,
      variables: data.variables,
      change_notes: 'Initial version',
    })

    clearPromptCache()
    return mapFromDatabase(data)
  } catch (err) {
    log.error('Create exception', { error: err instanceof Error ? err.message : String(err) })
    return null
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  getPromptById,
  getPromptByName,
  getPromptsByCategory,
  getAllPrompts,
  getRenderedPrompt,
  getExtractionPrompt,
  getChatPrompt,
  getOCRPrompt,
  getTypeDetectionPrompt,
  renderTemplate,
  clearPromptCache,
  updatePrompt,
  createPrompt,
}
