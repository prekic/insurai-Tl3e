# Wording Governance Matrix

This governance artifact dictates the exact phrasing and fallback mechanisms used by the Display Interpretation Layer. Any updates to this document require stakeholder approval.

## 1. Safety Labels

All extracted policy facts must be rendered with an associated safety label based on the deterministic validator's output.

*   `[Confirmed]` (Green): High-confidence extraction with a direct source quote. No conflicting conditions detected.
*   `[Conditional]` (Amber): Extracted fact is tied to a specific limitation, carve-out, or condition. Must be displayed alongside the condition text.
*   `[Unclear]` (Red/Gray): Extracted value contradicts other facts, has low confidence (< 85%), or is missing. Prompts human review.
*   `[Benchmark]` (Purple/Teal): External market data. Cannot be presented as part of the contract.

## 2. Prohibited Phrases & Fallbacks

To prevent consumer harm resulting from oversimplified AI output, the following phrases are strictly forbidden unless explicitly cleared by the validator and accompanied by safe context.

| Prohibited Phrase (English) | Prohibited Phrase (Turkish) | Reason for Prohibition | Safe Fallback Phrase (English) | Safe Fallback Phrase (Turkish) |
| :--- | :--- | :--- | :--- | :--- |
| Fully Covered | Tam Kapsamlı | Implies no exclusions exist, which is rarely true. | Covered up to limit [limit] | Teminatlı (Bkz. Limit [limit]) |
| No Deductible | Muafiyetsiz | Hides sub-limit deductibles or missing data scenarios. | No general deductible found; check specific coverages for limits. | Genel muafiyet tespit edilmedi; özel şartları inceleyiniz. |
| Market Value Guarantee | Aracınızın tam değeri ödenir | Confuses absolute limits with depreciated market value. | Rayiç Değer (Market Value) up to coverage conditions. | Teminat şartları dahilinde Rayiç Değer üzerinden ödenir. |
| Recommended Limit | Önerilen Limit | May be interpreted as financial advice or an endorsement. | Market Segment Average: [value] (Source: [Source], [Date]) | Piyasa Segment Ortalaması: [value] (Kaynak: [Kaynak], [Tarih]) |
| Complete Protection | Kesin Koruma / Eksiksiz Koruma | Vague marketing term that contradicts policy exclusions. | Active Coverage (See exclusions) | Aktif Teminat (İstisnalara bakınız) |
| Free Towing | Ücretsiz Çekici | Doesn't account for sublimits (e.g., max 1500 TRY). | Towing service up to limit | Limit dahilinde Çekici Hizmeti |
| Unlimited Health | Sınırsız Sağlık | Disregards network/non-network restrictions. | Coverage per network rules | Anlaşmalı kurum şartlarına tabidir |

## 3. Benchmark Provenance Obligations

Whenever a benchmark (e.g., average premium, typical coverage limit) is displayed, the UI MUST render the following metadata:
1.  **Source:** (e.g., InsurAI Market Data, TSB Report)
2.  **Version:** (e.g., v2.1)
3.  **Segment:** (e.g., 2023 Mid-size SUV)
4.  **Geography:** (e.g., TR-Istanbul)
5.  **Date:** (e.g., Q4 2023)
6.  **Confidence:** (e.g., High, Moderate)

If the intermediate layer attempts to render a benchmark without this full metadata block, the UI component must fatally throw or deliberately omit the benchmark display.

## 4. Ambiguity Logging

Any fact mapped as `[Unclear]` or modified into a fallback phrase by the intermediate layer must be logged to the observability system. This includes:
*   The original extracted value.
*   The raw document quote.
*   The specific validator rule that flagged it.
*   The fallback phrase adopted.
