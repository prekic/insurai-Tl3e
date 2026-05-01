import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ChevronDown, ScrollText } from 'lucide-react'
import { useI18n } from '@/lib/i18n'

interface SpecialProvisionsPanelProps {
  /** Canonical "<Scenario label>: %<N>" strings from policy.conditionalDeductibles. */
  provisions: string[]
  /** Suppresses the panel entirely when the extraction completeness gate fires
   *  (gotcha #101). Conditional deductibles are extracted from the same text
   *  pipeline as vehicle/coverage data, so when the gate fires they may be
   *  unreliable too. */
  isUnverified?: boolean
}

/**
 * Sprint 3 #13 — dedicated panel for named-deductible scenarios
 * (Anlaşmalı olmayan servis, Pert araç muafiyeti, etc.) that previously lived
 * inside the Exclusions section's "Addressed in policy" subsection where
 * reviewers consistently missed them.
 *
 * Each entry is the canonical format produced by classifyExclusions()
 * (gotcha #93): "<scenario label>: %<N>". We split on the first ": " to
 * separate the label from the percentage so they can be rendered with
 * label-bold + value-amber styling.
 */
export function SpecialProvisionsPanel({
  provisions,
  isUnverified = false,
}: SpecialProvisionsPanelProps) {
  const { t } = useI18n()
  const [expanded, setExpanded] = useState(false)

  if (isUnverified) {
    return null
  }

  if (!provisions || provisions.length === 0) {
    return null
  }

  const countLabel = t.policy.specialProvisionsCount.replace(
    '{count}',
    String(provisions.length)
  )

  return (
    <Card className="overflow-hidden" data-testid="special-provisions-panel">
      <CardHeader className="py-3 px-4 sm:py-4 sm:px-6">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center justify-between w-full"
          aria-expanded={expanded}
          aria-controls="special-provisions-list"
        >
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <ScrollText className="text-amber-600" size={20} />
            {t.policy.specialProvisionsLabel}
            <Badge variant="outline" className="text-xs ml-1">
              {provisions.length}
            </Badge>
          </CardTitle>
          <ChevronDown
            size={20}
            className={`text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
          />
        </button>
      </CardHeader>
      {expanded ? (
        <CardContent className="pt-0">
          <ul id="special-provisions-list" className="divide-y divide-gray-100">
            {provisions.map((provision, idx) => {
              const splitAt = provision.indexOf(': ')
              const hasSplit = splitAt > 0
              const label = hasSplit ? provision.slice(0, splitAt) : provision
              const value = hasSplit ? provision.slice(splitAt + 2) : null
              return (
                <li
                  key={`${idx}-${provision}`}
                  className="flex items-start justify-between gap-3 py-2.5 text-sm"
                >
                  <span className="font-medium text-gray-900 flex-1 min-w-0">{label}</span>
                  {value && (
                    <span className="font-semibold text-amber-700 whitespace-nowrap shrink-0">
                      {value}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </CardContent>
      ) : (
        <CardContent className="pt-0 pb-3">
          <p className="text-sm text-gray-500">{countLabel}</p>
        </CardContent>
      )}
    </Card>
  )
}
