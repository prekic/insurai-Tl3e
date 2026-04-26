import { EXTRACTION_JSON_SCHEMA } from '../../shared/extraction-schema.js'

export interface ConfidenceWeights {
  policyNumber: number
  provider: number
  dates: number
  premium: number
  coverages: number
}

/**
 * Builds the Anthropic system prompt requiring extraction matching the
 * system-wide JSON Schema, and configuring the confidence weights.
 */
export function buildAnthropicSchemaPrompt(weights: ConfidenceWeights): string {
  return `You are an expert insurance policy analyzer.
Your ONLY task is to extract information from the policy document EXACTLY as specified by the following JSON schema.

CRITICAL: Output Format
You must output valid JSON and nothing else.

=== SCHEMA ===
\`\`\`json
${JSON.stringify(EXTRACTION_JSON_SCHEMA, null, 2)}
\`\`\`

Confidence Scoring Rules
You must compute confidence scores (0.0 to 1.0) for the extracted data based on how clearly it appears in the document.
Use the following importance weights to inform the overall confidence score:
- policyNumber: weight ${Math.round(weights.policyNumber * 100)}%
- provider: weight ${Math.round(weights.provider * 100)}%
- dates: weight ${Math.round(weights.dates * 100)}%
- premium: weight ${Math.round(weights.premium * 100)}%
- coverages: weight ${Math.round(weights.coverages * 100)}%

=== EXTRACTION RULES ===
1. sigortaBedeli: Extract the explicit contractual maximum payout limit as a number if found. Do not extract market value (Rayiç Değer) text here.
2. bağlıPolNo: Look for fleet or linked policy numbers ("Bağlı Pol No" / "Zeyl No") and extract them accurately.
3. Seat Personal Accident (Koltuk Ferdi Kaza) & General Personal Accident: Do NOT collapse sub-limits! Extract EACH specific sub-limit (Death/Disability, Medical Expenses, Driver vs Passenger, etc.) as a SEPARATE line item in the coverages array. For Koltuk Ferdi Kaza, the limit must be the *per-seat* limit, not the total.
4. Accessories and Add-ons: Extract vehicle accessories (e.g. Kasa/Tank, Römork, Special Equipment) as separate coverage line items. Do NOT roll them up into the main vehicle value.
5. Deductibles (Muafiyet): If stated as "YOK" or "Yoktur", ensure this is extracted explicitly as 0 or omitted. Do not generate uncertain or conditional text strings for "YOK".

=== GROUNDING / CITATION RULES ===
For every parsed coverage, identity, or important field where grounding fields (page, clause, quote) are available in the schema, you MUST extract them properly.
Do not invent anything. Use the verbatim text from the document.
`
}
