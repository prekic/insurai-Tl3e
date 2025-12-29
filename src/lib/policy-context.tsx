import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { toast } from 'sonner'
import { AnalyzedPolicy } from '@/types/policy'
import { samplePolicies } from '@/data/sample-policies'
import {
  isSupabaseConfigured,
  fetchPolicies as fetchSupabasePolicies,
  createPolicy as createSupabasePolicy,
  deleteSupabasePolicy,
  searchPolicies as searchSupabasePolicies,
  type PolicyRow,
  type PolicyInsert,
} from '@/lib/supabase'
import { useAuth } from '@/lib/supabase/auth-context'

// localStorage keys
const STORAGE_KEYS = {
  POLICIES: 'insurai_policies',
  HAS_INITIALIZED: 'insurai_initialized',
} as const

interface PolicyContextValue {
  policies: AnalyzedPolicy[]
  selectedPolicy: AnalyzedPolicy | null
  isLoading: boolean
  searchQuery: string
  searchResults: AnalyzedPolicy[] | null
  addPolicies: (policies: AnalyzedPolicy[]) => void
  deletePolicy: (id: string) => void
  selectPolicy: (id: string) => AnalyzedPolicy | null
  clearSelectedPolicy: () => void
  getPolicyById: (id: string) => AnalyzedPolicy | undefined
  clearAllPolicies: () => void
  resetToSamplePolicies: () => void
  refreshPolicies: () => Promise<void>
  searchPolicies: (query: string) => Promise<void>
  clearSearch: () => void
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
  return {
    id: row.id,
    policyNumber: row.policy_number,
    provider: row.provider,
    logo: row.logo || '',
    type: row.type,
    typeTr: row.type_tr,
    coverage: row.coverage,
    premium: row.premium,
    monthlyPremium: row.premium / 12,
    deductible: row.deductible,
    startDate: row.start_date,
    expiryDate: row.expiry_date,
    status: row.status,
    insuredPerson: row.insured_person,
    location: row.location || undefined,
    documentType: row.document_type,
    uploadDate: row.upload_date,
    fileName: row.document_type,
    coverages: row.raw_data?.coverages || [],
    exclusions: row.raw_data?.exclusions || [],
    specialConditions: row.raw_data?.specialConditions || [],
    insuranceLine: row.raw_data?.insuranceLine || row.type_tr,
    aiConfidence: row.raw_data?.aiConfidence || 0.85,
    aiInsights: row.raw_data?.aiInsights || [],
    marketComparison: row.raw_data?.marketComparison,
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
    },
  }
}

export function PolicyProvider({ children }: PolicyProviderProps) {
  const [policies, setPolicies] = useState<AnalyzedPolicy[]>([])
  const [selectedPolicy, setSelectedPolicy] = useState<AnalyzedPolicy | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<AnalyzedPolicy[] | null>(null)
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
      if (useSupabase && user) {
        // Save to Supabase
        try {
          for (const policy of newPolicies) {
            const insert = analyzedPolicyToInsert(policy, user.id)
            await createSupabasePolicy(insert)
          }
          // Refresh from Supabase to get the server-generated IDs
          await loadPolicies()
        } catch (error) {
          console.error('Failed to save policies to Supabase:', error)
          toast.error('Failed to save policies')
        }
      } else {
        // Save to local state (localStorage will be updated via effect)
        setPolicies((prev) => {
          const existingIds = new Set(prev.map((p) => p.id))
          const uniqueNew = newPolicies.filter((p) => !existingIds.has(p.id))
          return [...prev, ...uniqueNew]
        })
      }
    },
    [useSupabase, user, loadPolicies]
  )

  const deletePolicy = useCallback(
    async (id: string) => {
      let policyToDelete: AnalyzedPolicy | undefined

      if (useSupabase) {
        // Delete from Supabase
        try {
          policyToDelete = policies.find((p) => p.id === id)
          await deleteSupabasePolicy(id)
          setPolicies((prev) => prev.filter((p) => p.id !== id))

          if (policyToDelete) {
            toast.success('Policy deleted', {
              description: `${policyToDelete.provider} ${policyToDelete.typeTr} policy has been removed.`,
            })
          }
        } catch (error) {
          console.error('Failed to delete policy from Supabase:', error)
          toast.error('Failed to delete policy')
        }
      } else {
        // Delete from local state
        setPolicies((prev) => {
          policyToDelete = prev.find((p) => p.id === id)
          return prev.filter((p) => p.id !== id)
        })

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
        searchQuery,
        searchResults,
        addPolicies,
        deletePolicy,
        selectPolicy,
        clearSelectedPolicy,
        getPolicyById,
        clearAllPolicies,
        resetToSamplePolicies,
        refreshPolicies,
        searchPolicies,
        clearSearch,
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
