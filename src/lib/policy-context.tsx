import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { toast } from 'sonner'
import { AnalyzedPolicy } from '@/types/policy'
import { samplePolicies } from '@/data/sample-policies'

// localStorage keys
const STORAGE_KEYS = {
  POLICIES: 'insurai_policies',
  HAS_INITIALIZED: 'insurai_initialized',
} as const

interface PolicyContextValue {
  policies: AnalyzedPolicy[]
  selectedPolicy: AnalyzedPolicy | null
  isLoading: boolean
  addPolicies: (policies: AnalyzedPolicy[]) => void
  deletePolicy: (id: string) => void
  selectPolicy: (id: string) => AnalyzedPolicy | null
  clearSelectedPolicy: () => void
  getPolicyById: (id: string) => AnalyzedPolicy | undefined
  clearAllPolicies: () => void
  resetToSamplePolicies: () => void
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

export function PolicyProvider({ children }: PolicyProviderProps) {
  const [policies, setPolicies] = useState<AnalyzedPolicy[]>([])
  const [selectedPolicy, setSelectedPolicy] = useState<AnalyzedPolicy | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Load policies from localStorage on mount
  useEffect(() => {
    const hasInitialized = localStorage.getItem(STORAGE_KEYS.HAS_INITIALIZED)

    if (hasInitialized) {
      // Load saved policies from localStorage
      const savedPolicies = loadFromStorage<AnalyzedPolicy[]>(STORAGE_KEYS.POLICIES, [])
      setPolicies(savedPolicies)
    } else {
      // First time: load sample policies and mark as initialized
      setPolicies(samplePolicies)
      saveToStorage(STORAGE_KEYS.POLICIES, samplePolicies)
      localStorage.setItem(STORAGE_KEYS.HAS_INITIALIZED, 'true')
    }

    setIsLoading(false)
  }, [])

  // Save policies to localStorage whenever they change (but not on initial load)
  useEffect(() => {
    if (!isLoading) {
      saveToStorage(STORAGE_KEYS.POLICIES, policies)
    }
  }, [policies, isLoading])

  const addPolicies = useCallback((newPolicies: AnalyzedPolicy[]) => {
    setPolicies((prev) => {
      // Filter out duplicates by ID
      const existingIds = new Set(prev.map((p) => p.id))
      const uniqueNew = newPolicies.filter((p) => !existingIds.has(p.id))
      return [...prev, ...uniqueNew]
    })
  }, [])

  const deletePolicy = useCallback((id: string) => {
    let policyToDelete: AnalyzedPolicy | undefined

    setPolicies((prev) => {
      policyToDelete = prev.find((p) => p.id === id)
      return prev.filter((p) => p.id !== id)
    })

    // Use setTimeout to access the policyToDelete after state update
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
  }, [])

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

  return (
    <PolicyContext.Provider
      value={{
        policies,
        selectedPolicy,
        isLoading,
        addPolicies,
        deletePolicy,
        selectPolicy,
        clearSelectedPolicy,
        getPolicyById,
        clearAllPolicies,
        resetToSamplePolicies,
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
