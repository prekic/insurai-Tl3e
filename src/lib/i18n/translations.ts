// i18n Types and Base English Translations

export type SupportedLocale = string // Any locale can be supported via AI translation

// Common locales with display names
export const COMMON_LOCALES = {
  en: { name: 'English', nativeName: 'English', flag: '🇬🇧' },
  tr: { name: 'Turkish', nativeName: 'Türkçe', flag: '🇹🇷' },
  de: { name: 'German', nativeName: 'Deutsch', flag: '🇩🇪' },
  fr: { name: 'French', nativeName: 'Français', flag: '🇫🇷' },
  es: { name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
  ar: { name: 'Arabic', nativeName: 'العربية', flag: '🇸🇦', rtl: true },
  zh: { name: 'Chinese', nativeName: '中文', flag: '🇨🇳' },
  ja: { name: 'Japanese', nativeName: '日本語', flag: '🇯🇵' },
  ko: { name: 'Korean', nativeName: '한국어', flag: '🇰🇷' },
  ru: { name: 'Russian', nativeName: 'Русский', flag: '🇷🇺' },
  pt: { name: 'Portuguese', nativeName: 'Português', flag: '🇵🇹' },
  it: { name: 'Italian', nativeName: 'Italiano', flag: '🇮🇹' },
  nl: { name: 'Dutch', nativeName: 'Nederlands', flag: '🇳🇱' },
  pl: { name: 'Polish', nativeName: 'Polski', flag: '🇵🇱' },
  hi: { name: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳' },
} as const

export type CommonLocale = keyof typeof COMMON_LOCALES

// Translation dictionary structure
export interface TranslationDictionary {
  // Navigation
  nav: {
    home: string
    dashboard: string
    compare: string
    chat: string
    upload: string
    settings: string
    myAccount: string
    helpCenter: string
    signOut: string
    search: string
    notifications: string
    userMenu: string
  }

  // Common UI
  common: {
    loading: string
    error: string
    retry: string
    cancel: string
    save: string
    delete: string
    edit: string
    view: string
    close: string
    back: string
    next: string
    previous: string
    submit: string
    confirm: string
    yes: string
    no: string
    all: string
    none: string
    search: string
    filter: string
    sort: string
    more: string
    less: string
    actions: string
  }

  // Landing Page
  landing: {
    heroTitle: string
    heroSubtitle: string
    heroDescription: string
    uploadCta: string
    viewDemo: string
    trustedBy: string
    howItWorks: string
    howItWorksSubtitle: string
    step1Title: string
    step1Description: string
    step2Title: string
    step2Description: string
    step3Title: string
    step3Description: string
    benefits: string
    benefitsSubtitle: string
    faq: string
    faqSubtitle: string
  }

  // Policy related
  policy: {
    policies: string
    policy: string
    policyNumber: string
    provider: string
    type: string
    coverage: string
    premium: string
    deductible: string
    startDate: string
    expiryDate: string
    status: string
    active: string
    expiring: string
    expired: string
    pending: string
    uploadDate: string
    totalPolicies: string
    totalCoverage: string
    expiringSoon: string
    noPoliciesFound: string
    uploadFirst: string
    adjustFilters: string
  }

  // Upload
  upload: {
    title: string
    subtitle: string
    dropHere: string
    orClickBrowse: string
    supportedFormats: string
    maxSize: string
    uploading: string
    analyzing: string
    complete: string
    failed: string
    retryUpload: string
    removeFile: string
    useSamples: string
    useSamplesDescription: string
    uploadPolicy: string
  }

  // Chat
  chat: {
    title: string
    policiesLoaded: string
    askAboutPolicies: string
    send: string
    sending: string
    connectionError: string
    retryMessage: string
    welcomeMessage: string
  }

  // Settings
  settings: {
    title: string
    appearance: string
    theme: string
    light: string
    dark: string
    system: string
    notifications: string
    emailNotifications: string
    pushNotifications: string
    renewalReminders: string
    marketUpdates: string
    language: string
    selectLanguage: string
    security: string
    changePassword: string
    twoFactor: string
    adminPanel: string
    adminDescription: string
  }

  // Account
  account: {
    title: string
    personalInfo: string
    fullName: string
    email: string
    phone: string
    company: string
    role: string
    memberSince: string
    editProfile: string
  }

  // Help
  help: {
    title: string
    searchHelp: string
    gettingStarted: string
    faq: string
    contactSupport: string
    documentation: string
    chatWithUs: string
  }

  // Errors
  errors: {
    fileTooLarge: string
    fileTypeNotSupported: string
    uploadFailed: string
    processingFailed: string
    networkError: string
    serverError: string
    timeout: string
    analysisFailedTitle: string
    analysisFailedDescription: string
    unknownError: string
    policyNotFound: string
    deleteFailed: string
  }

  // Success messages
  success: {
    policyDeleted: string
    policyRestored: string
    uploadComplete: string
    settingsSaved: string
    profileUpdated: string
  }

  // Dashboard
  dashboard: {
    title: string
    subtitle: string
    totalPolicies: string
    active: string
    totalCoverage: string
    expiringSoon: string
    expired: string
    searchPolicies: string
    filterByStatus: string
    noPoliciesFound: string
    adjustFilters: string
    uploadFirstPolicy: string
    showingPolicies: string
  }

  // Accessibility
  a11y: {
    skipToContent: string
    nowViewing: string
    menuExpanded: string
    menuCollapsed: string
    selected: string
    notSelected: string
    policyStats: string
  }
}

// Base English translations
export const EN_TRANSLATIONS: TranslationDictionary = {
  nav: {
    home: 'Home',
    dashboard: 'Dashboard',
    compare: 'Compare',
    chat: 'Chat',
    upload: 'Upload',
    settings: 'Settings',
    myAccount: 'My Account',
    helpCenter: 'Help Center',
    signOut: 'Sign Out',
    search: 'Search policies',
    notifications: 'Notifications',
    userMenu: 'User menu',
  },

  common: {
    loading: 'Loading...',
    error: 'Error',
    retry: 'Retry',
    cancel: 'Cancel',
    save: 'Save',
    delete: 'Delete',
    edit: 'Edit',
    view: 'View',
    close: 'Close',
    back: 'Back',
    next: 'Next',
    previous: 'Previous',
    submit: 'Submit',
    confirm: 'Confirm',
    yes: 'Yes',
    no: 'No',
    all: 'All',
    none: 'None',
    search: 'Search',
    filter: 'Filter',
    sort: 'Sort',
    more: 'More',
    less: 'Less',
    actions: 'Actions',
  },

  landing: {
    heroTitle: 'AI-Powered Insurance Analysis',
    heroSubtitle: 'for Turkish Market Professionals',
    heroDescription: 'Upload your policies, get instant AI analysis, and benchmark against market standards.',
    uploadCta: 'Upload your policy',
    viewDemo: 'View Demo',
    trustedBy: 'Trusted by insurance professionals',
    howItWorks: 'How it works',
    howItWorksSubtitle: 'Get started in three simple steps',
    step1Title: 'Upload',
    step1Description: 'Upload your insurance policy documents in PDF, Word, or image format.',
    step2Title: 'Analyze',
    step2Description: 'Our AI extracts and analyzes policy details, coverage, and terms.',
    step3Title: 'Compare',
    step3Description: 'Get insights and compare against market benchmarks.',
    benefits: 'Why choose InsurAI',
    benefitsSubtitle: 'Built for insurance professionals',
    faq: 'Frequently asked questions',
    faqSubtitle: 'Everything you need to know about InsurAI.',
  },

  policy: {
    policies: 'Policies',
    policy: 'Policy',
    policyNumber: 'Policy Number',
    provider: 'Provider',
    type: 'Type',
    coverage: 'Coverage',
    premium: 'Premium',
    deductible: 'Deductible',
    startDate: 'Start Date',
    expiryDate: 'Expiry Date',
    status: 'Status',
    active: 'Active',
    expiring: 'Expiring',
    expired: 'Expired',
    pending: 'Pending',
    uploadDate: 'Upload Date',
    totalPolicies: 'Total Policies',
    totalCoverage: 'Total Coverage',
    expiringSoon: 'Expiring Soon',
    noPoliciesFound: 'No policies found',
    uploadFirst: 'Upload your first policy to get started',
    adjustFilters: 'Try adjusting your filters',
  },

  upload: {
    title: 'Upload Policies',
    subtitle: 'Upload your insurance documents for AI analysis',
    dropHere: 'Drop your policies here',
    orClickBrowse: 'or click to browse',
    supportedFormats: 'Supported formats',
    maxSize: 'Maximum size',
    uploading: 'Uploading...',
    analyzing: 'AI analyzing...',
    complete: 'Analysis complete',
    failed: 'Processing failed',
    retryUpload: 'Retry upload',
    removeFile: 'Remove file',
    useSamples: 'Try with Sample Policies',
    useSamplesDescription: 'See how InsurAI analyzes Turkish insurance policies',
    uploadPolicy: 'Upload Policy',
  },

  chat: {
    title: 'Policy Assistant',
    policiesLoaded: 'policies loaded',
    askAboutPolicies: 'Ask about your policies...',
    send: 'Send',
    sending: 'Sending...',
    connectionError: 'Having trouble connecting to the AI assistant',
    retryMessage: 'Retry',
    welcomeMessage: "Hello! I'm your AI insurance assistant. I can help you understand your policies. Ask me anything about your coverage, compare policies, or get recommendations.",
  },

  settings: {
    title: 'Settings',
    appearance: 'Appearance',
    theme: 'Theme',
    light: 'Light',
    dark: 'Dark',
    system: 'System',
    notifications: 'Notifications',
    emailNotifications: 'Email notifications',
    pushNotifications: 'Push notifications',
    renewalReminders: 'Renewal reminders',
    marketUpdates: 'Market updates',
    language: 'Language',
    selectLanguage: 'Select language',
    security: 'Security',
    changePassword: 'Change Password',
    twoFactor: 'Two-Factor Authentication',
    adminPanel: 'Admin Panel',
    adminDescription: 'Manage users, API keys, and system settings',
  },

  account: {
    title: 'My Account',
    personalInfo: 'Personal Information',
    fullName: 'Full Name',
    email: 'Email',
    phone: 'Phone',
    company: 'Company',
    role: 'Role',
    memberSince: 'Member since',
    editProfile: 'Edit Profile',
  },

  help: {
    title: 'Help Center',
    searchHelp: 'Search help articles...',
    gettingStarted: 'Getting Started',
    faq: 'FAQ',
    contactSupport: 'Contact Support',
    documentation: 'Documentation',
    chatWithUs: 'Chat with us',
  },

  errors: {
    fileTooLarge: 'File too large',
    fileTypeNotSupported: 'File type not supported',
    uploadFailed: 'Upload failed',
    processingFailed: 'Processing failed',
    networkError: 'Connection error',
    serverError: 'Server error',
    timeout: 'Request timed out',
    analysisFailedTitle: 'Analysis failed',
    analysisFailedDescription: "We couldn't analyze your policy. Please try uploading again.",
    unknownError: 'Something went wrong',
    policyNotFound: 'Policy not found',
    deleteFailed: 'Delete failed',
  },

  success: {
    policyDeleted: 'Policy deleted',
    policyRestored: 'Policy restored',
    uploadComplete: 'Upload complete',
    settingsSaved: 'Settings saved',
    profileUpdated: 'Profile updated',
  },

  dashboard: {
    title: 'Policy Dashboard',
    subtitle: 'Manage and track all your insurance policies',
    totalPolicies: 'Total Policies',
    active: 'Active',
    totalCoverage: 'Total Coverage',
    expiringSoon: 'Expiring Soon',
    expired: 'Expired',
    searchPolicies: 'Search policies...',
    filterByStatus: 'Filter by status',
    noPoliciesFound: 'No policies found',
    adjustFilters: 'Try adjusting your filters',
    uploadFirstPolicy: 'Upload your first policy to get started',
    showingPolicies: 'Showing {shown} of {total} policies',
  },

  a11y: {
    skipToContent: 'Skip to main content',
    nowViewing: 'Now viewing',
    menuExpanded: 'Menu expanded',
    menuCollapsed: 'Menu collapsed',
    selected: 'Selected',
    notSelected: 'Not selected',
    policyStats: 'Policy statistics',
  },
}

// Turkish translations (pre-loaded for the Turkish market focus)
export const TR_TRANSLATIONS: TranslationDictionary = {
  nav: {
    home: 'Ana Sayfa',
    dashboard: 'Panel',
    compare: 'Karşılaştır',
    chat: 'Sohbet',
    upload: 'Yükle',
    settings: 'Ayarlar',
    myAccount: 'Hesabım',
    helpCenter: 'Yardım Merkezi',
    signOut: 'Çıkış Yap',
    search: 'Poliçe ara',
    notifications: 'Bildirimler',
    userMenu: 'Kullanıcı menüsü',
  },

  common: {
    loading: 'Yükleniyor...',
    error: 'Hata',
    retry: 'Tekrar Dene',
    cancel: 'İptal',
    save: 'Kaydet',
    delete: 'Sil',
    edit: 'Düzenle',
    view: 'Görüntüle',
    close: 'Kapat',
    back: 'Geri',
    next: 'İleri',
    previous: 'Önceki',
    submit: 'Gönder',
    confirm: 'Onayla',
    yes: 'Evet',
    no: 'Hayır',
    all: 'Tümü',
    none: 'Hiçbiri',
    search: 'Ara',
    filter: 'Filtre',
    sort: 'Sırala',
    more: 'Daha fazla',
    less: 'Daha az',
    actions: 'İşlemler',
  },

  landing: {
    heroTitle: 'Yapay Zeka Destekli Sigorta Analizi',
    heroSubtitle: 'Türkiye Sigorta Profesyonelleri için',
    heroDescription: 'Poliçelerinizi yükleyin, anında AI analizi alın ve piyasa standartlarıyla karşılaştırın.',
    uploadCta: 'Poliçenizi yükleyin',
    viewDemo: 'Demo Görüntüle',
    trustedBy: 'Sigorta profesyonellerinin güvendiği',
    howItWorks: 'Nasıl çalışır',
    howItWorksSubtitle: 'Üç basit adımda başlayın',
    step1Title: 'Yükle',
    step1Description: 'Sigorta poliçe belgelerinizi PDF, Word veya resim formatında yükleyin.',
    step2Title: 'Analiz Et',
    step2Description: 'Yapay zekamız poliçe detaylarını, teminatları ve koşulları analiz eder.',
    step3Title: 'Karşılaştır',
    step3Description: 'İçgörüler alın ve piyasa kriterleriyle karşılaştırın.',
    benefits: 'Neden InsurAI',
    benefitsSubtitle: 'Sigorta profesyonelleri için tasarlandı',
    faq: 'Sıkça sorulan sorular',
    faqSubtitle: 'InsurAI hakkında bilmeniz gereken her şey.',
  },

  policy: {
    policies: 'Poliçeler',
    policy: 'Poliçe',
    policyNumber: 'Poliçe Numarası',
    provider: 'Sigorta Şirketi',
    type: 'Tür',
    coverage: 'Teminat',
    premium: 'Prim',
    deductible: 'Muafiyet',
    startDate: 'Başlangıç Tarihi',
    expiryDate: 'Bitiş Tarihi',
    status: 'Durum',
    active: 'Aktif',
    expiring: 'Süresi Doluyor',
    expired: 'Süresi Dolmuş',
    pending: 'Beklemede',
    uploadDate: 'Yükleme Tarihi',
    totalPolicies: 'Toplam Poliçe',
    totalCoverage: 'Toplam Teminat',
    expiringSoon: 'Yakında Bitiyor',
    noPoliciesFound: 'Poliçe bulunamadı',
    uploadFirst: 'Başlamak için ilk poliçenizi yükleyin',
    adjustFilters: 'Filtreleri ayarlamayı deneyin',
  },

  upload: {
    title: 'Poliçe Yükle',
    subtitle: 'Sigorta belgelerinizi AI analizi için yükleyin',
    dropHere: 'Poliçelerinizi buraya bırakın',
    orClickBrowse: 'veya göz atmak için tıklayın',
    supportedFormats: 'Desteklenen formatlar',
    maxSize: 'Maksimum boyut',
    uploading: 'Yükleniyor...',
    analyzing: 'AI analiz ediyor...',
    complete: 'Analiz tamamlandı',
    failed: 'İşlem başarısız',
    retryUpload: 'Tekrar yükle',
    removeFile: 'Dosyayı kaldır',
    useSamples: 'Örnek Poliçelerle Dene',
    useSamplesDescription: "InsurAI'ın Türk sigorta poliçelerini nasıl analiz ettiğini görün",
    uploadPolicy: 'Poliçe Yükle',
  },

  chat: {
    title: 'Poliçe Asistanı',
    policiesLoaded: 'poliçe yüklendi',
    askAboutPolicies: 'Poliçeleriniz hakkında sorun...',
    send: 'Gönder',
    sending: 'Gönderiliyor...',
    connectionError: 'AI asistanına bağlanırken sorun yaşanıyor',
    retryMessage: 'Tekrar Dene',
    welcomeMessage: 'Merhaba! Ben AI sigorta asistanınızım. Poliçelerinizi anlamanıza yardımcı olabilirim. Teminatlarınız hakkında sorular sorun, poliçeleri karşılaştırın veya öneriler alın.',
  },

  settings: {
    title: 'Ayarlar',
    appearance: 'Görünüm',
    theme: 'Tema',
    light: 'Açık',
    dark: 'Koyu',
    system: 'Sistem',
    notifications: 'Bildirimler',
    emailNotifications: 'E-posta bildirimleri',
    pushNotifications: 'Push bildirimleri',
    renewalReminders: 'Yenileme hatırlatıcıları',
    marketUpdates: 'Piyasa güncellemeleri',
    language: 'Dil',
    selectLanguage: 'Dil seçin',
    security: 'Güvenlik',
    changePassword: 'Şifre Değiştir',
    twoFactor: 'İki Faktörlü Kimlik Doğrulama',
    adminPanel: 'Yönetici Paneli',
    adminDescription: 'Kullanıcıları, API anahtarlarını ve sistem ayarlarını yönetin',
  },

  account: {
    title: 'Hesabım',
    personalInfo: 'Kişisel Bilgiler',
    fullName: 'Ad Soyad',
    email: 'E-posta',
    phone: 'Telefon',
    company: 'Şirket',
    role: 'Rol',
    memberSince: 'Üyelik tarihi',
    editProfile: 'Profili Düzenle',
  },

  help: {
    title: 'Yardım Merkezi',
    searchHelp: 'Yardım makalelerinde ara...',
    gettingStarted: 'Başlarken',
    faq: 'SSS',
    contactSupport: 'Destek ile İletişim',
    documentation: 'Dokümantasyon',
    chatWithUs: 'Bizimle sohbet edin',
  },

  errors: {
    fileTooLarge: 'Dosya çok büyük',
    fileTypeNotSupported: 'Dosya türü desteklenmiyor',
    uploadFailed: 'Yükleme başarısız',
    processingFailed: 'İşlem başarısız',
    networkError: 'Bağlantı hatası',
    serverError: 'Sunucu hatası',
    timeout: 'İstek zaman aşımına uğradı',
    analysisFailedTitle: 'Analiz başarısız',
    analysisFailedDescription: 'Poliçenizi analiz edemedik. Lütfen tekrar yüklemeyi deneyin.',
    unknownError: 'Bir şeyler ters gitti',
    policyNotFound: 'Poliçe bulunamadı',
    deleteFailed: 'Silme başarısız',
  },

  success: {
    policyDeleted: 'Poliçe silindi',
    policyRestored: 'Poliçe geri yüklendi',
    uploadComplete: 'Yükleme tamamlandı',
    settingsSaved: 'Ayarlar kaydedildi',
    profileUpdated: 'Profil güncellendi',
  },

  dashboard: {
    title: 'Poliçe Paneli',
    subtitle: 'Tüm sigorta poliçelerinizi yönetin ve takip edin',
    totalPolicies: 'Toplam Poliçe',
    active: 'Aktif',
    totalCoverage: 'Toplam Teminat',
    expiringSoon: 'Yakında Bitiyor',
    expired: 'Süresi Dolmuş',
    searchPolicies: 'Poliçe ara...',
    filterByStatus: 'Duruma göre filtrele',
    noPoliciesFound: 'Poliçe bulunamadı',
    adjustFilters: 'Filtreleri ayarlamayı deneyin',
    uploadFirstPolicy: 'Başlamak için ilk poliçenizi yükleyin',
    showingPolicies: '{total} poliçeden {shown} tanesi gösteriliyor',
  },

  a11y: {
    skipToContent: 'Ana içeriğe geç',
    nowViewing: 'Şu anda görüntüleniyor',
    menuExpanded: 'Menü açık',
    menuCollapsed: 'Menü kapalı',
    selected: 'Seçili',
    notSelected: 'Seçili değil',
    policyStats: 'Poliçe istatistikleri',
  },
}

// Pre-loaded translations
export const PRELOADED_TRANSLATIONS: Record<string, TranslationDictionary> = {
  en: EN_TRANSLATIONS,
  tr: TR_TRANSLATIONS,
}
