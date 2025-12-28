import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { toast } from 'sonner'
import { AnalyzedPolicy } from '@/types/policy'
import { samplePolicies } from '@/data/sample-policies'

interface PolicyContextValue {
  policies: AnalyzedPolicy[]
  selectedPolicy: AnalyzedPolicy | null
  addPolicies: (policies: AnalyzedPolicy[]) => void
  deletePolicy: (id: string) => void
  selectPolicy: (id: string) => AnalyzedPolicy | null
  clearSelectedPolicy: () => void
  getPolicyById: (id: string) => AnalyzedPolicy | undefined
}

const PolicyContext = createContext<PolicyContextValue | null>(null)

interface PolicyProviderProps {
  children: ReactNode
}

export function PolicyProvider({ children }: PolicyProviderProps) {
  const [policies, setPolicies] = useState<AnalyzedPolicy[]>([])
  const [selectedPolicy, setSelectedPolicy] = useState<AnalyzedPolicy | null>(null)

  // Load sample policies on mount
  useEffect(() => {
    setPolicies(samplePolicies)
  }, [])

  const addPolicies = useCallback((newPolicies: AnalyzedPolicy[]) => {
    setPolicies((prev) => [...prev, ...newPolicies])
  }, [])

  const deletePolicy = useCallback((id: string) => {
    const policyToDelete = policies.find((p) => p.id === id)
    setPolicies((prev) => prev.filter((p) => p.id !== id))

    if (policyToDelete) {
      toast.success('Policy deleted', {
        description: `${policyToDelete.provider} ${policyToDelete.typeTr} policy has been removed.`,
        action: {
          label: 'Undo',
          onClick: () => {
            setPolicies((prev) => [...prev, policyToDelete])
            toast.info('Policy restored', {
              description: 'The policy has been restored to your dashboard.',
            })
          },
        },
      })
    }
  }, [policies])

  const selectPolicy = useCallback((id: string): AnalyzedPolicy | null => {
    const policy = policies.find((p) => p.id === id) || null
    setSelectedPolicy(policy)
    return policy
  }, [policies])

  const clearSelectedPolicy = useCallback(() => {
    setSelectedPolicy(null)
  }, [])

  const getPolicyById = useCallback((id: string): AnalyzedPolicy | undefined => {
    return policies.find((p) => p.id === id)
  }, [policies])

  return (
    <PolicyContext.Provider
      value={{
        policies,
        selectedPolicy,
        addPolicies,
        deletePolicy,
        selectPolicy,
        clearSelectedPolicy,
        getPolicyById,
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
