/**
 * Sprint 1 PR-S1.2 — diagnostic probe for the deductiblePercent regression
 * flagged in the Round-4 Anadolu Sigorta review.
 *
 * Replicates the production `classifyExclusions()` logic inline to avoid
 * Vite-env import crashes (gotcha #137). When the production regexes in
 * `src/lib/ai/policy-converter.ts` change, the inline copies below MUST
 * be kept in sync — otherwise this probe drifts from production behavior.
 *
 * Runs against verbatim Anadolu phrasings from the Round-4 reviewer's
 * policy (pages 12-13 Kullanım Şekli Klozu) and asserts the broader
 * regex landed in PR-S1.2 catches the %80 commercial-use scenario.
 *
 * NO API keys required — operates on static text fixtures.
 *
 * Usage:
 *   npx tsx scripts/probe-anadolu-deductible.ts
 *
 * Expected exit code 0 — maxDeductiblePercent = 80, with a
 * "Rent-a-car / ticari kullanım: %80" entry in conditionalDeductibles[].
 */
import { pathToFileURL } from 'node:url'

// ───────────────────────────────────────────────────────────────────────────
// Inline replica of classifyExclusions() — keep in sync with
// src/lib/ai/policy-converter.ts:1285-1361 (gotcha #137).
// ───────────────────────────────────────────────────────────────────────────

const NAMED_DEDUCTIBLE_SCENARIOS: Array<{ keywords: RegExp[]; labelTr: string }> = [
  {
    keywords: [/(anla[şs]mal[ıi]\s*olmayan|anla[şs]mas[ıi]z)/i, /servis|yetkili\s*servis/i],
    labelTr: 'Anlaşmalı olmayan servis',
  },
  {
    keywords: [/pert|hurda/i, /muaf[iİ]yet|tenzil/i],
    labelTr: 'Pert araç muafiyeti',
  },
  {
    keywords: [/lpg|cng|beyan\s*d[ıi][şs][ıi]|beyan\s*edilmemi[şs]/i],
    labelTr: 'Beyan dışı LPG / CNG donanımı',
  },
  {
    keywords: [
      /rent[\s-]*a[\s-]*car|taksi|dolmu[şs]|kurye|kargo|kiral[ıi]k\s*ara[çc]|ikame\s*ara[çc]|uygulama\s*ta[şs][ıi]mac[ıi]l[ıi][ğg]?[ıi]?|ta[şs][ıi]mac[ıi]l[ıi][ğg]?[ıi]?|ticari\s*kullan[ıi]m|kullan[ıi]m\s*[şs]ekli/i,
    ],
    labelTr: 'Rent-a-car / ticari kullanım',
  },
  {
    keywords: [
      /(ilk|birinci|1\.?)\s*cam|cam\s*hasar[ıi]?\s*(ilk|birinci|1\.?)|anla[şs]mal[ıi]\s*cam/i,
    ],
    labelTr: 'İlk cam hasarı muafiyeti',
  },
  {
    keywords: [/ya[şs]|sür[üu]c[üu]\s*ya[şs]|25\s*ya[şs]|18\s*ya[şs]/i],
    labelTr: 'Sürücü yaşı',
  },
  {
    keywords: [/ehliyet|s[üu]r[üu]c[üu]\s*belgesi|belge\s*s[üu]resi|belge\s*y[ıi]l/i],
    labelTr: 'Ehliyet süresi',
  },
]

const conditionalPatterns = [
  /muaf[iİ]yet/i,
  /tenzil/i,
  /%\s*\d+/i,
  /\d+\s*%/i,
  /anla[şs]mal[ıi]\s*olmayan.*servis/i,
  /anla[şs]mas[ıi]z.*servis/i,
  /onar[ıi]m.*muaf[iİ]yet/i,
  /pert.*muaf[iİ]yet/i,
  /pert.*tenzil/i,
  /lpg|cng/i,
  /rent[\s-]*a[\s-]*car|taksi|dolmu[şs]|kurye|kargo|kiral[ıi]k\s*ara[çc]|ikame\s*ara[çc]|kullan[ıi]m\s*[şs]ekli|ticari\s*kullan[ıi]m/i,
]

function classifyExclusions(exclusions: string[]): {
  trueExclusions: string[]
  conditionalDeductibles: string[]
  maxDeductiblePercent: number
} {
  const trueExclusions: string[] = []
  const conditionalDeductibles: string[] = []
  const seenScenarios = new Set<string>()
  let maxDeductiblePercent = 0

  for (const text of exclusions) {
    const tUpper = text.trim().toUpperCase()
    if (tUpper === 'YOK' || tUpper === 'YOKTUR' || /MUAFIYET\s*(:\s*|-?\s*)?YOK/i.test(text)) {
      continue
    }

    const isConditional = conditionalPatterns.some((p) => p.test(text))
    if (!isConditional) {
      trueExclusions.push(text)
      continue
    }

    const pctMatch = text.match(/(\d{1,3})\s*%/) || text.match(/%\s*(\d{1,3})/)
    let pct: number | null = null
    if (pctMatch) {
      const parsed = parseInt(pctMatch[1], 10)
      if (parsed > 0 && parsed <= 100) {
        pct = parsed
        if (parsed > maxDeductiblePercent) maxDeductiblePercent = parsed
      }
    }

    let labeled = false
    for (const scenario of NAMED_DEDUCTIBLE_SCENARIOS) {
      const allMatch = scenario.keywords.every((kw) => kw.test(text))
      if (allMatch && !seenScenarios.has(scenario.labelTr)) {
        const formatted = pct !== null ? `${scenario.labelTr}: %${pct}` : scenario.labelTr
        conditionalDeductibles.push(formatted)
        seenScenarios.add(scenario.labelTr)
        labeled = true
        break
      }
    }

    if (!labeled) {
      conditionalDeductibles.push(text.slice(0, 80))
    }
  }

  return { trueExclusions, conditionalDeductibles, maxDeductiblePercent }
}

// ───────────────────────────────────────────────────────────────────────────
// Probe
// ───────────────────────────────────────────────────────────────────────────

const ANADOLU_FIXTURES = [
  'Anlaşmalı olmayan yetkili serviste onarımda %35 tenzili muafiyet uygulanır',
  'Daha önce pert olmuş araçlar için %35 tenzili muafiyet uygulanır',
  "Kullanım Şekli Klozu — Aracın kiralık araç olarak kullanılması, ikame araç olarak kullanımı, test sürüşü aracı olarak kullanılması, taksi/dolmuş, kargo/kurye, mobil uygulamalar/internet ile yolcu/yük taşımacılığı durumunda her hasarın %80'i sigortalı tarafından karşılanmak üzere tazminat bedelinden indirilir",
  'Beyan dışı LPG / CNG donanımı bulunması halinde %25 muafiyet',
  'Sürücü yaşı 25 altında ise %20 muafiyet',
]

function probe(): void {
  console.log('━'.repeat(80))
  console.log('ANADOLU DEDUCTIBLE PROBE — Sprint 1 PR-S1.2')
  console.log('━'.repeat(80))
  console.log()
  console.log(`Input: ${ANADOLU_FIXTURES.length} exclusion strings`)
  for (const ex of ANADOLU_FIXTURES) {
    console.log(`  - ${ex.slice(0, 100)}${ex.length > 100 ? '…' : ''}`)
  }
  console.log()

  const result = classifyExclusions(ANADOLU_FIXTURES)

  console.log('Result:')
  console.log(`  maxDeductiblePercent = ${result.maxDeductiblePercent}`)
  console.log(`  trueExclusions[] (${result.trueExclusions.length}):`)
  for (const ex of result.trueExclusions) {
    console.log(`    • ${ex.slice(0, 90)}${ex.length > 90 ? '…' : ''}`)
  }
  console.log(`  conditionalDeductibles[] (${result.conditionalDeductibles.length}):`)
  for (const cd of result.conditionalDeductibles) {
    console.log(`    • ${cd}`)
  }
  console.log()

  console.log('Expected after PR-S1.2:')
  console.log('  maxDeductiblePercent = 80')
  console.log('  conditionalDeductibles[] should contain:')
  console.log('    "Anlaşmalı olmayan servis: %35"')
  console.log('    "Pert araç muafiyeti: %35"')
  console.log('    "Rent-a-car / ticari kullanım: %80"')
  console.log('    "Beyan dışı LPG / CNG donanımı: %25"')
  console.log('    "Sürücü yaşı: %20"')
  console.log()

  const ok =
    result.maxDeductiblePercent === 80 &&
    result.conditionalDeductibles.some((cd) => cd.startsWith('Rent-a-car / ticari kullanım: %80'))

  if (ok) {
    console.log('✓ Probe passed — Kullanım Şekli %80 scenario detected.')
    process.exit(0)
  } else {
    console.log('✗ Probe failed — Kullanım Şekli %80 scenario NOT detected.')
    console.log('  Investigate NAMED_DEDUCTIBLE_SCENARIOS in src/lib/ai/policy-converter.ts')
    process.exit(1)
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  probe()
}
