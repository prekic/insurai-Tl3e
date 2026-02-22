/**
 * Tests for i18n Translations
 * Tests translation dictionaries and locale configurations
 */

import { describe, it, expect } from 'vitest'
import { COMMON_LOCALES } from './translations'
import type { TranslationDictionary, CommonLocale } from './translations'
import { EN_TRANSLATIONS } from './translations-en'
import { TR_TRANSLATIONS } from './translations-tr'

// =============================================================================
// COMMON_LOCALES Tests
// =============================================================================

describe('COMMON_LOCALES', () => {
  it('should have English locale', () => {
    expect(COMMON_LOCALES.en).toBeDefined()
    expect(COMMON_LOCALES.en.name).toBe('English')
    expect(COMMON_LOCALES.en.nativeName).toBe('English')
  })

  it('should have Turkish locale', () => {
    expect(COMMON_LOCALES.tr).toBeDefined()
    expect(COMMON_LOCALES.tr.name).toBe('Turkish')
    expect(COMMON_LOCALES.tr.nativeName).toBe('Türkçe')
  })

  it('should have flags for all locales', () => {
    const locales = Object.values(COMMON_LOCALES)
    for (const locale of locales) {
      expect(locale.flag).toBeDefined()
      expect(locale.flag.length).toBeGreaterThan(0)
    }
  })

  it('should mark Arabic as RTL', () => {
    expect(COMMON_LOCALES.ar.rtl).toBe(true)
  })

  it('should not mark other languages as RTL', () => {
    const nonRTL: CommonLocale[] = ['en', 'tr', 'de', 'fr', 'es']
    for (const locale of nonRTL) {
      expect((COMMON_LOCALES[locale] as any).rtl ?? false).toBe(false)
    }
  })

  it('should include major European languages', () => {
    expect(COMMON_LOCALES.de).toBeDefined() // German
    expect(COMMON_LOCALES.fr).toBeDefined() // French
    expect(COMMON_LOCALES.es).toBeDefined() // Spanish
    expect(COMMON_LOCALES.it).toBeDefined() // Italian
    expect(COMMON_LOCALES.nl).toBeDefined() // Dutch
    expect(COMMON_LOCALES.pl).toBeDefined() // Polish
    expect(COMMON_LOCALES.pt).toBeDefined() // Portuguese
  })

  it('should include major Asian languages', () => {
    expect(COMMON_LOCALES.zh).toBeDefined() // Chinese
    expect(COMMON_LOCALES.ja).toBeDefined() // Japanese
    expect(COMMON_LOCALES.ko).toBeDefined() // Korean
    expect(COMMON_LOCALES.hi).toBeDefined() // Hindi
  })

  it('should include Russian', () => {
    expect(COMMON_LOCALES.ru).toBeDefined()
    expect(COMMON_LOCALES.ru.nativeName).toBe('Русский')
  })

  it('should have name and nativeName for all locales', () => {
    const locales = Object.values(COMMON_LOCALES)
    for (const locale of locales) {
      expect(locale.name).toBeDefined()
      expect(locale.name.length).toBeGreaterThan(0)
      expect(locale.nativeName).toBeDefined()
      expect(locale.nativeName.length).toBeGreaterThan(0)
    }
  })
})

// =============================================================================
// EN_TRANSLATIONS Structure Tests
// =============================================================================

describe('EN_TRANSLATIONS', () => {
  it('should have all required sections', () => {
    expect(EN_TRANSLATIONS.nav).toBeDefined()
    expect(EN_TRANSLATIONS.common).toBeDefined()
    expect(EN_TRANSLATIONS.landing).toBeDefined()
    expect(EN_TRANSLATIONS.policy).toBeDefined()
    expect(EN_TRANSLATIONS.upload).toBeDefined()
    expect(EN_TRANSLATIONS.chat).toBeDefined()
    expect(EN_TRANSLATIONS.settings).toBeDefined()
    expect(EN_TRANSLATIONS.account).toBeDefined()
    expect(EN_TRANSLATIONS.help).toBeDefined()
    expect(EN_TRANSLATIONS.errors).toBeDefined()
    expect(EN_TRANSLATIONS.success).toBeDefined()
    expect(EN_TRANSLATIONS.dashboard).toBeDefined()
    expect(EN_TRANSLATIONS.a11y).toBeDefined()
    expect(EN_TRANSLATIONS.auth).toBeDefined()
  })

  describe('nav section', () => {
    it('should have all navigation keys', () => {
      expect(EN_TRANSLATIONS.nav.home).toBe('Home')
      expect(EN_TRANSLATIONS.nav.dashboard).toBe('Dashboard')
      expect(EN_TRANSLATIONS.nav.compare).toBe('Compare')
      expect(EN_TRANSLATIONS.nav.chat).toBe('Chat')
      expect(EN_TRANSLATIONS.nav.upload).toBe('Upload')
      expect(EN_TRANSLATIONS.nav.settings).toBe('Settings')
      expect(EN_TRANSLATIONS.nav.signOut).toBe('Sign Out')
    })
  })

  describe('common section', () => {
    it('should have basic action words', () => {
      expect(EN_TRANSLATIONS.common.loading).toBe('Loading...')
      expect(EN_TRANSLATIONS.common.error).toBe('Error')
      expect(EN_TRANSLATIONS.common.retry).toBe('Retry')
      expect(EN_TRANSLATIONS.common.cancel).toBe('Cancel')
      expect(EN_TRANSLATIONS.common.save).toBe('Save')
      expect(EN_TRANSLATIONS.common.delete).toBe('Delete')
    })

    it('should have navigation words', () => {
      expect(EN_TRANSLATIONS.common.back).toBe('Back')
      expect(EN_TRANSLATIONS.common.next).toBe('Next')
      expect(EN_TRANSLATIONS.common.previous).toBe('Previous')
    })

    it('should have confirmation words', () => {
      expect(EN_TRANSLATIONS.common.yes).toBe('Yes')
      expect(EN_TRANSLATIONS.common.no).toBe('No')
      expect(EN_TRANSLATIONS.common.confirm).toBe('Confirm')
    })
  })

  describe('landing section', () => {
    it('should have hero content', () => {
      expect(EN_TRANSLATIONS.landing.heroTitle).toBeDefined()
      expect(EN_TRANSLATIONS.landing.heroSubtitle).toBeDefined()
      expect(EN_TRANSLATIONS.landing.heroDescription).toBeDefined()
    })

    it('should have step descriptions', () => {
      expect(EN_TRANSLATIONS.landing.step1Title).toBe('Upload policies')
      expect(EN_TRANSLATIONS.landing.step2Title).toBe('AI analyzes coverage')
      expect(EN_TRANSLATIONS.landing.step3Title).toBe('Compare & track')
    })
  })

  describe('policy section', () => {
    it('should have policy field labels', () => {
      expect(EN_TRANSLATIONS.policy.policyNumber).toBe('Policy Number')
      expect(EN_TRANSLATIONS.policy.provider).toBe('Provider')
      expect(EN_TRANSLATIONS.policy.type).toBe('Type')
      expect(EN_TRANSLATIONS.policy.coverage).toBe('Coverage')
      expect(EN_TRANSLATIONS.policy.premium).toBe('Premium')
      expect(EN_TRANSLATIONS.policy.deductible).toBe('Deductible')
    })

    it('should have status labels', () => {
      expect(EN_TRANSLATIONS.policy.active).toBe('Active')
      expect(EN_TRANSLATIONS.policy.expired).toBe('Expired')
      expect(EN_TRANSLATIONS.policy.expiring).toBe('Expiring')
      expect(EN_TRANSLATIONS.policy.pending).toBe('Pending')
    })
  })

  describe('errors section', () => {
    it('should have file-related errors', () => {
      expect(EN_TRANSLATIONS.errors.fileTooLarge).toBe('File too large')
      expect(EN_TRANSLATIONS.errors.fileTypeNotSupported).toBe('File type not supported')
      expect(EN_TRANSLATIONS.errors.uploadFailed).toBe('Upload failed')
    })

    it('should have network errors', () => {
      expect(EN_TRANSLATIONS.errors.networkError).toBe('Connection error')
      expect(EN_TRANSLATIONS.errors.serverError).toBe('Server error')
      expect(EN_TRANSLATIONS.errors.timeout).toBe('Request timed out')
    })
  })

  describe('auth section', () => {
    it('should have authentication labels', () => {
      expect(EN_TRANSLATIONS.auth.signIn).toBe('Sign In')
      expect(EN_TRANSLATIONS.auth.signUp).toBe('Sign Up')
      expect(EN_TRANSLATIONS.auth.signOut).toBe('Sign Out')
      expect(EN_TRANSLATIONS.auth.email).toBe('Email')
      expect(EN_TRANSLATIONS.auth.password).toBe('Password')
    })

    it('should have validation messages', () => {
      expect(EN_TRANSLATIONS.auth.passwordMismatch).toBe('Passwords do not match')
      expect(EN_TRANSLATIONS.auth.invalidEmail).toBe('Please enter a valid email')
      expect(EN_TRANSLATIONS.auth.passwordTooShort).toBeDefined()
    })
  })
})

// =============================================================================
// TR_TRANSLATIONS Structure Tests
// =============================================================================

describe('TR_TRANSLATIONS', () => {
  it('should have all required sections', () => {
    expect(TR_TRANSLATIONS.nav).toBeDefined()
    expect(TR_TRANSLATIONS.common).toBeDefined()
    expect(TR_TRANSLATIONS.landing).toBeDefined()
    expect(TR_TRANSLATIONS.policy).toBeDefined()
    expect(TR_TRANSLATIONS.upload).toBeDefined()
    expect(TR_TRANSLATIONS.chat).toBeDefined()
    expect(TR_TRANSLATIONS.settings).toBeDefined()
    expect(TR_TRANSLATIONS.account).toBeDefined()
    expect(TR_TRANSLATIONS.help).toBeDefined()
    expect(TR_TRANSLATIONS.errors).toBeDefined()
    expect(TR_TRANSLATIONS.success).toBeDefined()
    expect(TR_TRANSLATIONS.dashboard).toBeDefined()
    expect(TR_TRANSLATIONS.a11y).toBeDefined()
    expect(TR_TRANSLATIONS.auth).toBeDefined()
  })

  describe('nav section', () => {
    it('should have Turkish navigation labels', () => {
      expect(TR_TRANSLATIONS.nav.home).toBe('Ana Sayfa')
      expect(TR_TRANSLATIONS.nav.dashboard).toBe('Panel')
      expect(TR_TRANSLATIONS.nav.settings).toBe('Ayarlar')
      expect(TR_TRANSLATIONS.nav.signOut).toBe('Çıkış Yap')
    })
  })

  describe('common section', () => {
    it('should have Turkish common words', () => {
      expect(TR_TRANSLATIONS.common.loading).toBe('Yükleniyor...')
      expect(TR_TRANSLATIONS.common.error).toBe('Hata')
      expect(TR_TRANSLATIONS.common.retry).toBe('Tekrar Dene')
      expect(TR_TRANSLATIONS.common.cancel).toBe('İptal')
      expect(TR_TRANSLATIONS.common.save).toBe('Kaydet')
    })

    it('should have Turkish yes/no', () => {
      expect(TR_TRANSLATIONS.common.yes).toBe('Evet')
      expect(TR_TRANSLATIONS.common.no).toBe('Hayır')
    })
  })

  describe('landing section', () => {
    it('should have Turkish hero content', () => {
      expect(TR_TRANSLATIONS.landing.heroTitle).toContain('Yapay Zeka')
      expect(TR_TRANSLATIONS.landing.heroSubtitle).toContain('Türkiye')
    })
  })

  describe('policy section', () => {
    it('should have Turkish policy labels', () => {
      expect(TR_TRANSLATIONS.policy.policies).toBe('Poliçeler')
      expect(TR_TRANSLATIONS.policy.policy).toBe('Poliçe')
      expect(TR_TRANSLATIONS.policy.provider).toBe('Sigorta Şirketi')
      expect(TR_TRANSLATIONS.policy.coverage).toBe('Teminat')
      expect(TR_TRANSLATIONS.policy.premium).toBe('Prim')
    })

    it('should have Turkish status labels', () => {
      expect(TR_TRANSLATIONS.policy.active).toBe('Aktif')
      expect(TR_TRANSLATIONS.policy.expired).toBe('Süresi Dolmuş')
      expect(TR_TRANSLATIONS.policy.expiring).toBe('Süresi Doluyor')
    })
  })

  describe('auth section', () => {
    it('should have Turkish auth labels', () => {
      expect(TR_TRANSLATIONS.auth.signIn).toBe('Giriş Yap')
      expect(TR_TRANSLATIONS.auth.signUp).toBe('Kayıt Ol')
      expect(TR_TRANSLATIONS.auth.password).toBe('Şifre')
      expect(TR_TRANSLATIONS.auth.email).toBe('E-posta')
    })
  })
})

// =============================================================================
// Translation Completeness Tests
// =============================================================================

describe('Translation Completeness', () => {
  function getAllKeys(obj: Record<string, unknown>, prefix = ''): string[] {
    const keys: string[] = []
    for (const key of Object.keys(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key
      const value = obj[key]
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        keys.push(...getAllKeys(value as Record<string, unknown>, fullKey))
      } else {
        keys.push(fullKey)
      }
    }
    return keys
  }

  it('should have same structure in EN and TR translations', () => {
    const enKeys = getAllKeys(EN_TRANSLATIONS as unknown as Record<string, unknown>)
    const trKeys = getAllKeys(TR_TRANSLATIONS as unknown as Record<string, unknown>)

    expect(enKeys.sort()).toEqual(trKeys.sort())
  })

  it('should have no empty strings in EN translations', () => {
    const checkEmpty = (obj: Record<string, unknown>, path = ''): string[] => {
      const emptyPaths: string[] = []
      for (const [key, value] of Object.entries(obj)) {
        const currentPath = path ? `${path}.${key}` : key
        if (typeof value === 'string' && value.trim() === '') {
          emptyPaths.push(currentPath)
        } else if (typeof value === 'object' && value !== null) {
          emptyPaths.push(...checkEmpty(value as Record<string, unknown>, currentPath))
        }
      }
      return emptyPaths
    }

    const emptyPaths = checkEmpty(EN_TRANSLATIONS as unknown as Record<string, unknown>)
    expect(emptyPaths).toEqual([])
  })

  it('should have no empty strings in TR translations', () => {
    const checkEmpty = (obj: Record<string, unknown>, path = ''): string[] => {
      const emptyPaths: string[] = []
      for (const [key, value] of Object.entries(obj)) {
        const currentPath = path ? `${path}.${key}` : key
        if (typeof value === 'string' && value.trim() === '') {
          emptyPaths.push(currentPath)
        } else if (typeof value === 'object' && value !== null) {
          emptyPaths.push(...checkEmpty(value as Record<string, unknown>, currentPath))
        }
      }
      return emptyPaths
    }

    const emptyPaths = checkEmpty(TR_TRANSLATIONS as unknown as Record<string, unknown>)
    expect(emptyPaths).toEqual([])
  })
})

// =============================================================================
// Preloaded Locale Coverage Tests
// (PRELOADED_TRANSLATIONS replaced by lazy getPreloadedTranslations() in translation-service)
// =============================================================================

describe('Preloaded locale data', () => {
  it('should have English translations available as a named export', () => {
    expect(EN_TRANSLATIONS).toBeDefined()
    expect(typeof EN_TRANSLATIONS).toBe('object')
  })

  it('should have Turkish translations available as a named export', () => {
    expect(TR_TRANSLATIONS).toBeDefined()
    expect(typeof TR_TRANSLATIONS).toBe('object')
  })
})

// =============================================================================
// Translation Type Tests
// =============================================================================

describe('TranslationDictionary Type', () => {
  it('should be assignable from EN_TRANSLATIONS', () => {
    const dict: TranslationDictionary = EN_TRANSLATIONS
    expect(dict).toBeDefined()
  })

  it('should be assignable from TR_TRANSLATIONS', () => {
    const dict: TranslationDictionary = TR_TRANSLATIONS
    expect(dict).toBeDefined()
  })
})

// =============================================================================
// Turkish Special Characters Tests
// =============================================================================

describe('Turkish Special Characters', () => {
  it('should correctly handle Turkish İ character', () => {
    expect(TR_TRANSLATIONS.common.cancel).toBe('İptal')
    expect(TR_TRANSLATIONS.common.next).toBe('İleri')
  })

  it('should correctly handle Turkish Ş character', () => {
    expect(TR_TRANSLATIONS.policy.provider).toContain('Ş')
    expect(TR_TRANSLATIONS.auth.password).toBe('Şifre')
  })

  it('should correctly handle Turkish Ğ character', () => {
    // "değil" contains ğ
    expect(TR_TRANSLATIONS.a11y.notSelected).toContain('ğ')
  })

  it('should correctly handle Turkish Ü character', () => {
    expect(TR_TRANSLATIONS.nav.home).toContain('Sayfa')
    expect(TR_TRANSLATIONS.landing.howItWorksSubtitle).toContain('Ü')
  })

  it('should correctly handle Turkish Ç character', () => {
    expect(TR_TRANSLATIONS.nav.signOut).toContain('Ç')
    expect(TR_TRANSLATIONS.landing.step3Title).toContain('ş')
  })

  it('should correctly handle Turkish Ö character', () => {
    expect(TR_TRANSLATIONS.common.previous).toBe('Önceki')
  })
})

// =============================================================================
// Specific Translation Content Tests
// =============================================================================

describe('Specific Translation Content', () => {
  describe('Dashboard translations', () => {
    it('should have correct EN dashboard translations', () => {
      expect(EN_TRANSLATIONS.dashboard.title).toBe('Policy Dashboard')
      expect(EN_TRANSLATIONS.dashboard.searchPolicies).toBe('Search policies...')
    })

    it('should have correct TR dashboard translations', () => {
      expect(TR_TRANSLATIONS.dashboard.title).toBe('Poliçe Paneli')
      expect(TR_TRANSLATIONS.dashboard.searchPolicies).toBe('Poliçe ara...')
    })

    it('should have placeholder template in dashboard', () => {
      expect(EN_TRANSLATIONS.dashboard.showingPolicies).toContain('{shown}')
      expect(EN_TRANSLATIONS.dashboard.showingPolicies).toContain('{total}')
      expect(TR_TRANSLATIONS.dashboard.showingPolicies).toContain('{shown}')
      expect(TR_TRANSLATIONS.dashboard.showingPolicies).toContain('{total}')
    })
  })

  describe('Accessibility translations', () => {
    it('should have skip to content translation', () => {
      expect(EN_TRANSLATIONS.a11y.skipToContent).toBe('Skip to main content')
      expect(TR_TRANSLATIONS.a11y.skipToContent).toBe('Ana içeriğe geç')
    })

    it('should have menu state translations', () => {
      expect(EN_TRANSLATIONS.a11y.menuExpanded).toBe('Menu expanded')
      expect(EN_TRANSLATIONS.a11y.menuCollapsed).toBe('Menu collapsed')
      expect(TR_TRANSLATIONS.a11y.menuExpanded).toBe('Menü açık')
      expect(TR_TRANSLATIONS.a11y.menuCollapsed).toBe('Menü kapalı')
    })
  })

  describe('Success messages', () => {
    it('should have policy action success messages', () => {
      expect(EN_TRANSLATIONS.success.policyDeleted).toBe('Policy deleted')
      expect(EN_TRANSLATIONS.success.policyRestored).toBe('Policy restored')
      expect(TR_TRANSLATIONS.success.policyDeleted).toBe('Poliçe silindi')
      expect(TR_TRANSLATIONS.success.policyRestored).toBe('Poliçe geri yüklendi')
    })

    it('should have general success messages', () => {
      expect(EN_TRANSLATIONS.success.settingsSaved).toBe('Settings saved')
      expect(EN_TRANSLATIONS.success.profileUpdated).toBe('Profile updated')
    })
  })
})
