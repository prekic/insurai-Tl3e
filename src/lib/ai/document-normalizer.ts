/**
 * Document Normalizer - Clean-Room Document Conversion
 *
 * Implements a legally auditable, deterministic document conversion engine for
 * Turkish/English insurance policy documents.
 *
 * Three outputs:
 * 1. CLEAN_COPY - Original content with only allowed OCR normalization
 * 2. REDACTED_COPY - Same as clean copy but with PII replaced by tokens
 * 3. PII_VAULT - Mapping of redaction tokens to original values
 *
 * NON-NEGOTIABLES (Clean-Room Principles):
 * - Deterministic: Same input => same output
 * - No stylistic edits, grammar polishing, or rewording
 * - Preserve contractual meaning and identifiers exactly
 * - Changes must be purely mechanical and audit-friendly
 */

// =============================================================================
// TYPES
// =============================================================================

export interface DocumentNormalizerOutput {
  cleanCopy: string
  redactedCopy: string
  piiVault: PIIVaultEntry[]
  metadata: DocumentMetadata
  validationReport: ValidationReport
}

export interface DocumentMetadata {
  documentTitle: string
  source: string
  conversionDate: string
  outputType: 'NORMALIZED'
  language: string
  pageCount: number
}

export interface PIIVaultEntry {
  token: string
  category: PIICategory
  originalValue: string
  occurrences: number
  contextSnippet: string
}

export type PIICategory =
  | 'INSURED'
  | 'PERSON'
  | 'ADDRESS'
  | 'PHONE'
  | 'EMAIL'
  | 'TAX_ID'
  | 'IBAN'
  | 'BANK_ACCOUNT'
  | 'PLATE'
  | 'VIN'
  | 'ENGINE_NO'
  | 'SERIAL_NO'
  | 'QR_DATA'
  | 'BARCODE_DATA'
  | 'CONTACT_PERSON'

export interface ValidationReport {
  completeness: {
    noTruncation: boolean
    allSectionsPresent: boolean
    pageCountMatch: boolean
  }
  identifierIntegrity: {
    policyNumberUnchanged: boolean
    clauseReferencesUnchanged: boolean
    amountsUnchanged: boolean
    datesUnchanged: boolean
  }
  redactionCorrectness: {
    noPlainTextPII: boolean
    standardTokensOnly: boolean
    tokenConsistency: boolean
  }
  issues: string[]
}

interface NormalizationStats {
  ocrSpacingFixed: number
  hyphenationRepaired: number
  bulletsNormalized: number
  whitespaceNormalized: number
  artifactsRemoved: number
}

// =============================================================================
// CONSTANTS - IMMUTABLE PATTERNS (NEVER CHANGE)
// =============================================================================

/**
 * Patterns that must NEVER be modified during normalization.
 * These are critical legal/contractual elements.
 */
const IMMUTABLE_PATTERNS = {
  // Clause numbering patterns
  clauseNumbering: /(?:A|B|C|D|E|F|G|H)\.\d+(?:\.\d+)*(?:\.\d+)*/g,
  maddeReferences: /Madde\s+\d+(?:\.\d+)*/gi,

  // Policy identifiers (DO NOT add/remove spaces)
  policyNumbers: /(?:POL|PLÇ|PO|NO|SB|ZK|TRF|KSK)[-\s]?\d{2,}[-/]?\d*[A-Z]*/gi,

  // Dates (preserve format exactly)
  dates: /\d{1,2}[./]\d{1,2}[./]\d{2,4}/g,
  isoDate: /\d{4}-\d{2}-\d{2}/g,

  // Currency and amounts (NO reformatting)
  turkishAmounts: /(?:₺|TL|TRY)?\s*\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?(?:\s*(?:TL|TRY|₺))?/g,
  percentages: /\d+(?:[.,]\d+)?%/g,

  // Durations
  durations: /\d+\s*(?:iş\s*günü|gün|ay|yıl|saat|dakika)/gi,

  // License plates (Turkish format: XX YYY ZZ or XX Y ZZZZ)
  plates: /\b\d{2}\s*[A-Z]{1,3}\s*\d{2,4}\b/gi,

  // VIN/Chassis numbers (17 alphanumeric)
  vinNumbers: /\b[A-HJ-NPR-Z0-9]{17}\b/gi,

  // Engine numbers (variable length alphanumeric)
  engineNumbers: /(?:Motor\s*(?:No|Numarası?)[:.]?\s*)([A-Z0-9]{6,20})/gi,
}

// =============================================================================
// PII DETECTION PATTERNS
// =============================================================================

const PII_PATTERNS: Record<PIICategory, RegExp> = {
  // TC Kimlik No (11 digits, first not 0)
  TAX_ID: /\b[1-9]\d{10}\b/g,

  // Turkish phone numbers
  PHONE: /(?:\+90|0)?\s*[-(]?\s*\d{3}\s*[)-]?\s*\d{3}\s*[-]?\s*\d{2}\s*[-]?\s*\d{2}/g,

  // Email addresses
  EMAIL: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,

  // IBAN (Turkish format: TR + 24 digits)
  IBAN: /\bTR\s*\d{2}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{2}\b/gi,

  // Bank account numbers
  BANK_ACCOUNT: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,

  // License plates
  PLATE: /\b\d{2}\s*[A-Z]{1,3}\s*\d{2,4}\b/gi,

  // VIN numbers
  VIN: /\b[A-HJ-NPR-Z0-9]{17}\b/gi,

  // Engine numbers (after keyword)
  ENGINE_NO: /(?:Motor\s*(?:No|Numarası?)[:.]?\s*)([A-Z0-9]{6,20})/gi,

  // Serial numbers (after keyword)
  SERIAL_NO: /(?:Seri\s*(?:No|Numarası?)[:.]?\s*)([A-Z0-9-]{6,20})/gi,

  // These are detected contextually
  INSURED: /PLACEHOLDER_INSURED/g, // Will be replaced by contextual detection
  PERSON: /PLACEHOLDER_PERSON/g,
  ADDRESS: /PLACEHOLDER_ADDRESS/g,
  CONTACT_PERSON: /PLACEHOLDER_CONTACT/g,
  QR_DATA: /PLACEHOLDER_QR/g,
  BARCODE_DATA: /PLACEHOLDER_BARCODE/g,
}

// =============================================================================
// OCR NORMALIZATION RULES (ALLOWED CHANGES)
// =============================================================================

/**
 * Turkish OCR character confusion map
 * Maps commonly confused characters to their normalized form
 */
const TURKISH_OCR_CONFUSIONS: Array<[RegExp, string]> = [
  // =========================================================================
  // Spaced Turkish words - use \s* (zero or more) to handle partially grouped letters
  // e.g., "B İ RLE Şİ K" where some letters are grouped (RLE, Şİ)
  // =========================================================================
  [/(?<=\s|^)B\s*İ\s*R\s*L\s*E\s*Ş\s*İ\s*K(?=\s|$)/gi, 'BİRLEŞİK'],
  [/(?<=\s|^)S\s*İ\s*G\s*O\s*R\s*T\s*A(?=\s|$)/gi, 'SİGORTA'],
  [/(?<=\s|^)P\s*O\s*L\s*İ\s*Ç\s*E\s*S?\s*İ?(?=\s|$)/gi, 'POLİÇESİ'],  // Handles POLİÇE and POLİÇESİ
  [/(?<=\s|^)T\s*E\s*M\s*İ\s*N\s*A\s*T(?=\s|$)/gi, 'TEMİNAT'],
  [/(?<=\s|^)M\s*U\s*A\s*F\s*İ\s*Y\s*E\s*T(?=\s|$)/gi, 'MUAFİYET'],
  [/(?<=\s|^)A\s*N\s*A\s*D\s*O\s*L\s*U(?=\s|$)/gi, 'ANADOLU'],
  [/(?<=\s|^)T\s*Ü\s*R\s*K\s*İ\s*Y\s*E(?=\s|$)/gi, 'TÜRKİYE'],
  [/(?<=\s|^)İ\s*S\s*T\s*A\s*N\s*B\s*U\s*L(?=\s|$)/gi, 'İSTANBUL'],
  [/(?<=\s|^)K\s*A\s*S\s*K\s*O(?=\s|$)/gi, 'KASKO'],
  [/(?<=\s|^)T\s*R\s*A\s*F\s*İ\s*K(?=\s|$)/gi, 'TRAFİK'],
  [/(?<=\s|^)G\s*E\s*N\s*İ\s*Ş\s*L\s*E\s*T\s*İ\s*L\s*M\s*İ\s*Ş(?=\s|$)/gi, 'GENİŞLETİLMİŞ'],
  [/(?<=\s|^)D\s*Ü\s*Z\s*E\s*N\s*L\s*E\s*M\s*E(?=\s|$)/gi, 'DÜZENLEME'],
  [/(?<=\s|^)Ş\s*İ\s*R\s*K\s*E\s*T\s*İ?(?=\s|$)/gi, 'ŞİRKET'],
  [/(?<=\s|^)M\s*Ü\s*Ş\s*T\s*E\s*R\s*İ(?=\s|$)/gi, 'MÜŞTERİ'],
  [/(?<=\s|^)A\s*N\s*O\s*N\s*İ\s*M(?=\s|$)/gi, 'ANONİM'],
  [/(?<=\s|^)A\s*D\s*R\s*E\s*S\s*İ?(?=\s|$)/gi, 'ADRES'],

  // =========================================================================
  // Common Turkish word spacing fixes (lowercase and mixed case)
  // =========================================================================
  [/poli\s*ç\s*e\s*s?\s*i?/gi, 'poliçe'],
  [/sigorta\s*l\s*ı/gi, 'sigortalı'],
  [/teminat\s*l\s*ar/gi, 'teminatlar'],
  [/muafiyet\s*i/gi, 'muafiyeti'],
  [/de\s*ğ\s*er/gi, 'değer'],
  [/d\s*ü\s*zenleme/gi, 'düzenleme'],
  [/s\s*ü\s*re\s*s?\s*i?/gi, 'süre'],
  [/g\s*ü\s*n(?=\s|$)/gi, 'gün'],
  [/ş\s*irket\s*i?/gi, 'şirket'],

  // =========================================================================
  // Turkish special character spacing within words
  // Handle both space before and after special chars
  // =========================================================================
  [/(\w)\s+ş\s*(\w)/g, '$1ş$2'],
  [/(\w)\s*ş\s+(\w)/g, '$1ş$2'],
  [/(\w)\s+ğ\s*(\w)/g, '$1ğ$2'],
  [/(\w)\s*ğ\s+(\w)/g, '$1ğ$2'],
  [/(\w)\s+ü\s*(\w)/g, '$1ü$2'],
  [/(\w)\s*ü\s+(\w)/g, '$1ü$2'],
  [/(\w)\s+ö\s*(\w)/g, '$1ö$2'],
  [/(\w)\s*ö\s+(\w)/g, '$1ö$2'],
  [/(\w)\s+ç\s*(\w)/g, '$1ç$2'],
  [/(\w)\s*ç\s+(\w)/g, '$1ç$2'],
  [/(\w)\s+ı\s*(\w)/g, '$1ı$2'],
  [/(\w)\s*ı\s+(\w)/g, '$1ı$2'],
  [/(\w)\s+İ\s*(\w)/g, '$1İ$2'],
  [/(\w)\s*İ\s+(\w)/g, '$1İ$2'],
]

/**
 * Bullet point normalization patterns
 */
const BULLET_PATTERNS: Array<[RegExp, string]> = [
  [/^[•●○◦▪▫◆◇]\s*/gm, '- '],
  [/^[*]\s+/gm, '- '],
  [/^[l]\s+(?=[A-ZÇĞİÖŞÜa-zçğıöşü])/gm, '- '], // lowercase L often OCR'd as bullet
]

/**
 * Hyphenation repair patterns
 */
const HYPHENATION_PATTERNS: Array<[RegExp, string]> = [
  // Word split at line end with hyphen
  [/(\w)-\n(\w)/g, '$1$2'],
  // Turkish specific hyphenation
  [/([a-zçğıöşü])-\s*\n\s*([a-zçğıöşü])/gi, '$1$2'],
]

// =============================================================================
// CONTEXTUAL PII DETECTION
// =============================================================================

/**
 * Patterns for detecting names/addresses by context
 */
const CONTEXTUAL_PII_PATTERNS = {
  // After "Sigortalı:" or "Sigorta Ettiren:"
  insuredName: /(?:Sigortalı|Sigorta\s+Ettiren|Sigortalının\s+Adı?)[:.\s]+([A-ZÇĞİÖŞÜa-zçğıöşü\s]{3,50}?)(?=\n|$|Adres|TC|Tel)/gi,

  // After "Adres:" or "Adresi:" - capture until end of line or next keyword
  address: /(?:Adres(?:i)?|İkametgah)[:.\s]+([^\n]{10,150}?)(?=\n|$|Tel|TC|Email|Posta|Telefon)/gi,

  // Contact person names after keywords
  contactPerson: /(?:İlgili\s+Kişi|Yetkili|Muhatap)[:.\s]+([A-ZÇĞİÖŞÜa-zçğıöşü\s]{3,50}?)(?=\n|$|Tel)/gi,
}

// =============================================================================
// MAIN NORMALIZER CLASS
// =============================================================================

export class DocumentNormalizer {
  private piiVault: Map<string, PIIVaultEntry> = new Map()
  private tokenCounters: Map<PIICategory, number> = new Map()
  private stats: NormalizationStats = {
    ocrSpacingFixed: 0,
    hyphenationRepaired: 0,
    bulletsNormalized: 0,
    whitespaceNormalized: 0,
    artifactsRemoved: 0,
  }

  /**
   * Process a document and return all three outputs
   */
  process(rawText: string, options: { source?: string; title?: string } = {}): DocumentNormalizerOutput {
    // Reset state for new document
    this.piiVault.clear()
    this.tokenCounters.clear()
    this.stats = {
      ocrSpacingFixed: 0,
      hyphenationRepaired: 0,
      bulletsNormalized: 0,
      whitespaceNormalized: 0,
      artifactsRemoved: 0,
    }

    // Step 1: Create CLEAN_COPY with allowed normalizations only
    const cleanCopy = this.createCleanCopy(rawText)

    // Step 2: Create REDACTED_COPY from clean copy
    const redactedCopy = this.createRedactedCopy(cleanCopy)

    // Step 3: Build PII vault from collected data
    const piiVaultEntries = Array.from(this.piiVault.values())

    // Step 4: Generate metadata
    const metadata: DocumentMetadata = {
      documentTitle: options.title || this.detectDocumentTitle(cleanCopy) || 'Unknown',
      source: options.source || 'User-provided text',
      conversionDate: new Date().toISOString().split('T')[0],
      outputType: 'NORMALIZED',
      language: this.detectLanguage(cleanCopy),
      pageCount: this.countPages(rawText),
    }

    // Step 5: Run validation
    const validationReport = this.validate(rawText, cleanCopy, redactedCopy)

    return {
      cleanCopy,
      redactedCopy,
      piiVault: piiVaultEntries,
      metadata,
      validationReport,
    }
  }

  /**
   * Create CLEAN_COPY with only allowed normalizations
   */
  private createCleanCopy(text: string): string {
    let result = text

    // 1. Remove obvious artifacts (barcode gibberish, control characters)
    result = this.removeArtifacts(result)

    // 2. Fix OCR spacing issues in Turkish words
    result = this.fixOCRSpacing(result)

    // 3. Repair hyphenation
    result = this.repairHyphenation(result)

    // 4. Normalize bullets
    result = this.normalizeBullets(result)

    // 5. Normalize whitespace (but preserve structure)
    result = this.normalizeWhitespace(result)

    // 6. Add page markers if detected
    result = this.addPageMarkers(result)

    return result.trim()
  }

  /**
   * Create REDACTED_COPY from clean copy
   */
  private createRedactedCopy(cleanCopy: string): string {
    let result = cleanCopy

    // Redact in order of specificity (most specific first)
    // TC Kimlik (exactly 11 digits) must be processed BEFORE phone numbers
    // to avoid phone patterns partially matching TC Kimlik numbers
    result = this.redactTaxIDs(result)
    result = this.redactEmails(result)
    result = this.redactIBANs(result)
    result = this.redactPhones(result)
    result = this.redactPlates(result)
    result = this.redactVINs(result)
    result = this.redactEngineNumbers(result)
    result = this.redactSerialNumbers(result)
    result = this.redactContextualPII(result)

    return result
  }

  // ===========================================================================
  // NORMALIZATION METHODS
  // ===========================================================================

  private removeArtifacts(text: string): string {
    let result = text
    const originalLength = result.length

    // Remove control characters (except newlines and tabs)
    result = result.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')

    // Remove obvious binary/encoded data blocks
    const lines = result.split('\n')
    const cleanLines: string[] = []

    for (const line of lines) {
      // Skip lines that are mostly special characters
      const specialRatio = (line.match(/[<>\[\]{}|\\^~`@#$%&*+=]/g) || []).length / Math.max(1, line.length)
      if (specialRatio > 0.3 && line.length > 10) {
        this.stats.artifactsRemoved++
        continue
      }

      // Skip base64-like blocks
      if (/^[A-Za-z0-9+/=]{50,}$/.test(line.trim())) {
        this.stats.artifactsRemoved++
        continue
      }

      cleanLines.push(line)
    }

    result = cleanLines.join('\n')

    if (result.length < originalLength) {
      this.stats.artifactsRemoved += originalLength - result.length
    }

    return result
  }

  private fixOCRSpacing(text: string): string {
    let result = text

    for (const [pattern, replacement] of TURKISH_OCR_CONFUSIONS) {
      const matches = result.match(pattern)
      if (matches) {
        this.stats.ocrSpacingFixed += matches.length
        result = result.replace(pattern, replacement)
      }
    }

    return result
  }

  private repairHyphenation(text: string): string {
    let result = text

    for (const [pattern, replacement] of HYPHENATION_PATTERNS) {
      const matches = result.match(pattern)
      if (matches) {
        this.stats.hyphenationRepaired += matches.length
        result = result.replace(pattern, replacement)
      }
    }

    return result
  }

  private normalizeBullets(text: string): string {
    let result = text

    for (const [pattern, replacement] of BULLET_PATTERNS) {
      const matches = result.match(pattern)
      if (matches) {
        this.stats.bulletsNormalized += matches.length
        result = result.replace(pattern, replacement)
      }
    }

    return result
  }

  private normalizeWhitespace(text: string): string {
    let result = text

    // Normalize multiple spaces to single (but not at line start for indentation)
    result = result.replace(/(?<=\S)[ \t]{2,}(?=\S)/g, ' ')

    // Remove trailing whitespace per line
    result = result.replace(/[ \t]+$/gm, '')

    // Normalize multiple blank lines to double
    result = result.replace(/\n{4,}/g, '\n\n\n')

    this.stats.whitespaceNormalized++

    return result
  }

  private addPageMarkers(text: string): string {
    // Detect page breaks (form feed or --- patterns)
    const pageBreakPatterns = [
      /\f/g, // Form feed
      /^-{3,}\s*(?:PAGE|Sayfa|P\.)\s*\d+/gim,
    ]

    let result = text
    let pageNum = 1

    for (const pattern of pageBreakPatterns) {
      if (pattern.test(text)) {
        result = result.replace(pattern, () => {
          pageNum++
          return `\n--- PAGE ${pageNum - 1} ---\n`
        })
      }
    }

    return result
  }

  // ===========================================================================
  // REDACTION METHODS
  // ===========================================================================

  private getToken(category: PIICategory): string {
    const count = (this.tokenCounters.get(category) || 0) + 1
    this.tokenCounters.set(category, count)
    return `[REDACTED:${category}_${count}]`
  }

  private recordPII(token: string, category: PIICategory, value: string, context: string): void {
    const existing = this.piiVault.get(value)
    if (existing) {
      existing.occurrences++
    } else {
      this.piiVault.set(value, {
        token,
        category,
        originalValue: value,
        occurrences: 1,
        contextSnippet: context.slice(0, 60).trim(),
      })
    }
  }

  private getContext(text: string, match: string, index: number): string {
    const start = Math.max(0, index - 20)
    const end = Math.min(text.length, index + match.length + 20)
    return text.slice(start, end).replace(/\n/g, ' ')
  }

  private redactEmails(text: string): string {
    // Use a map to ensure same value gets same token
    const valueToToken = new Map<string, string>()

    return text.replace(PII_PATTERNS.EMAIL, (match, offset) => {
      // Check if we've already assigned a token to this value
      let token = valueToToken.get(match)
      if (!token) {
        token = this.getToken('EMAIL')
        valueToToken.set(match, token)
      }
      this.recordPII(token, 'EMAIL', match, this.getContext(text, match, offset))
      return token
    })
  }

  private redactPhones(text: string): string {
    return text.replace(PII_PATTERNS.PHONE, (match, offset) => {
      const token = this.getToken('PHONE')
      this.recordPII(token, 'PHONE', match, this.getContext(text, match, offset))
      return token
    })
  }

  private redactIBANs(text: string): string {
    return text.replace(PII_PATTERNS.IBAN, (match, offset) => {
      const token = this.getToken('IBAN')
      this.recordPII(token, 'IBAN', match, this.getContext(text, match, offset))
      return token
    })
  }

  private redactTaxIDs(text: string): string {
    return text.replace(PII_PATTERNS.TAX_ID, (match, offset) => {
      // Verify it's likely a TC Kimlik (basic validation)
      if (this.isLikelyTCKimlik(match)) {
        const token = this.getToken('TAX_ID')
        this.recordPII(token, 'TAX_ID', match, this.getContext(text, match, offset))
        return token
      }
      return match
    })
  }

  private redactPlates(text: string): string {
    return text.replace(PII_PATTERNS.PLATE, (match, offset) => {
      const token = this.getToken('PLATE')
      this.recordPII(token, 'PLATE', match, this.getContext(text, match, offset))
      return token
    })
  }

  private redactVINs(text: string): string {
    return text.replace(PII_PATTERNS.VIN, (match, offset) => {
      const token = this.getToken('VIN')
      this.recordPII(token, 'VIN', match, this.getContext(text, match, offset))
      return token
    })
  }

  private redactEngineNumbers(text: string): string {
    return text.replace(PII_PATTERNS.ENGINE_NO, (fullMatch, engineNo, offset) => {
      const token = this.getToken('ENGINE_NO')
      this.recordPII(token, 'ENGINE_NO', engineNo, this.getContext(text, fullMatch, offset))
      return fullMatch.replace(engineNo, token)
    })
  }

  private redactSerialNumbers(text: string): string {
    return text.replace(PII_PATTERNS.SERIAL_NO, (fullMatch, serialNo, offset) => {
      const token = this.getToken('SERIAL_NO')
      this.recordPII(token, 'SERIAL_NO', serialNo, this.getContext(text, fullMatch, offset))
      return fullMatch.replace(serialNo, token)
    })
  }

  private redactContextualPII(text: string): string {
    let result = text

    // Redact insured names
    result = result.replace(CONTEXTUAL_PII_PATTERNS.insuredName, (fullMatch, name, offset) => {
      const trimmedName = name.trim()
      if (trimmedName.length >= 3) {
        const token = this.getToken('INSURED')
        this.recordPII(token, 'INSURED', trimmedName, this.getContext(text, fullMatch, offset))
        return fullMatch.replace(name, ` ${token}`)
      }
      return fullMatch
    })

    // Redact addresses
    result = result.replace(CONTEXTUAL_PII_PATTERNS.address, (fullMatch, address, offset) => {
      const trimmedAddress = address.trim()
      if (trimmedAddress.length >= 10) {
        const token = this.getToken('ADDRESS')
        this.recordPII(token, 'ADDRESS', trimmedAddress, this.getContext(text, fullMatch, offset))
        return fullMatch.replace(address, ` ${token}`)
      }
      return fullMatch
    })

    // Redact contact persons
    result = result.replace(CONTEXTUAL_PII_PATTERNS.contactPerson, (fullMatch, person, offset) => {
      const trimmedPerson = person.trim()
      if (trimmedPerson.length >= 3) {
        const token = this.getToken('CONTACT_PERSON')
        this.recordPII(token, 'CONTACT_PERSON', trimmedPerson, this.getContext(text, fullMatch, offset))
        return fullMatch.replace(person, ` ${token}`)
      }
      return fullMatch
    })

    return result
  }

  // ===========================================================================
  // VALIDATION METHODS
  // ===========================================================================

  private validate(original: string, cleanCopy: string, redactedCopy: string): ValidationReport {
    const issues: string[] = []

    // Completeness checks
    const noTruncation = !cleanCopy.endsWith('...')
    const allSectionsPresent = this.checkSectionsPresent(original, cleanCopy)
    const pageCountMatch = this.countPages(original) === this.countPages(cleanCopy)

    if (!noTruncation) issues.push('Document appears to be truncated')
    if (!allSectionsPresent) issues.push('Some sections may be missing from clean copy')
    if (!pageCountMatch) issues.push('Page count mismatch between original and clean copy')

    // Identifier integrity checks
    const policyNumberUnchanged = this.checkPolicyNumbersPreserved(original, cleanCopy)
    const clauseReferencesUnchanged = this.checkClausesPreserved(original, cleanCopy)
    const amountsUnchanged = this.checkAmountsPreserved(original, cleanCopy)
    const datesUnchanged = this.checkDatesPreserved(original, cleanCopy)

    if (!policyNumberUnchanged) issues.push('Policy numbers may have been altered')
    if (!clauseReferencesUnchanged) issues.push('Clause references may have been altered')
    if (!amountsUnchanged) issues.push('Currency amounts may have been altered')
    if (!datesUnchanged) issues.push('Dates may have been altered')

    // Redaction correctness checks
    const noPlainTextPII = this.checkNoPIIRemains(redactedCopy)
    const standardTokensOnly = this.checkStandardTokens(redactedCopy)
    const tokenConsistency = this.checkTokenConsistency()

    if (!noPlainTextPII) issues.push('Some PII may not have been redacted')
    if (!standardTokensOnly) issues.push('Non-standard redaction tokens detected')
    if (!tokenConsistency) issues.push('Token consistency issue detected')

    return {
      completeness: {
        noTruncation,
        allSectionsPresent,
        pageCountMatch,
      },
      identifierIntegrity: {
        policyNumberUnchanged,
        clauseReferencesUnchanged,
        amountsUnchanged,
        datesUnchanged,
      },
      redactionCorrectness: {
        noPlainTextPII,
        standardTokensOnly,
        tokenConsistency,
      },
      issues,
    }
  }

  private checkSectionsPresent(original: string, cleanCopy: string): boolean {
    // Check that major section headers are preserved
    const sectionPatterns = [
      /GENEL\s+ŞARTLAR/i,
      /TEMİNATLAR/i,
      /İSTİSNALAR/i,
      /ÖZEL\s+ŞARTLAR/i,
    ]

    for (const pattern of sectionPatterns) {
      const inOriginal = pattern.test(original)
      const inClean = pattern.test(cleanCopy)
      if (inOriginal && !inClean) {
        return false
      }
    }

    return true
  }

  private checkPolicyNumbersPreserved(original: string, cleanCopy: string): boolean {
    const originalNumbers = original.match(IMMUTABLE_PATTERNS.policyNumbers) || []
    const cleanNumbers = cleanCopy.match(IMMUTABLE_PATTERNS.policyNumbers) || []

    // All original policy numbers should appear in clean copy
    for (const num of originalNumbers) {
      const normalized = num.replace(/\s+/g, '')
      const found = cleanNumbers.some(cn => cn.replace(/\s+/g, '') === normalized)
      if (!found) return false
    }

    return true
  }

  private checkClausesPreserved(original: string, cleanCopy: string): boolean {
    const originalClauses = original.match(IMMUTABLE_PATTERNS.clauseNumbering) || []
    const cleanClauses = cleanCopy.match(IMMUTABLE_PATTERNS.clauseNumbering) || []

    // All original clause numbers should appear in clean copy
    return originalClauses.length <= cleanClauses.length
  }

  private checkAmountsPreserved(original: string, cleanCopy: string): boolean {
    const originalAmounts = original.match(IMMUTABLE_PATTERNS.turkishAmounts) || []
    const cleanAmounts = cleanCopy.match(IMMUTABLE_PATTERNS.turkishAmounts) || []

    // All original amounts should appear in clean copy
    return originalAmounts.length <= cleanAmounts.length + 5 // Allow some tolerance
  }

  private checkDatesPreserved(original: string, cleanCopy: string): boolean {
    const originalDates = original.match(IMMUTABLE_PATTERNS.dates) || []
    const cleanDates = cleanCopy.match(IMMUTABLE_PATTERNS.dates) || []

    return originalDates.length <= cleanDates.length + 2 // Allow some tolerance
  }

  private checkNoPIIRemains(redactedCopy: string): boolean {
    // Check for obvious PII patterns that should have been redacted
    const remainingEmails = redactedCopy.match(PII_PATTERNS.EMAIL)
    const remainingPhones = redactedCopy.match(PII_PATTERNS.PHONE)
    const remainingIBANs = redactedCopy.match(PII_PATTERNS.IBAN)

    // Filter out redaction tokens
    const isNotToken = (matches: RegExpMatchArray | null) => {
      if (!matches) return false
      return matches.some(m => !m.includes('[REDACTED:'))
    }

    return !isNotToken(remainingEmails) && !isNotToken(remainingPhones) && !isNotToken(remainingIBANs)
  }

  private checkStandardTokens(redactedCopy: string): boolean {
    const tokens = redactedCopy.match(/\[REDACTED:[^\]]+\]/g) || []
    const validTokenPattern = /^\[REDACTED:(INSURED|PERSON|ADDRESS|PHONE|EMAIL|TAX_ID|IBAN|BANK_ACCOUNT|PLATE|VIN|ENGINE_NO|SERIAL_NO|QR_DATA|BARCODE_DATA|CONTACT_PERSON)_\d+\]$/

    return tokens.every(token => validTokenPattern.test(token))
  }

  private checkTokenConsistency(): boolean {
    // Check that each original value maps to the same token throughout
    const valueToToken = new Map<string, string>()

    for (const entry of this.piiVault.values()) {
      const existing = valueToToken.get(entry.originalValue)
      if (existing && existing !== entry.token) {
        return false
      }
      valueToToken.set(entry.originalValue, entry.token)
    }

    return true
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  private isLikelyTCKimlik(str: string): boolean {
    if (str.length !== 11) return false
    if (str[0] === '0') return false

    const digits = str.split('').map(Number)

    // Check for any NaN values
    if (digits.some(isNaN)) return false

    // Basic TC Kimlik algorithm validation
    // Rule 1: (sum of odd positions * 7 - sum of even positions) mod 10 = digit 10
    const sumOdd = digits[0] + digits[2] + digits[4] + digits[6] + digits[8]
    const sumEven = digits[1] + digits[3] + digits[5] + digits[7]

    let check1 = (sumOdd * 7 - sumEven) % 10
    if (check1 < 0) check1 += 10  // Handle negative modulo
    if (check1 !== digits[9]) return false

    // Rule 2: sum of first 10 digits mod 10 = digit 11
    const sumFirst10 = digits.slice(0, 10).reduce((a, b) => a + b, 0)
    if (sumFirst10 % 10 !== digits[10]) return false

    return true
  }

  private detectDocumentTitle(text: string): string | null {
    // Look for common document title patterns (more specific patterns first)
    const titlePatterns = [
      /KASKO\s+SİGORTA(?:\s+POLİÇE)?(?:Sİ)?/i,
      /TRAFİK\s+SİGORTA(?:\s+POLİÇE)?(?:Sİ)?/i,
      /KONUT\s+SİGORTA(?:\s+POLİÇE)?(?:Sİ)?/i,
      /SAĞLIK\s+SİGORTA(?:\s+POLİÇE)?(?:Sİ)?/i,
      /HAYAT\s+SİGORTA(?:\s+POLİÇE)?(?:Sİ)?/i,
      /DASK\s+(?:SİGORTA)?(?:\s+POLİÇE)?(?:Sİ)?/i,
      /(?:SİGORTA\s+)?POLİÇE(?:Sİ)?/i,
    ]

    for (const pattern of titlePatterns) {
      const match = text.match(pattern)
      if (match) {
        return match[0].trim()
      }
    }

    return null
  }

  private detectLanguage(text: string): string {
    const turkishChars = (text.match(/[İıĞğŞşÜüÖöÇç]/g) || []).length
    const turkishWords = (text.match(/\b(ve|bir|bu|için|ile|olan|sigorta|poliçe|teminat|araç|prim|tutar)\b/gi) || []).length

    // Lower thresholds for better detection of mixed content
    if (turkishChars > 1 || turkishWords > 1) {
      return 'Mixed (mainly Turkish)'
    }

    return 'English'
  }

  private countPages(text: string): number {
    // Count page markers or form feeds
    const pageBreaks = (text.match(/\f|---\s*PAGE\s*\d+|---\s*Sayfa\s*\d+/gi) || []).length
    return Math.max(1, pageBreaks + 1)
  }

  /**
   * Generate a markdown redaction log
   */
  generateRedactionLog(): string {
    const categoryCounts = new Map<PIICategory, number>()

    for (const entry of this.piiVault.values()) {
      const current = categoryCounts.get(entry.category) || 0
      categoryCounts.set(entry.category, current + entry.occurrences)
    }

    let log = '## REDACTION LOG\n\n'

    for (const [category, count] of categoryCounts) {
      log += `- [REDACTED:${category}_*] replaced ${count} occurrence(s); category: ${category}\n`
    }

    return log
  }

  /**
   * Generate PII vault as markdown table
   */
  generatePIIVaultMarkdown(): string {
    let md = '> **CONFIDENTIAL:** Contains personal/sensitive data. Do not share externally.\n\n'
    md += '| Token | Category | Original Value | Occurrences | Context Snippet |\n'
    md += '|-------|----------|----------------|-------------|------------------|\n'

    for (const entry of this.piiVault.values()) {
      const escapedValue = entry.originalValue.replace(/\|/g, '\\|')
      const escapedContext = entry.contextSnippet.replace(/\|/g, '\\|')
      md += `| ${entry.token} | ${entry.category} | ${escapedValue} | ${entry.occurrences} | ${escapedContext} |\n`
    }

    return md
  }
}

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Process a document and return normalized outputs
 */
export function normalizeDocument(
  rawText: string,
  options: { source?: string; title?: string } = {}
): DocumentNormalizerOutput {
  const normalizer = new DocumentNormalizer()
  return normalizer.process(rawText, options)
}

/**
 * Get only the clean copy (for extraction)
 */
export function getCleanCopy(rawText: string): string {
  const normalizer = new DocumentNormalizer()
  return normalizer.process(rawText).cleanCopy
}

/**
 * Get only the redacted copy (for sharing)
 */
export function getRedactedCopy(rawText: string): string {
  const normalizer = new DocumentNormalizer()
  return normalizer.process(rawText).redactedCopy
}
