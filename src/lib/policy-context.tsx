import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { toast } from 'sonner'
import { AnalyzedPolicy } from '@/types/policy'
import { samplePolicies } from '@/data/sample-policies'
import {
  isSupabaseConfigured,
  fetchPolicies as fetchSupabasePolicies,
  fetchPolicy as fetchSupabasePolicy,
  createPolicy as createSupabasePolicy,
  updatePolicy as updateSupabasePolicy,
  deleteSupabasePolicy,
  searchPolicies as searchSupabasePolicies,
  getPolicyStats as getSupabasePolicyStats,
  type PolicyRow,
  type PolicyInsert,
  type PolicyUpdate,
} from '@/lib/supabase'
import { useAuth } from '@/lib/supabase/auth-context'

// localStorage keys
const STORAGE_KEYS = {
  POLICIES: 'insurai_policies',
  HAS_INITIALIZED: 'insurai_initialized',
} as const

interface PolicyStats {
  total: number
  active: number
  expiring: number
  expired: number
  byType: Record<string, number>
  totalCoverage: number
  totalPremium: number
}

interface PolicyContextValue {
  policies: AnalyzedPolicy[]
  selectedPolicy: AnalyzedPolicy | null
  isLoading: boolean
  isSaving: boolean
  searchQuery: string
  searchResults: AnalyzedPolicy[] | null
  stats: PolicyStats | null
  // CRUD operations
  addPolicies: (policies: AnalyzedPolicy[]) => Promise<void>
  updatePolicy: (id: string, updates: Partial<AnalyzedPolicy>) => Promise<void>
  deletePolicy: (id: string) => Promise<void>
  // Selection
  selectPolicy: (id: string) => AnalyzedPolicy | null
  clearSelectedPolicy: () => void
  getPolicyById: (id: string) => AnalyzedPolicy | undefined
  fetchPolicyById: (id: string) => Promise<AnalyzedPolicy | null>
  // Bulk operations
  clearAllPolicies: () => void
  resetToSamplePolicies: () => void
  // Refresh and search
  refreshPolicies: () => Promise<void>
  refreshStats: () => Promise<void>
  searchPolicies: (query: string) => Promise<void>
  clearSearch: () => void
  // Status
  isUsingSupabase: boolean
}

const PolicyContext = createContext<PolicyContextValue | null>(null)

interface PolicyProviderProps {
  children: ReactNode
}

// Helper to safely parse JSON from localStorage
function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key)
    if (stored) {
      return JSON.parse(stored) as T
    }
  } catch (error) {
    console.error(`Failed to load ${key} from localStorage:`, error)
  }
  return fallback
}

// Helper to safely save to localStorage
function saveToStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (error) {
    console.error(`Failed to save ${key} to localStorage:`, error)
  }
}

// Convert PolicyRow from Supabase to AnalyzedPolicy
function policyRowToAnalyzedPolicy(row: PolicyRow): AnalyzedPolicy {
  const rawData = row.raw_data || {}

  return {
    id: row.id,
    policyNumber: row.policy_number,
    provider: row.provider,
    logo: row.logo || '',
    type: row.type,
    typeTr: row.type_tr,
    coverage: Number(row.coverage),
    premium: Number(row.premium),
    monthlyPremium: Number(row.premium) / 12,
    deductible: Number(row.deductible),
    startDate: row.start_date,
    expiryDate: row.expiry_date,
    status: row.status,
    insuredPerson: row.insured_person,
    location: row.location || undefined,
    documentType: row.document_type,
    uploadDate: row.upload_date,
    fileName: row.document_type,
    // Coverage details
    coverages: rawData.coverages || [],
    exclusions: rawData.exclusions || [],
    specialConditions: rawData.specialConditions || [],
    insuranceLine: rawData.insuranceLine || row.type_tr,
    // AI analysis
    aiConfidence: rawData.aiConfidence || 0.85,
    aiInsights: rawData.aiInsights || [],
    marketComparison: rawData.marketComparison,
    // Risk assessment
    riskScore: rawData.riskScore,
    riskActions: rawData.riskActions,
    // Gap analysis
    gapAnalysis: rawData.gapAnalysis,
    gapActions: rawData.gapActions,
  }
}

// Convert AnalyzedPolicy to PolicyInsert for Supabase
function analyzedPolicyToInsert(policy: AnalyzedPolicy, userId: string): PolicyInsert {
  return {
    user_id: userId,
    policy_number: policy.policyNumber,
    provider: policy.provider,
    type: policy.type,
    type_tr: policy.typeTr,
    coverage: policy.coverage,
    premium: policy.premium,
    deductible: policy.deductible,
    start_date: policy.startDate,
    expiry_date: policy.expiryDate,
    status: policy.status,
    insured_person: policy.insuredPerson || 'Unknown',
    location: policy.location,
    document_type: policy.documentType,
    upload_date: policy.uploadDate,
    logo: policy.logo,
    raw_data: {
      coverages: policy.coverages,
      exclusions: policy.exclusions,
      specialConditions: policy.specialConditions,
      insuranceLine: policy.insuranceLine,
      aiConfidence: policy.aiConfidence,
      aiInsights: policy.aiInsights,
      marketComparison: policy.marketComparison,
      riskScore: policy.riskScore,
      riskActions: policy.riskActions,
      gapAnalysis: policy.gapAnalysis,
      gapActions: policy.gapActions,
    },
  }
}

// Convert partial AnalyzedPolicy updates to PolicyUpdate for Supabase
function analyzedPolicyToUpdate(updates: Partial<AnalyzedPolicy>): PolicyUpdate {
  const result: PolicyUpdate = {}

  if (updates.policyNumber !== undefined) result.policy_number = updates.policyNumber
  if (updates.provider !== undefined) result.provider = updates.provider
  if (updates.type !== undefined) result.type = updates.type
  if (updates.typeTr !== undefined) result.type_tr = updates.typeTr
  if (updates.coverage !== undefined) result.coverage = updates.coverage
  if (updates.premium !== undefined) result.premium = updates.premium
  if (updates.deductible !== undefined) result.deductible = updates.deductible
  if (updates.startDate !== undefined) result.start_date = updates.startDate
  if (updates.expiryDate !== undefined) result.expiry_date = updates.expiryDate
  if (updates.status !== undefined) result.status = updates.status
  if (updates.insuredPerson !== undefined) result.insured_person = updates.insuredPerson
  if (updates.location !== undefined) result.location = updates.location
  if (updates.documentType !== undefined) result.document_type = updates.documentType
  if (updates.logo !== undefined) result.logo = updates.logo

  // Handle raw_data updates
  const hasRawDataUpdates =
    updates.coverages !== undefined ||
    updates.exclusions !== undefined ||
    updates.specialConditions !== undefined ||
    updates.insuranceLine !== undefined ||
    updates.aiConfidence !== undefined ||
    updates.aiInsights !== undefined ||
    updates.marketComparison !== undefined ||
    updates.riskScore !== undefined ||
    updates.riskActions !== undefined ||
    updates.gapAnalysis !== undefined ||
    updates.gapActions !== undefined

  if (hasRawDataUpdates) {
    result.raw_data = {
      coverages: updates.coverages,
      exclusions: updates.exclusions,
      specialConditions: updates.specialConditions,
      insuranceLine: updates.insuranceLine,
      aiConfidence: updates.aiConfidence,
      aiInsights: updates.aiInsights,
      marketComparison: updates.marketComparison,
      riskScore: updates.riskScore,
      riskActions: updates.riskActions,
      gapAnalysis: updates.gapAnalysis,
      gapActions: updates.gapActions,
    }
  }

  return result
}

export function PolicyProvider({ children }: PolicyProviderProps) {
  const [policies, setPolicies] = useState<AnalyzedPolicy[]>([])
  const [selectedPolicy, setSelectedPolicy] = useState<AnalyzedPolicy | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<AnalyzedPolicy[] | null>(null)
  const [stats, setStats] = useState<PolicyStats | null>(null)
  const { user, isConfigured: authConfigured } = useAuth()

  const useSupabase = authConfigured && isSupabaseConfigured() && !!user

  // Fetch policies from Supabase or localStorage
  const loadPolicies = useCallback(async () => {
    setIsLoading(true)

    try {
      if (useSupabase) {
        // Fetch from Supabase
        const rows = await fetchSupabasePolicies()
        const fetchedPolicies = rows.map(policyRowToAnalyzedPolicy)
        setPolicies(fetchedPolicies)
      } else {
        // Load from localStorage
        const hasInitialized = localStorage.getItem(STORAGE_KEYS.HAS_INITIALIZED)

        if (hasInitialized) {
          const savedPolicies = loadFromStorage<AnalyzedPolicy[]>(STORAGE_KEYS.POLICIES, [])
          setPolicies(savedPolicies)
        } else {
          // First time: load sample policies
          setPolicies(samplePolicies)
          saveToStorage(STORAGE_KEYS.POLICIES, samplePolicies)
          localStorage.setItem(STORAGE_KEYS.HAS_INITIALIZED, 'true')
        }
      }
    } catch (error) {
      console.error('Failed to load policies:', error)
      // Fall back to localStorage on error
      const savedPolicies = loadFromStorage<AnalyzedPolicy[]>(STORAGE_KEYS.POLICIES, samplePolicies)
      setPolicies(savedPolicies)
    } finally {
      setIsLoading(false)
    }
  }, [useSupabase])

  // Load policies on mount and when auth state changes
  useEffect(() => {
    loadPolicies()
  }, [loadPolicies])

  // Save policies to localStorage when not using Supabase
  useEffect(() => {
    if (!isLoading && !useSupabase) {
      saveToStorage(STORAGE_KEYS.POLICIES, policies)
    }
  }, [policies, isLoading, useSupabase])

  const refreshPolicies = useCallback(async () => {
    await loadPolicies()
  }, [loadPolicies])

  const addPolicies = useCallback(
    async (newPolicies: AnalyzedPolicy[]) => {
      setIsSaving(true)
      try {
        if (useSupabase && user) {
          // Save to Supabase
          for (const policy of newPolicies) {
            const insert = analyzedPolicyToInsert(policy, user.id)
            await createSupabasePolicy(insert)
          }
          // Refresh from Supabase to get the server-generated IDs
          await loadPolicies()
          toast.success('Policies saved', {
            description: `${newPolicies.length} policy(ies) saved to your account.`,
          })
        } else {
          // Save to local state (localStorage will be updated via effect)
          setPolicies((prev) => {
            const existingIds = new Set(prev.map((p) => p.id))
            const uniqueNew = newPolicies.filter((p) => !existingIds.has(p.id))
            return [...prev, ...uniqueNew]
          })
        }
      } catch (error) {
        console.error('Failed to save policies:', error)
        toast.error('Failed to save policies', {
          description: error instanceof Error ? error.message : 'Please try again.',
        })
        throw error
      } finally {
        setIsSaving(false)
      }
    },
    [useSupabase, user, loadPolicies]
  )

  const updatePolicy = useCallback(
    async (id: string, updates: Partial<AnalyzedPolicy>) => {
      setIsSaving(true)
      try {
        if (useSupabase) {
          // Update in Supabase
          const supabaseUpdates = analyzedPolicyToUpdate(updates)
          const updatedRow = await updateSupabasePolicy(id, supabaseUpdates)
          const updatedPolicy = policyRowToAnalyzedPolicy(updatedRow)

          // Update local state
          setPolicies((prev) =>
            prev.map((p) => (p.id === id ? updatedPolicy : p))
          )

          // Update selected policy if it's the one being updated
          setSelectedPolicy((prev) =>
            prev?.id === id ? updatedPolicy : prev
          )

          toast.success('Policy updated', {
            description: 'Your changes have been saved.',
          })
        } else {
          // Update in local state
          setPolicies((prev) =>
            prev.map((p) => (p.id === id ? { ...p, ...updates } : p))
          )

          setSelectedPolicy((prev) =>
            prev?.id === id ? { ...prev, ...updates } : prev
          )
        }
      } catch (error) {
        console.error('Failed to update policy:', error)
        toast.error('Failed to update policy', {
          description: error instanceof Error ? error.message : 'Please try again.',
        })
        throw error
      } finally {
        setIsSaving(false)
      }
    },
    [useSupabase]
  )

  const deletePolicy = useCallback(
    async (id: string) => {
      let policyToDelete: AnalyzedPolicy | undefined
      setIsSaving(true)

      try {
        if (useSupabase) {
          // Delete from Supabase
          policyToDelete = policies.find((p) => p.id === id)
          await deleteSupabasePolicy(id)
          setPolicies((prev) => prev.filter((p) => p.id !== id))

          // Clear selected if deleted
          setSelectedPolicy((prev) => (prev?.id === id ? null : prev))

          if (policyToDelete) {
            toast.success('Policy deleted', {
              description: `${policyToDelete.provider} ${policyToDelete.typeTr} policy has been removed.`,
            })
          }
        } else {
          // Delete from local state
          setPolicies((prev) => {
            policyToDelete = prev.find((p) => p.id === id)
            return prev.filter((p) => p.id !== id)
          })

          setSelectedPolicy((prev) => (prev?.id === id ? null : prev))

          setTimeout(() => {
            if (policyToDelete) {
              toast.success('Policy deleted', {
                description: `${policyToDelete.provider} ${policyToDelete.typeTr} policy has been removed.`,
                action: {
                  label: 'Undo',
                  onClick: () => {
                    if (policyToDelete) {
                      setPolicies((prev) => [...prev, policyToDelete as AnalyzedPolicy])
                      toast.info('Policy restored', {
                        description: 'The policy has been restored to your dashboard.',
                      })
                    }
                  },
                },
              })
            }
          }, 0)
        }
      } catch (error) {
        console.error('Failed to delete policy:', error)
        toast.error('Failed to delete policy', {
          description: error instanceof Error ? error.message : 'Please try again.',
        })
        throw error
      } finally {
        setIsSaving(false)
      }
    },
    [useSupabase, policies]
  )

  const selectPolicy = useCallback(
    (id: string): AnalyzedPolicy | null => {
      const policy = policies.find((p) => p.id === id) || null
      setSelectedPolicy(policy)
      return policy
    },
    [policies]
  )

  const clearSelectedPolicy = useCallback(() => {
    setSelectedPolicy(null)
  }, [])

  const getPolicyById = useCallback(
    (id: string): AnalyzedPolicy | undefined => {
      return policies.find((p) => p.id === id)
    },
    [policies]
  )

  const fetchPolicyById = useCallback(
    async (id: string): Promise<AnalyzedPolicy | null> => {
      // First check local cache
      const cached = policies.find((p) => p.id === id)
      if (cached) return cached

      // Fetch from Supabase if configured
      if (useSupabase) {
        try {
          const row = await fetchSupabasePolicy(id)
          if (row) {
            return policyRowToAnalyzedPolicy(row)
          }
        } catch (error) {
          console.error('Failed to fetch policy:', error)
        }
      }

      return null
    },
    [policies, useSupabase]
  )

  const refreshStats = useCallback(async () => {
    if (useSupabase) {
      try {
        const supabaseStats = await getSupabasePolicyStats()
        setStats(supabaseStats)
      } catch (error) {
        console.error('Failed to fetch stats:', error)
      }
    } else {
      // Calculate stats from local policies
      const localStats: PolicyStats = {
        total: policies.length,
        active: policies.filter((p) => p.status === 'active').length,
        expiring: policies.filter((p) => p.status === 'expiring').length,
        expired: policies.filter((p) => p.status === 'expired').length,
        byType: {},
        totalCoverage: policies.reduce((sum, p) => sum + p.coverage, 0),
        totalPremium: policies.reduce((sum, p) => sum + p.premium, 0),
      }

      for (const policy of policies) {
        localStats.byType[policy.type] = (localStats.byType[policy.type] || 0) + 1
      }

      setStats(localStats)
    }
  }, [useSupabase, policies])

  // Auto-refresh stats when policies change
  useEffect(() => {
    if (!isLoading) {
      refreshStats()
    }
  }, [policies, isLoading, refreshStats])

  const clearAllPolicies = useCallback(() => {
    setPolicies([])
    setSelectedPolicy(null)
    toast.success('All policies cleared', {
      description: 'Your policy dashboard has been cleared.',
    })
  }, [])

  const resetToSamplePolicies = useCallback(() => {
    setPolicies(samplePolicies)
    setSelectedPolicy(null)
    toast.success('Sample policies loaded', {
      description: `${samplePolicies.length} sample policies have been loaded.`,
    })
  }, [])

  const searchPolicies = useCallback(
    async (query: string) => {
      setSearchQuery(query)

      if (!query.trim()) {
        setSearchResults(null)
        return
      }

      if (useSupabase) {
        // Search via Supabase
        try {
          const rows = await searchSupabasePolicies(query)
          const results = rows.map(policyRowToAnalyzedPolicy)
          setSearchResults(results)
        } catch (error) {
          console.error('Search failed:', error)
          // Fallback to local search
          const results = policies.filter(
            (p) =>
              p.policyNumber.toLowerCase().includes(query.toLowerCase()) ||
              p.provider.toLowerCase().includes(query.toLowerCase()) ||
              p.insuredPerson?.toLowerCase().includes(query.toLowerCase()) ||
              p.typeTr.toLowerCase().includes(query.toLowerCase())
          )
          setSearchResults(results)
        }
      } else {
        // Local search
        const results = policies.filter(
          (p) =>
            p.policyNumber.toLowerCase().includes(query.toLowerCase()) ||
            p.provider.toLowerCase().includes(query.toLowerCase()) ||
            p.insuredPerson?.toLowerCase().includes(query.toLowerCase()) ||
            p.typeTr.toLowerCase().includes(query.toLowerCase()) ||
            p.location?.toLowerCase().includes(query.toLowerCase())
        )
        setSearchResults(results)
      }
    },
    [useSupabase, policies]
  )

  const clearSearch = useCallback(() => {
    setSearchQuery('')
    setSearchResults(null)
  }, [])

  return (
    <PolicyContext.Provider
      value={{
        policies,
        selectedPolicy,
        isLoading,
        isSaving,
        searchQuery,
        searchResults,
        stats,
        // CRUD operations
        addPolicies,
        updatePolicy,
        deletePolicy,
        // Selection
        selectPolicy,
        clearSelectedPolicy,
        getPolicyById,
        fetchPolicyById,
        // Bulk operations
        clearAllPolicies,
        resetToSamplePolicies,
        // Refresh and search
        refreshPolicies,
        refreshStats,
        searchPolicies,
        clearSearch,
        // Status
        isUsingSupabase: useSupabase,
      }}
    >
      {children}
    </PolicyContext.Provider>
  )
}

export function usePolicies() {
  const context = useContext(PolicyContext)
  if (!context) {
    throw new Error('usePolicies must be used within a PolicyProvider')
  }
  return context
}

// Helper hook to get dashboard-formatted policies
export function useDashboardPolicies() {
  const { policies } = usePolicies()

  return policies.map((p) => ({
    id: p.id,
    policyNumber: p.policyNumber,
    provider: p.provider,
    logo: p.logo,
    type: p.typeTr,
    coverage: p.coverage,
    premium: p.premium,
    deductible: p.deductible,
    startDate: p.startDate,
    expiryDate: p.expiryDate,
    status: p.status,
    uploadDate: p.uploadDate,
    documentType: p.documentType,
    insuredPerson: p.insuredPerson,
    location: p.location,
  }))
}
