/**
 * Fast heuristics-based document classifier to identify policy types
 * before dispatching to the LLM.
 */

export type DocumentType =
  | 'kasko'
  | 'traffic'
  | 'home'
  | 'health'
  | 'life'
  | 'dask'
  | 'business'
  | 'nakliyat'
  | 'unknown'

export function classifyDocumentType(text: string): DocumentType {
  if (!text) return 'unknown'

  const lowerText = text.toLocaleLowerCase('tr-TR').substring(0, 5000) // Look at first 5000 chars

  // Kasko indicators — MUST be checked BEFORE home indicators because Birleşik
  // Kasko policies often contain "Konut Sigortası" as a bundle sub-product name.
  // The word "konut" appears in birleşik documents but they are vehicle policies.
  if (
    lowerText.includes('kasko sigorta') ||
    lowerText.includes('kasko poliçe') ||
    lowerText.includes('genişletilmiş kasko') ||
    lowerText.includes('dar kasko') ||
    lowerText.includes('birleşik kasko') ||
    (lowerText.includes('araç sigorta') && lowerText.includes('rayiç değer'))
  ) {
    return 'kasko'
  }

  // Traffic indicators
  if (
    lowerText.includes('zmss') ||
    lowerText.includes('zorunlu mali sorumluluk') ||
    lowerText.includes('karayolları motorlu araçlar zorunlu mali sorumluluk sigortası') ||
    lowerText.includes('trafik sigorta')
  ) {
    return 'traffic'
  }

  // Dask
  if (lowerText.includes('zorunlu deprem sigortası') || lowerText.includes('dask poliçe')) {
    return 'dask'
  }

  // Home — must come AFTER kasko check, because 'konut sigorta' as a bundle
  // sub-product name in Birleşik Kasko policies would otherwise misclassify.
  if (
    lowerText.includes('konut sigorta') ||
    lowerText.includes('ev sigorta') ||
    lowerText.includes('mesken')
  ) {
    return 'home'
  }

  // Health
  if (
    lowerText.includes('sağlık sigorta') ||
    lowerText.includes('tamamlayıcı sağlık') ||
    lowerText.includes('tss')
  ) {
    return 'health'
  }

  return 'unknown'
}
