/**
 * Validate Service
 *
 * Applies rule pack validators to OCR output.
 * Implements validation gates for quality control.
 *
 * Features:
 * - Field-level validation using regex, parsers, checksums
 * - Document-level validation (completeness, consistency)
 * - Quarantine logic for critical failures
 * - Targeted re-OCR triggering for validation failures
 */

import type {
  LocaleRulePack,
  PolicyRulePack,
  ValidationResult,
  ValidationGateResult,
  ValidationSeverity,
  ValidationEvidence,
  ExtractedField,
} from '@insurai/types'

import { validateTCKimlik } from '@insurai/rule-packs'

// ============================================================================
// TYPES
// ============================================================================

export interface ValidateOptions {
  docId: string
  localePack: LocaleRulePack
  policyPack?: PolicyRulePack
  text: string
  extractedFields?: ExtractedField[]
  debug?: boolean
}

export interface ValidateContext {
  docId: string
  text: string
  fields: Map<string, ExtractedField>
  results: ValidationResult[]
}

// ============================================================================
// VALIDATOR CLASS
// ============================================================================

export class Validator {
  private options: ValidateOptions
  private context: ValidateContext

  constructor(options: ValidateOptions) {
    this.options = options
    this.context = {
      docId: options.docId,
      text: options.text,
      fields: new Map(
        (options.extractedFields || []).map(f => [f.fieldPath, f])
      ),
      results: [],
    }
  }

  /**
   * Run all validations and return gate result
   */
  validate(): ValidationGateResult {
    // Run locale validators
    this.runLocaleValidators()

    // Run policy validators (if available)
    if (this.options.policyPack) {
      this.runPolicyValidators()
    }

    // Run document-level validators
    this.runDocumentValidators()

    // Categorize results
    const critical = this.context.results.filter(r => r.severity === 'critical')
    const errors = this.context.results.filter(r => r.severity === 'error')
    const warnings = this.context.results.filter(r => r.severity === 'warn')
    const infos = this.context.results.filter(r => r.severity === 'info')

    // Calculate overall confidence
    const overallConfidence = this.calculateOverallConfidence()

    // Determine if we need targeted re-OCR
    const needsTargetedReOCR = critical.length > 0 || errors.length >= 3

    // Determine quarantine reason
    const quarantineReason = this.determineQuarantineReason(critical)

    const passed = critical.length === 0

    if (this.options.debug) {
      console.log(`[Validator] ${this.options.docId}:`)
      console.log(`  - Critical: ${critical.length}`)
      console.log(`  - Errors: ${errors.length}`)
      console.log(`  - Warnings: ${warnings.length}`)
      console.log(`  - Passed: ${passed}`)
      console.log(`  - Confidence: ${(overallConfidence * 100).toFixed(1)}%`)
    }

    return {
      passed,
      criticalIssues: critical,
      errors,
      warnings,
      infos,
      overallConfidence,
      needsTargetedReOCR,
      quarantineReason,
    }
  }

  // ============================================================================
  // LOCALE VALIDATORS
  // ============================================================================

  private runLocaleValidators(): void {
    const locale = this.options.localePack

    // Validate dates
    for (const dateValidator of locale.validators.date) {
      this.validateDateFormat(dateValidator.format)
    }

    // Validate currency symbols
    for (const currencyValidator of locale.validators.currency) {
      this.validateCurrencyPresence(currencyValidator.code, currencyValidator.symbols)
    }

    // Validate phone numbers (if defined)
    if (locale.validators.phone) {
      for (const phoneValidator of locale.validators.phone) {
        this.validatePhoneFormat(phoneValidator.pattern, phoneValidator.description)
      }
    }

    // Validate national IDs (if defined)
    if (locale.validators.nationalId) {
      for (const idValidator of locale.validators.nationalId) {
        this.validateNationalId(idValidator.pattern, idValidator.checksum, idValidator.description)
      }
    }
  }

  private validateDateFormat(format: string): void {
    // Convert format to regex pattern
    const pattern = format
      .replace('dd', '\\d{2}')
      .replace('MM', '\\d{2}')
      .replace('yyyy', '\\d{4}')
      .replace('.', '\\.')
      .replace('/', '\\/')
      .replace('-', '\\-')

    const regex = new RegExp(pattern, 'g')
    const matches = this.options.text.match(regex) || []

    for (const match of matches) {
      // Validate the date is actually valid
      const isValid = this.isValidDate(match, format)
      if (!isValid) {
        this.addResult({
          severity: 'warn',
          code: 'INVALID_DATE',
          message: `Date "${match}" does not appear to be valid`,
          field: null,
          evidence: this.findEvidence(match),
        })
      }
    }
  }

  private isValidDate(dateStr: string, format: string): boolean {
    try {
      // Simple validation - extract parts and check ranges
      let day: number, month: number, year: number

      if (format.includes('dd.MM.yyyy') || format.includes('dd/MM/yyyy')) {
        const parts = dateStr.split(/[./-]/)
        day = parseInt(parts[0], 10)
        month = parseInt(parts[1], 10)
        year = parseInt(parts[2], 10)
      } else if (format.includes('yyyy-MM-dd')) {
        const parts = dateStr.split('-')
        year = parseInt(parts[0], 10)
        month = parseInt(parts[1], 10)
        day = parseInt(parts[2], 10)
      } else {
        return true // Unknown format, assume valid
      }

      return (
        day >= 1 && day <= 31 &&
        month >= 1 && month <= 12 &&
        year >= 1900 && year <= 2100
      )
    } catch {
      return false
    }
  }

  private validateCurrencyPresence(code: string, symbols: string[]): void {
    // Check that at least one currency symbol is present in monetary values
    // This is informational - just checking document uses expected currency
    const hasSymbol = symbols.some(s => this.options.text.includes(s))

    if (!hasSymbol) {
      this.addResult({
        severity: 'info',
        code: 'CURRENCY_SYMBOL_MISSING',
        message: `Expected currency symbol for ${code} (${symbols.join(', ')}) not found`,
        field: null,
        evidence: null,
      })
    }
  }

  private validatePhoneFormat(pattern: string, description: string): void {
    const regex = new RegExp(pattern, 'g')
    const matches = this.options.text.match(regex) || []

    // Just informational - phone found or not
    if (matches.length > 0 && this.options.debug) {
      console.log(`  - Found ${matches.length} phone numbers matching: ${description}`)
    }
  }

  private validateNationalId(pattern: string, checksum: string | undefined, _description: string): void {
    const regex = new RegExp(pattern, 'g')
    const matches = this.options.text.match(regex) || []

    for (const match of matches) {
      // If checksum validation is specified
      if (checksum === 'tckimlik') {
        if (!validateTCKimlik(match)) {
          this.addResult({
            severity: 'warn',
            code: 'INVALID_TC_KIMLIK',
            message: `TC Kimlik "${match}" failed checksum validation`,
            field: 'insured.tcKimlik',
            evidence: this.findEvidence(match),
          })
        }
      }
    }
  }

  // ============================================================================
  // POLICY VALIDATORS
  // ============================================================================

  private runPolicyValidators(): void {
    const policy = this.options.policyPack!

    for (const [fieldPath, validators] of Object.entries(policy.validators)) {
      const field = this.context.fields.get(fieldPath)

      for (const validator of validators) {
        // Check if field is required
        if (validator.required && !field) {
          this.addResult({
            severity: validator.severity,
            code: 'MISSING_REQUIRED_FIELD',
            message: validator.message || `Required field "${fieldPath}" is missing`,
            field: fieldPath,
            evidence: null,
          })
          continue
        }

        // Skip if field not present and not required
        if (!field) continue

        // Regex validation
        if (validator.regex) {
          const regex = new RegExp(validator.regex)
          if (!regex.test(field.valueNormalized)) {
            this.addResult({
              severity: validator.severity,
              code: 'INVALID_FORMAT',
              message: validator.message || `Field "${fieldPath}" does not match expected format`,
              field: fieldPath,
              evidence: {
                pageNo: field.evidence.pageNo,
                bbox: field.evidence.bbox,
                quote: field.valueRaw,
              },
            })
          }
        }

        // Parse validation (money, date, number, percent)
        if (validator.parse) {
          const parseResult = this.parseValue(field.valueNormalized, validator.parse)

          if (parseResult.error) {
            this.addResult({
              severity: validator.severity,
              code: 'PARSE_ERROR',
              message: validator.message || `Field "${fieldPath}" could not be parsed as ${validator.parse}`,
              field: fieldPath,
              evidence: {
                pageNo: field.evidence.pageNo,
                bbox: field.evidence.bbox,
                quote: field.valueRaw,
              },
            })
          } else {
            // Range validation
            if (validator.min !== undefined && parseResult.value! < validator.min) {
              this.addResult({
                severity: validator.severity,
                code: 'VALUE_TOO_LOW',
                message: validator.message || `Field "${fieldPath}" value ${parseResult.value} is below minimum ${validator.min}`,
                field: fieldPath,
                evidence: {
                  pageNo: field.evidence.pageNo,
                  bbox: field.evidence.bbox,
                  quote: field.valueRaw,
                },
              })
            }

            if (validator.max !== undefined && parseResult.value! > validator.max) {
              this.addResult({
                severity: validator.severity,
                code: 'VALUE_TOO_HIGH',
                message: validator.message || `Field "${fieldPath}" value ${parseResult.value} is above maximum ${validator.max}`,
                field: fieldPath,
                evidence: {
                  pageNo: field.evidence.pageNo,
                  bbox: field.evidence.bbox,
                  quote: field.valueRaw,
                },
              })
            }
          }
        }

        // Custom rule validation
        if (validator.rule) {
          this.runCustomRule(validator.rule, field, fieldPath, validator.severity, validator.message)
        }
      }
    }
  }

  private parseValue(value: string, type: 'money' | 'date' | 'number' | 'percent'): { value?: number; error?: string } {
    try {
      switch (type) {
        case 'money': {
          // Handle Turkish format: 1.234,56 or 1234.56
          const moneyStr = value
            .replace(/[₺TL\s]/g, '')
            .replace(/\./g, '')
            .replace(',', '.')
          return { value: parseFloat(moneyStr) }
        }

        case 'number': {
          const numStr = value.replace(/\./g, '').replace(',', '.')
          return { value: parseFloat(numStr) }
        }

        case 'percent': {
          const percentStr = value.replace('%', '').trim()
          return { value: parseFloat(percentStr) }
        }

        case 'date': {
          // Return timestamp for comparison
          const parts = value.split(/[./-]/)
          if (parts.length === 3) {
            // Assume dd.MM.yyyy or yyyy-MM-dd
            const day = parts[0].length === 4 ? parseInt(parts[2]) : parseInt(parts[0])
            const month = parts[0].length === 4 ? parseInt(parts[1]) - 1 : parseInt(parts[1]) - 1
            const year = parts[0].length === 4 ? parseInt(parts[0]) : parseInt(parts[2])
            return { value: new Date(year, month, day).getTime() }
          }
          return { error: 'Invalid date format' }
        }

        default:
          return { error: 'Unknown parse type' }
      }
    } catch (e) {
      return { error: `Parse error: ${e}` }
    }
  }

  private runCustomRule(
    rule: string,
    field: ExtractedField,
    fieldPath: string,
    severity: ValidationSeverity,
    message?: string
  ): void {
    switch (rule) {
      case 'tcKimlikChecksum':
        if (!validateTCKimlik(field.valueNormalized)) {
          this.addResult({
            severity,
            code: 'TC_KIMLIK_CHECKSUM_FAILED',
            message: message || 'TC Kimlik checksum validation failed',
            field: fieldPath,
            evidence: {
              pageNo: field.evidence.pageNo,
              bbox: field.evidence.bbox,
              quote: field.valueRaw,
            },
          })
        }
        break

      case 'vinCheckDigit':
        if (!this.validateVINCheckDigit(field.valueNormalized)) {
          this.addResult({
            severity,
            code: 'VIN_CHECK_DIGIT_FAILED',
            message: message || 'VIN check digit validation failed',
            field: fieldPath,
            evidence: {
              pageNo: field.evidence.pageNo,
              bbox: field.evidence.bbox,
              quote: field.valueRaw,
            },
          })
        }
        break

      case 'premiumSumCheck':
        this.validatePremiumSum(field, fieldPath, severity, message)
        break

      case 'pageSequenceMustBeContinuous':
        this.validatePageSequence(severity, message)
        break

      case 'mustBe0to100': {
        const percentValue = parseFloat(field.valueNormalized.replace('%', ''))
        if (percentValue < 0 || percentValue > 100) {
          this.addResult({
            severity,
            code: 'PERCENT_OUT_OF_RANGE',
            message: message || 'Percentage must be between 0 and 100',
            field: fieldPath,
            evidence: {
              pageNo: field.evidence.pageNo,
              bbox: field.evidence.bbox,
              quote: field.valueRaw,
            },
          })
        }
        break
      }

      default:
        console.warn(`[Validator] Unknown custom rule: ${rule}`)
    }
  }

  private validateVINCheckDigit(vin: string): boolean {
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) {
      return false
    }

    const transliteration: Record<string, number> = {
      A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
      J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
      S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
    }

    const weights = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2]

    let sum = 0
    for (let i = 0; i < 17; i++) {
      const char = vin[i]
      const value = /\d/.test(char) ? parseInt(char, 10) : transliteration[char] || 0
      sum += value * weights[i]
    }

    const checkDigit = sum % 11
    const expectedChar = checkDigit === 10 ? 'X' : checkDigit.toString()

    return vin[8] === expectedChar
  }

  private validatePremiumSum(
    totalField: ExtractedField,
    fieldPath: string,
    severity: ValidationSeverity,
    message?: string
  ): void {
    const netPremium = this.context.fields.get('premium.netPremium')
    const bsmv = this.context.fields.get('premium.bsmv')

    if (!netPremium || !bsmv) return

    const netValue = parseFloat(netPremium.valueNormalized.replace(/[^\d.,]/g, '').replace(',', '.'))
    const bsmvValue = parseFloat(bsmv.valueNormalized.replace(/[^\d.,]/g, '').replace(',', '.'))
    const totalValue = parseFloat(totalField.valueNormalized.replace(/[^\d.,]/g, '').replace(',', '.'))

    const expectedTotal = netValue + bsmvValue

    // Allow 1% tolerance for rounding
    if (Math.abs(expectedTotal - totalValue) > expectedTotal * 0.01) {
      this.addResult({
        severity,
        code: 'PREMIUM_SUM_MISMATCH',
        message: message || `Total premium (${totalValue}) does not equal net premium (${netValue}) + BSMV (${bsmvValue})`,
        field: fieldPath,
        evidence: {
          pageNo: totalField.evidence.pageNo,
          bbox: totalField.evidence.bbox,
          quote: `Net: ${netPremium.valueRaw}, BSMV: ${bsmv.valueRaw}, Total: ${totalField.valueRaw}`,
        },
      })
    }
  }

  private validatePageSequence(severity: ValidationSeverity, message?: string): void {
    // Extract page markers from text
    const pageMarkerRegex = /Sayfa\s*:\s*(\d+)\s*\/\s*(\d+)/gi
    const matches = [...this.options.text.matchAll(pageMarkerRegex)]

    if (matches.length === 0) return

    const pages = matches.map(m => ({
      current: parseInt(m[1]),
      total: parseInt(m[2]),
    }))

    // Check sequence
    for (let i = 0; i < pages.length; i++) {
      if (pages[i].current !== i + 1) {
        this.addResult({
          severity,
          code: 'PAGE_SEQUENCE_DISCONTINUOUS',
          message: message || `Page sequence is not continuous: expected page ${i + 1}, found ${pages[i].current}`,
          field: null,
          evidence: this.findEvidence(`Sayfa : ${pages[i].current}`),
        })
        break
      }
    }
  }

  // ============================================================================
  // DOCUMENT-LEVEL VALIDATORS
  // ============================================================================

  private runDocumentValidators(): void {
    // Check for remaining OCR artifacts
    this.checkForOCRArtifacts()

    // Check for suspicious patterns
    this.checkForSuspiciousPatterns()

    // Check document completeness (if policy pack defines required fields)
    if (this.options.policyPack) {
      this.checkDocumentCompleteness()
    }
  }

  private checkForOCRArtifacts(): void {
    const artifacts = [
      { pattern: /B\^\^\^B/gi, name: 'B^^^B barcode artifact' },
      { pattern: /a!{3,}a/gi, name: 'a!!!a barcode artifact' },
      { pattern: /[<>[\]{}|\\^$@#]{5,}/g, name: 'Special character cluster' },
    ]

    for (const artifact of artifacts) {
      const matches = this.options.text.match(artifact.pattern)
      if (matches && matches.length > 0) {
        this.addResult({
          severity: 'error',
          code: 'OCR_ARTIFACT_PRESENT',
          message: `OCR artifact found: ${artifact.name} (${matches.length} occurrences)`,
          field: null,
          evidence: this.findEvidence(matches[0]),
        })
      }
    }
  }

  private checkForSuspiciousPatterns(): void {
    // Check for excessive single-letter sequences (possible OCR split issue)
    const spacedLetters = this.options.text.match(/(?:[A-ZÇĞİÖŞÜ]\s+){4,}[A-ZÇĞİÖŞÜ]/g)
    if (spacedLetters && spacedLetters.length > 0) {
      this.addResult({
        severity: 'warn',
        code: 'POSSIBLE_SPLIT_LETTERS',
        message: `Possible unmerged spaced letters found (${spacedLetters.length} instances)`,
        field: null,
        evidence: this.findEvidence(spacedLetters[0]),
      })
    }
  }

  private checkDocumentCompleteness(): void {
    const requiredFields = this.options.policyPack!.extractionTargets.filter(target => {
      const validators = this.options.policyPack!.validators[target]
      return validators?.some(v => v.required || v.severity === 'critical')
    })

    const missingCritical: string[] = []
    for (const field of requiredFields) {
      if (!this.context.fields.has(field)) {
        missingCritical.push(field)
      }
    }

    if (missingCritical.length > 0) {
      this.addResult({
        severity: 'critical',
        code: 'INCOMPLETE_DOCUMENT',
        message: `Missing critical fields: ${missingCritical.join(', ')}`,
        field: null,
        evidence: null,
      })
    }
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private addResult(result: Omit<ValidationResult, 'docId' | 'rulePackId' | 'ruleId' | 'createdAt'>): void {
    this.context.results.push({
      docId: this.options.docId,
      ...result,
      rulePackId: this.options.policyPack?.id || this.options.localePack.id,
      ruleId: result.code,
      createdAt: new Date(),
    })
  }

  private findEvidence(text: string): ValidationEvidence | null {
    const index = this.options.text.indexOf(text)
    if (index === -1) return null

    // Extract context around the match
    const start = Math.max(0, index - 50)
    const end = Math.min(this.options.text.length, index + text.length + 50)
    const context = this.options.text.slice(start, end)

    return {
      pageNo: 1, // Would need layout info for actual page
      bbox: { x: 0, y: 0, width: 0, height: 0 }, // Would need layout info
      quote: text,
      context,
    }
  }

  private calculateOverallConfidence(): number {
    const results = this.context.results
    if (results.length === 0) return 1.0

    // Weight by severity
    const weights = { critical: 1.0, error: 0.5, warn: 0.2, info: 0.05 }

    let totalPenalty = 0
    for (const result of results) {
      totalPenalty += weights[result.severity]
    }

    // Cap penalty at 1.0
    return Math.max(0, 1 - Math.min(totalPenalty, 1))
  }

  private determineQuarantineReason(critical: ValidationResult[]): string | undefined {
    if (critical.length === 0) return undefined

    // Summarize critical issues
    const codes = [...new Set(critical.map(c => c.code))]
    return `Critical validation failures: ${codes.join(', ')}`
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Quick validate with options
 */
export function validateDocument(options: ValidateOptions): ValidationGateResult {
  const validator = new Validator(options)
  return validator.validate()
}

// ============================================================================
// EXPORTS
// ============================================================================

// Validator class is already exported at definition
export type { ValidateOptions, ValidateContext }
