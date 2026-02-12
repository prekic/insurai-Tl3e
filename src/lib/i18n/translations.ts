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
    noNotifications: string
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
    // Hero
    heroTitle: string
    heroSubtitle: string
    heroDescription: string
    uploadCta: string
    viewDemo: string
    trustedBy: string
    badge: string
    headlineMobile: string
    headlineDesktop: string
    headlineHighlight: string
    subheadline: string
    analyzeCtaButton: string
    analyzingText: string
    seeExample: string
    freeNoSignup: string
    kvkkCompliant: string
    sslBadge: string
    whatYouGet: string
    benefitFormats: string
    benefitBilingual: string
    benefitComparison: string
    samplePoliciesTitle: string
    samplePoliciesDesc: string
    viewAll: string
    builtForProfessionals: string
    supportedPolicyTypes: string
    policyAnalysisPlatform: string
    secureEncrypted: string
    licensedAdvisors: string
    uploadPolicyButton: string
    signedOutSuccess: string
    signOutFailed: string
    guest: string
    notSignedIn: string

    // How It Works
    howItWorks: string
    howItWorksSubtitle: string
    simpleProcess: string
    howItWorksHeadline: string
    howItWorksDesc: string
    step1Title: string
    step1Description: string
    step2Title: string
    step2Description: string
    step3Title: string
    step3Description: string

    // Benefits
    benefits: string
    benefitsSubtitle: string
    benefitsSectionDesc: string
    benefitAnalysisTitle: string
    benefitAnalysisDesc: string
    benefitInstantTitle: string
    benefitInstantDesc: string
    benefitMultiLangTitle: string
    benefitMultiLangDesc: string
    benefitRenewalTitle: string
    benefitRenewalDesc: string
    benefitSecurityTitle: string
    benefitSecurityDesc: string
    benefitBenchmarkTitle: string
    benefitBenchmarkDesc: string

    // Stats
    statPolicyTypes: string
    statPolicyTypesValue: string
    statPolicyTypesDetail: string
    statLanguages: string
    statLanguagesValue: string
    statLanguagesDetail: string
    statCoverageChecks: string
    statCoverageChecksValue: string
    statCoverageChecksDetail: string
    statAnalysisTime: string
    statAnalysisTimeValue: string
    statAnalysisTimeDetail: string

    // WhyChooseUs
    whyKvkkTitle: string
    whyKvkkDesc: string
    whyNoSignupTitle: string
    whyNoSignupDesc: string
    whyTurkeyTitle: string
    whyTurkeyDesc: string

    // Testimonials / Use Cases
    useCasesTitle: string
    useCasesHighlight: string
    useCasesSubtitle: string
    useCaseBrokers: string
    useCaseBrokersDesc: string
    useCaseRiskManagers: string
    useCaseRiskManagersDesc: string
    useCasePolicyholders: string
    useCasePolicyholdersDesc: string

    // FAQ
    faq: string
    faqSubtitle: string
    faqHighlight: string
    faqQ1: string
    faqA1: string
    faqQ2: string
    faqA2: string
    faqQ3: string
    faqA3: string
    faqQ4: string
    faqA4: string
    faqQ5: string
    faqA5: string

    // Footer
    footerDescription: string
    footerProduct: string
    footerFeatures: string
    footerPricing: string
    footerApi: string
    footerIntegrations: string
    footerCompany: string
    footerAbout: string
    footerBlog: string
    footerCareers: string
    footerContact: string
    footerLocation: string
    footerCopyright: string
    footerPrivacy: string
    footerTerms: string
    footerCookies: string

    // ComparisonMock
    comparisonTitle: string
    comparisonSubtitle: string
    comparisonCoverage: string
    comparisonCollision: string
    comparisonTheft: string
    comparisonNaturalDisaster: string
    comparisonGlass: string
    comparisonRoadside: string
    comparisonAiInsight: string
    comparisonAiInsightText: string
    comparisonSample: string
    comparisonBestCoverage: string
    comparisonLowestPremium: string
    comparisonAiPick: string
    comparisonDisclaimer: string

    // SampleReportPreview
    reportBenchmark: string
    reportSample: string
    reportOverallScore: string
    reportAboveAverage: string
    reportStrongCoverage: string
    reportStrongCoverageDesc: string
    reportGapDetected: string
    reportGapDesc: string
    reportAiRecommendation: string
    reportAiRecommendationDesc: string
    reportFullAnalysis: string
    reportCoverageConfirmed: string
    reportGapMissing: string
    reportAiRecShort: string
    reportScoreLabel: string

    // TrustedProviders
    trustedProvidersTitle: string
    trustedProvidersMore: string
    trustedProvidersWorksWith: string
    trustedProvidersMoreCount: string

    // UploadWidget
    uploadDropHere: string
    uploadOrClick: string
    uploadProcessing: string
    uploadFailed: string
    uploadTryAgain: string
    uploadNoValidFiles: string
    uploadFailedDesc: string
    uploadMaxSize: string

    // CompareSection (CTA)
    ctaTitle: string
    ctaDescription: string
    freeInstantAnalysis: string

    // PolicyComparisonSection
    compareSideBySide: string
    compareSideBySideHighlight: string
    compareDesc: string
    compareCoverage: string
    compareCoverageLimit: string
    compareAnnualPremium: string
    compareDeductible: string
    compareFloodProtection: string
    compareEarthquakeCoverage: string
    compareIncluded: string
    compareExcluded: string
    compareOptional: string
    comparePolicyA: string
    comparePolicyB: string
    compareInsurerA: string
    compareInsurerB: string

    // ComparisonMock - premiums
    comparisonPerYear: string
    comparisonPremiumA: string
    comparisonPremiumB: string

    // WhoItsFor
    whoTitle: string
    whoHighlight: string
    whoDesc: string
    whoBrokersTitle: string
    whoBrokersDesc: string
    whoRiskTitle: string
    whoRiskDesc: string
    whoPolicyholdersTitle: string
    whoPolicyholdersDesc: string
  }

  // Policy related
  policy: {
    policies: string
    policy: string
    policyNumber: string
    provider: string
    type: string
    coverage: string
    sumInsured: string
    limit: string
    sumInsuredLimit: string
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
    totalSumInsured: string
    totalLimit: string
    expiringSoon: string
    noPoliciesFound: string
    uploadFirst: string
    adjustFilters: string
    insured: string
    plate: string
    vehicle: string
    address: string
    business: string
    subject: string
    viewDetails: string
    perYear: string
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
    // Toast messages
    filesAccepted: string
    filesRejected: string
    diagnosticsRunning: string
    diagnosticsTestingProviders: string
    diagnosticsComplete: string
    diagnosticsFailed: string
    diagnosticsUnreachable: string
    diagnosticsUnreachableDesc: string
    retrying: string
    retryingDesc: string
    fileRemoved: string
    fileRemovedDesc: string
    noPolicies: string
    noPoliciesDesc: string
    samplePoliciesLoaded: string
    samplePoliciesLoadedDesc: string
    // Analysis complete
    analysisComplete: string
    analysisCompleteLowConfidence: string
    verifyData: string
    savedToCloud: string
    demoMode: string
    confidence: string
    // Conflict resolution
    duplicateDetected: string
    amendmentDetected: string
    matchesExisting: string
    uploadSkipped: string
    uploadSkippedDesc: string
    policyUpdated: string
    policyUpdatedDesc: string
    updateFailed: string
    policySaved: string
    policySavedDesc: string
    saveFailed: string
    amendmentTracked: string
    amendmentFailed: string
    editMode: string
    editModeDesc: string
    viewPolicyBtn: string
    // Error titles and messages
    errorAnalysisFailed: string
    errorAiNotConfigured: string
    errorAiUnavailable: string
    errorContactSupport: string
    errorPdfTimeout: string
    errorPdfTimeoutMsg: string
    errorPdfTimeoutTip: string
    errorPdfWorker: string
    errorPdfWorkerMsg: string
    errorPdfWorkerTip: string
    errorFileRead: string
    errorFileReadMsg: string
    errorFileReadTip: string
    errorPdfParse: string
    errorPdfParseMsg: string
    errorPdfParseTip: string
    errorRateLimit: string
    errorRateLimitMsg: string
    errorRateLimitTip: string
    errorNetwork: string
    errorNetworkMsg: string
    errorNetworkTip: string
    errorProviderNotReady: string
    errorProviderNotReadyMsg: string
    errorProviderNotReadyTip: string
    errorLowConfidence: string
    errorLowConfidenceMsg: string
    errorLowConfidenceTip: string
    errorRequestTimeout: string
    errorRequestTimeoutMsg: string
    errorRequestTimeoutTip: string
    // Status badges
    checkingBackend: string
    aiExtractionEnabled: string
    demoModeStatus: string
    cloudStorageEnabled: string
    // Production banners
    serviceUnavailable: string
    technicalDifficulties: string
    serviceConfigIssue: string
    serviceNotConfigured: string
    tryAgainBtn: string
    // JSX labels
    openingFileSelector: string
    filesFailedCount: string
    clickRetryOrRemove: string
    retryAll: string
    uploadedFiles: string
    analyzed: string
    processingFiles: string
    viewAnalysis: string
    uploadingStatus: string
    aiAnalyzingStatus: string
    duplicateAwaiting: string
    amendmentAwaiting: string
    lowConfidenceStatus: string
    aiExtractedStatus: string
    demoDataStatus: string
    resolveBtn: string
  }

  // Chat
  chat: {
    title: string
    policiesLoaded: string
    askAboutPolicies: string
    send: string
    sending: string
    connectionIssue: string
    connectionError: string
    retryMessage: string
    welcomeMessage: string
    // Message actions
    copyToClipboard: string
    copied: string
    copy: string
    copiedToClipboard: string
    failedToCopy: string
    helpful: string
    notHelpful: string
    viewPolicy: string
    // Provider
    aiProvider: string
    switchedTo: string
    providerOpenAI: string
    providerOpenAIDescription: string
    providerClaude: string
    providerClaudeDescription: string
    // Quick actions
    comparePolicies: string
    findGaps: string
    whatsMyDeductible: string
    explainKasko: string
    whenExpire: string
    // History
    conversationHistory: string
    noConversations: string
    newChat: string
    loadingHistory: string
    loadConversationFailed: string
    messages: string
    // Greeting
    greeting: string
    greetingWithCount: string
    // Errors
    aiThinking: string
    connectionBanner: string
    dismiss: string
    messageFailed: string
    messageFailedDesc: string
    errorProcessRequest: string
    // Context
    referencing: string
    referencedPolicies: string
    more: string
    // Feedback
    thanksFeedback: string
    willImprove: string
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

  // Authentication
  auth: {
    signIn: string
    signUp: string
    signOut: string
    email: string
    password: string
    confirmPassword: string
    fullName: string
    forgotPassword: string
    resetPassword: string
    noAccount: string
    hasAccount: string
    createAccount: string
    orContinueWith: string
    google: string
    github: string
    passwordMismatch: string
    invalidEmail: string
    passwordTooShort: string
    signInError: string
    signUpError: string
    signUpSuccess: string
    checkEmail: string
    welcomeBack: string
    createYourAccount: string
    namePlaceholder: string
    authNotConfigured: string
    authNotConfiguredDesc: string
    continueToDemo: string
  }

  // AI Insights
  insights: {
    title: string
    aiInsights: string
    showMore: string
    showLess: string
    moreInsights: string
    noInsights: string
    loading: string
  }

  // Policy Evaluation
  evaluation: {
    title: string
    overallScore: string
    grade: string
    coverage: string
    premium: string
    deductible: string
    compliance: string
    value: string
    excellent: string
    good: string
    fair: string
    poor: string
    critical: string
    recommendations: string
    showAllRecommendations: string
    noRecommendations: string
  }

  // Policy Comparison
  comparison: {
    title: string
    compareWith: string
    selectPolicies: string
    differences: string
    similarities: string
    coverageComparison: string
    premiumComparison: string
    noPoliciesSelected: string
    addPolicy: string
    removePolicy: string
    betterValue: string
    worseValue: string
    sameValue: string
  }

  // Insurance Terms
  insurance: {
    kasko: string
    traffic: string
    home: string
    health: string
    life: string
    dask: string
    business: string
    nakliyat: string
    fire: string
    earthquake: string
    flood: string
    theft: string
    collision: string
    naturalDisasters: string
    personalAccident: string
    legalProtection: string
    roadAssistance: string
    glassBreakage: string
    marketValue: string
    unlimited: string
    included: string
    excluded: string
    optional: string
  }

  // Coverage Categories
  coverageCategories: {
    main: string
    liability: string
    supplementary: string
    assistance: string
    legal: string
    other: string
    critical: string
    standard: string
    minor: string
  }

  // Try Analysis (anonymous free trial)
  tryAnalysis: {
    preparingDocument: string
    uploadingDocument: string
    extractingText: string
    analyzingStructure: string
    processingWithAI: string
    almostThere: string
    analysisTimedOut: string
    noResponse: string
    analysisFailed: string
    aiExtractionFailed: string
    noDataExtracted: string
    finalizingAnalysis: string
    analysisComplete: string
    lowConfidenceTitle: string
    analysisSuccessDesc: string
    trialAlreadyUsed: string
    serviceUnavailableToast: string
    pleaseWait: string
    trialAlreadyUsedTitle: string
    trialAlreadyUsedDesc: string
    tryAgainIn: string
    signUpUnlimited: string
    backToHome: string
    freeAnalysisBadge: string
    title: string
    subtitle: string
    analysisFailedTitle: string
    tryAgain: string
    percentComplete: string
    aiAnalyzing: string
    dropFileHere: string
    uploadYourPolicy: string
    dragDropOrClick: string
    secure: string
    aiPowered: string
    oneFreeAnalysis: string
    serviceUnavailable: string
    serviceStartingUp: string
    alreadyHaveAccount: string
  }

  // User Preferences
  preferences: {
    signInRequired: string
    signInDescription: string
    displayPreferences: string
    displayDescription: string
    emailPreferences: string
    emailDescription: string
    title: string
    subtitle: string
    saving: string
    modified: string
    resetAll: string
    defaultLabel: string
    resetToDefault: string
    remove: string
    add: string
    notAvailable: string
    on: string
    off: string
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
    noNotifications: 'No notifications yet',
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
    // Hero
    heroTitle: 'AI-Powered Insurance Analysis',
    heroSubtitle: 'for Turkish Market Professionals',
    heroDescription: 'Upload your policies, get instant AI analysis, and benchmark against market standards.',
    uploadCta: 'Upload your policy',
    viewDemo: 'View Demo',
    trustedBy: 'Trusted by insurance professionals',
    badge: 'AI-powered policy analysis',
    headlineMobile: 'Benchmark your insurance policies',
    headlineDesktop: 'Understand and',
    headlineHighlight: 'benchmark',
    subheadline: 'Upload a policy PDF and get plain-language coverage analysis in seconds.',
    analyzeCtaButton: 'Analyze Your Policy Free',
    analyzingText: 'Analyzing...',
    seeExample: 'See Example Analysis',
    freeNoSignup: 'Free, no signup required',
    kvkkCompliant: 'KVKK Compliant',
    sslBadge: '256-bit SSL',
    whatYouGet: 'What you\'ll get:',
    benefitFormats: 'PDF, Word, and scanned images',
    benefitBilingual: 'Turkish/English coverage explanations',
    benefitComparison: 'Side-by-side policy comparison',
    samplePoliciesTitle: 'Sample Policies Collection',
    samplePoliciesDesc: 'See all Turkish insurance line samples',
    viewAll: 'View All',
    builtForProfessionals: 'Built for Turkish insurance professionals',
    supportedPolicyTypes: 'Kasko, Traffic, DASK, Health, and more',
    policyAnalysisPlatform: 'Policy Analysis Platform',
    secureEncrypted: 'Secure & Encrypted',
    licensedAdvisors: 'Licensed Insurance Advisors',
    uploadPolicyButton: 'Upload Policy',
    signedOutSuccess: 'Signed out successfully',
    signOutFailed: 'Failed to sign out',
    guest: 'Guest',
    notSignedIn: 'Not signed in',

    // How It Works
    howItWorks: 'How it works',
    howItWorksSubtitle: 'Get started in three simple steps',
    simpleProcess: 'Simple Process',
    howItWorksHeadline: 'Three steps to benchmark your policies',
    howItWorksDesc: 'No jargon, no manuals—just clear coverage in your own language.',
    step1Title: 'Upload policies',
    step1Description: 'Drop your insurance documents—PDF, Word, or scanned images. We accept any format.',
    step2Title: 'AI analyzes coverage',
    step2Description: 'Our AI extracts limits, deductibles, extensions, and exclusions and explains them in everyday language.',
    step3Title: 'Compare & track',
    step3Description: 'Compare policies side-by-side and set reminders for renewals and key dates.',

    // Benefits
    benefits: 'Why choose InsurAI',
    benefitsSubtitle: 'Built for insurance professionals',
    benefitsSectionDesc: 'The most powerful insurance analysis platform for Turkish market professionals.',
    benefitAnalysisTitle: 'Comprehensive Analysis',
    benefitAnalysisDesc: 'AI extracts every detail from your policy documents automatically.',
    benefitInstantTitle: 'Instant Results',
    benefitInstantDesc: 'Get detailed coverage breakdowns in seconds, not hours.',
    benefitMultiLangTitle: 'Multi-Language Support',
    benefitMultiLangDesc: 'Works with Turkish and English policies seamlessly.',
    benefitRenewalTitle: 'Renewal Tracking',
    benefitRenewalDesc: 'Never miss a renewal with automated reminders.',
    benefitSecurityTitle: 'Bank-Level Security',
    benefitSecurityDesc: 'Your documents are encrypted and protected.',
    benefitBenchmarkTitle: 'Market Benchmarks',
    benefitBenchmarkDesc: 'Compare your coverage against market standards.',

    // Stats
    statPolicyTypes: 'Policy Types Supported',
    statPolicyTypesValue: '7',
    statPolicyTypesDetail: 'Kasko, Traffic, DASK, Health, Life, Home, Business',
    statLanguages: 'Languages',
    statLanguagesValue: 'TR / EN',
    statLanguagesDetail: 'Full Turkish and English support',
    statCoverageChecks: 'Coverage Checks',
    statCoverageChecksValue: '15+',
    statCoverageChecksDetail: 'Gaps, limits, exclusions, compliance',
    statAnalysisTime: 'Analysis Time',
    statAnalysisTimeValue: '<60s',
    statAnalysisTimeDetail: 'From upload to full benchmark report',

    // WhyChooseUs
    whyKvkkTitle: 'KVKK Compliant',
    whyKvkkDesc: 'Privacy-first design for Turkish data protection',
    whyNoSignupTitle: 'No Signup Required',
    whyNoSignupDesc: 'Try a full policy analysis free, instantly',
    whyTurkeyTitle: 'Turkey-Focused',
    whyTurkeyDesc: 'Built specifically for Turkish insurance market',

    // Testimonials / Use Cases
    useCasesTitle: 'What you can',
    useCasesHighlight: 'do with InsurAI',
    useCasesSubtitle: 'Real use cases for insurance professionals and policyholders.',
    useCaseBrokers: 'Insurance Brokers',
    useCaseBrokersDesc: 'Upload client policies, get instant coverage gap reports, and present side-by-side comparisons — all in minutes instead of hours.',
    useCaseRiskManagers: 'Corporate Risk Managers',
    useCaseRiskManagersDesc: 'Analyze complex commercial policies against market benchmarks and identify under-insured areas before renewal season.',
    useCasePolicyholders: 'Individual Policyholders',
    useCasePolicyholdersDesc: 'Upload your kasko or health policy and get a plain-language explanation of what is and isn\'t covered.',

    // FAQ
    faq: 'Frequently asked questions',
    faqSubtitle: 'Everything you need to know about InsurAI.',
    faqHighlight: 'questions',
    faqQ1: 'What file formats are supported?',
    faqA1: 'We support PDF, Word documents (DOC, DOCX), and image files (PNG, JPG, JPEG). Our AI can also process scanned documents through OCR.',
    faqQ2: 'How accurate is the AI analysis?',
    faqA2: 'Our AI uses multiple models to cross-verify extracted data and flags any uncertainties. Each result includes a confidence score so you know how reliable the extraction is.',
    faqQ3: 'Is my data secure?',
    faqA3: 'Yes, we use bank-level encryption (AES-256) for all documents. Your files are processed securely and never shared with third parties. We are fully KVKK compliant.',
    faqQ4: 'Which insurance types are supported?',
    faqA4: 'We support all major Turkish insurance types including Kasko, Traffic, Home, Health, DASK, Life, and Commercial policies.',
    faqQ5: 'Can I compare policies from different insurers?',
    faqA5: 'Yes. Upload policies from any Turkish insurance company and compare them side-by-side with our AI-powered analysis.',

    // Footer
    footerDescription: 'AI-powered insurance policy analysis platform for Turkish market professionals.',
    footerProduct: 'Product',
    footerFeatures: 'Features',
    footerPricing: 'Pricing',
    footerApi: 'API',
    footerIntegrations: 'Integrations',
    footerCompany: 'Company',
    footerAbout: 'About',
    footerBlog: 'Blog',
    footerCareers: 'Careers',
    footerContact: 'Contact',
    footerLocation: 'Istanbul, Turkey',
    footerCopyright: '© 2025 InsurAI. All rights reserved.',
    footerPrivacy: 'Privacy Policy',
    footerTerms: 'Terms of Service',
    footerCookies: 'Cookie Policy',

    // ComparisonMock
    comparisonTitle: 'Policy Comparison',
    comparisonSubtitle: 'Side-by-side analysis',
    comparisonCoverage: 'Coverage',
    comparisonCollision: 'Collision Coverage',
    comparisonTheft: 'Theft Protection',
    comparisonNaturalDisaster: 'Natural Disaster',
    comparisonGlass: 'Glass Coverage',
    comparisonRoadside: 'Roadside Assist',
    comparisonAiInsight: 'AI Insight:',
    comparisonAiInsightText: 'Policy A offers better natural disaster coverage',
    comparisonSample: 'Sample Comparison',
    comparisonBestCoverage: 'Best Coverage',
    comparisonLowestPremium: 'Lowest Premium',
    comparisonAiPick: 'AI Pick',
    comparisonDisclaimer: 'Illustrative example — your results will reflect your actual policies',

    // SampleReportPreview
    reportBenchmark: 'Benchmark Report',
    reportSample: 'Sample',
    reportOverallScore: 'Overall Score',
    reportAboveAverage: 'Above market average',
    reportStrongCoverage: 'Strong Coverage',
    reportStrongCoverageDesc: 'Collision, theft, fire included',
    reportGapDetected: 'Gap Detected',
    reportGapDesc: 'Missing: Natural disaster coverage',
    reportAiRecommendation: 'AI Recommendation',
    reportAiRecommendationDesc: 'Add flood coverage for +12% protection',
    reportFullAnalysis: 'Full analysis includes 15+ metrics and comparisons',
    reportCoverageConfirmed: 'Collision, theft, fire coverage confirmed',
    reportGapMissing: 'Gap: Natural disaster coverage missing',
    reportAiRecShort: 'AI recommendation: Add flood coverage',
    reportScoreLabel: 'Score: 78/100',

    // TrustedProviders
    trustedProvidersTitle: 'Works with major Turkish insurers',
    trustedProvidersMore: '+more',
    trustedProvidersWorksWith: 'Works with:',
    trustedProvidersMoreCount: '+4 more',

    // UploadWidget
    uploadDropHere: 'Drop your policy here',
    uploadOrClick: 'or click to browse',
    uploadProcessing: 'Processing your policy...',
    uploadFailed: 'Upload failed',
    uploadTryAgain: 'Try again',
    uploadNoValidFiles: 'No valid files selected. Please check file type and size.',
    uploadFailedDesc: 'There was a problem uploading your files. Please try again.',
    uploadMaxSize: 'up to {size}MB',

    // CompareSection (CTA)
    ctaTitle: 'Ready to understand your policies?',
    ctaDescription: 'Upload your first policy and see the power of AI-driven insurance analysis.',
    freeInstantAnalysis: 'Free instant analysis',

    // PolicyComparisonSection
    compareSideBySide: 'Compare policies',
    compareSideBySideHighlight: 'side-by-side',
    compareDesc: 'See the differences between your policies at a glance.',
    compareCoverage: 'Coverage',
    compareCoverageLimit: 'Coverage Limit',
    compareAnnualPremium: 'Annual Premium',
    compareDeductible: 'Deductible',
    compareFloodProtection: 'Flood Protection',
    compareEarthquakeCoverage: 'Earthquake Coverage',
    compareIncluded: 'Included',
    compareExcluded: 'Excluded',
    compareOptional: 'Optional',
    comparePolicyA: 'Policy A',
    comparePolicyB: 'Policy B',
    compareInsurerA: 'Insurer ABC',
    compareInsurerB: 'Insurer XYZ',

    // ComparisonMock - premiums
    comparisonPerYear: '/yr',
    comparisonPremiumA: '₺4,200/yr',
    comparisonPremiumB: '₺3,800/yr',

    // WhoItsFor
    whoTitle: 'Built for',
    whoHighlight: 'insurance professionals',
    whoDesc: 'Whether you\'re a broker, risk manager, or policyholder, InsurAI helps you understand your coverage.',
    whoBrokersTitle: 'Insurance Brokers',
    whoBrokersDesc: 'Quickly analyze and compare policies for your clients.',
    whoRiskTitle: 'Corporate Risk Managers',
    whoRiskDesc: 'Manage complex policy portfolios with ease.',
    whoPolicyholdersTitle: 'Individual Policyholders',
    whoPolicyholdersDesc: 'Understand your coverage in plain language.',
  },

  policy: {
    policies: 'Policies',
    policy: 'Policy',
    policyNumber: 'Policy Number',
    provider: 'Provider',
    type: 'Type',
    coverage: 'Coverage',
    sumInsured: 'Sum Insured',
    limit: 'Limit',
    sumInsuredLimit: 'Sum Insured / Limit',
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
    totalSumInsured: 'Total Sum Insured',
    totalLimit: 'Total Limits',
    expiringSoon: 'Expiring Soon',
    noPoliciesFound: 'No policies found',
    uploadFirst: 'Upload your first policy to get started',
    adjustFilters: 'Try adjusting your filters',
    insured: 'Insured',
    plate: 'Plate',
    vehicle: 'Vehicle',
    address: 'Address',
    business: 'Business',
    subject: 'Subject',
    viewDetails: 'View Details',
    perYear: '/yr',
  },

  upload: {
    title: 'Upload Policies',
    subtitle: 'Upload your insurance documents for AI analysis',
    dropHere: 'Drop your policies here',
    orClickBrowse: 'or click to browse your files',
    supportedFormats: 'Supported',
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
    // Toast messages
    filesAccepted: 'file(s) accepted',
    filesRejected: 'file(s) were rejected due to validation errors.',
    diagnosticsRunning: 'Running diagnostics...',
    diagnosticsTestingProviders: 'Testing API key validity with each provider',
    diagnosticsComplete: 'Diagnostics complete',
    diagnosticsFailed: 'Diagnostics failed',
    diagnosticsUnreachable: 'Could not run diagnostics',
    diagnosticsUnreachableDesc: 'Backend server may not be reachable',
    retrying: 'Retrying...',
    retryingDesc: 'Attempting to process the file again.',
    fileRemoved: 'File removed',
    fileRemovedDesc: 'The file has been removed from the upload queue.',
    noPolicies: 'No policies to analyze',
    noPoliciesDesc: 'Please wait for at least one policy to complete processing.',
    samplePoliciesLoaded: 'Sample policies loaded',
    samplePoliciesLoadedDesc: 'sample Turkish insurance policies have been loaded.',
    // Analysis complete
    analysisComplete: 'Analysis complete',
    analysisCompleteLowConfidence: 'Analysis complete — low confidence',
    verifyData: 'Some data may be inaccurate — please verify.',
    savedToCloud: '(saved to cloud)',
    demoMode: '(demo mode)',
    confidence: 'confidence',
    // Conflict resolution
    duplicateDetected: 'Duplicate detected',
    amendmentDetected: 'Amendment detected',
    matchesExisting: 'matches an existing policy. Please choose how to proceed.',
    uploadSkipped: 'Upload skipped',
    uploadSkippedDesc: 'The policy was not saved as it already exists.',
    policyUpdated: 'Policy updated',
    policyUpdatedDesc: 'The existing policy has been updated with the new data.',
    updateFailed: 'Update failed',
    policySaved: 'Policy saved',
    policySavedDesc: 'The policy has been saved as a separate record.',
    saveFailed: 'Save failed',
    amendmentTracked: 'Amendment tracked',
    amendmentFailed: 'Amendment failed',
    editMode: 'Edit Mode',
    editModeDesc: 'Editing the extracted data before saving. Navigate to the policy to make changes.',
    viewPolicyBtn: 'View Policy',
    // Error titles and messages
    errorAnalysisFailed: 'Analysis Failed',
    errorAiNotConfigured: 'AI Not Configured',
    errorAiUnavailable: 'The AI service is not available.',
    errorContactSupport: 'Please contact support if this issue persists.',
    errorPdfTimeout: 'PDF Processing Timeout',
    errorPdfTimeoutMsg: 'The PDF took too long to process.',
    errorPdfTimeoutTip: 'The file may be too large or complex. Try a smaller file or retry.',
    errorPdfWorker: 'PDF Processing Error',
    errorPdfWorkerMsg: 'The PDF processor encountered an error.',
    errorPdfWorkerTip: 'This is usually temporary. Please try again.',
    errorFileRead: 'File Read Error',
    errorFileReadMsg: 'Could not read the uploaded file.',
    errorFileReadTip: 'The file may have been moved or is corrupted. Please select the file again.',
    errorPdfParse: 'PDF Processing Error',
    errorPdfParseMsg: 'Could not read the PDF file.',
    errorPdfParseTip: 'The file may be corrupted, password-protected, or in an unsupported format.',
    errorRateLimit: 'Rate Limit Exceeded',
    errorRateLimitMsg: 'Too many requests to the AI service.',
    errorRateLimitTip: 'Please wait a few minutes before trying again.',
    errorNetwork: 'Network Error',
    errorNetworkMsg: 'Could not connect to the backend server.',
    errorNetworkTip: 'Please check your internet connection and try again.',
    errorProviderNotReady: 'AI Provider Not Ready',
    errorProviderNotReadyMsg: 'The AI provider is not configured on the server.',
    errorProviderNotReadyTip: 'Please contact support if this issue persists.',
    errorLowConfidence: 'Low Extraction Confidence',
    errorLowConfidenceMsg: 'The AI could not reliably extract data from this document.',
    errorLowConfidenceTip: 'The PDF may be scanned or have poor text quality. Try a clearer document.',
    errorRequestTimeout: 'Request Timeout',
    errorRequestTimeoutMsg: 'The request took too long to complete.',
    errorRequestTimeoutTip: 'The document may be too large or the AI service is slow. Try again later.',
    // Status badges
    checkingBackend: 'Checking backend server...',
    aiExtractionEnabled: 'AI extraction enabled',
    demoModeStatus: 'Demo mode - upload will use sample data',
    cloudStorageEnabled: 'Cloud storage enabled',
    // Production banners
    serviceUnavailable: 'Service Temporarily Unavailable',
    technicalDifficulties: 'We are experiencing technical difficulties. Please try again later.',
    serviceConfigIssue: 'Service Configuration Issue',
    serviceNotConfigured: 'The AI service is not properly configured. Please contact support.',
    tryAgainBtn: 'Try Again',
    // JSX labels
    openingFileSelector: 'Opening file selector...',
    filesFailedCount: 'file(s) failed to process',
    clickRetryOrRemove: 'Click retry to try again or remove the files',
    retryAll: 'Retry All',
    uploadedFiles: 'Uploaded Files',
    analyzed: 'analyzed',
    processingFiles: 'file(s) processing...',
    viewAnalysis: 'View Analysis',
    uploadingStatus: 'Uploading...',
    aiAnalyzingStatus: 'AI analyzing...',
    duplicateAwaiting: 'Duplicate detected - awaiting resolution',
    amendmentAwaiting: 'Amendment detected - awaiting resolution',
    lowConfidenceStatus: 'Low confidence',
    aiExtractedStatus: 'AI extracted',
    demoDataStatus: 'Demo data',
    resolveBtn: 'Resolve',
  },

  chat: {
    title: 'Policy Assistant',
    policiesLoaded: 'policies loaded',
    askAboutPolicies: 'Ask about your policies...',
    send: 'Send',
    sending: 'Sending...',
    connectionIssue: 'Connection issue',
    connectionError: 'Having trouble connecting to the AI assistant',
    retryMessage: 'Retry',
    welcomeMessage: "Hello! I'm your AI insurance assistant. I can help you understand your policies. Ask me anything about your coverage, compare policies, or get recommendations.",
    // Message actions
    copyToClipboard: 'Copy to clipboard',
    copied: 'Copied',
    copy: 'Copy',
    copiedToClipboard: 'Copied to clipboard',
    failedToCopy: 'Failed to copy',
    helpful: 'Helpful',
    notHelpful: 'Not helpful',
    viewPolicy: 'View Policy',
    // Provider
    aiProvider: 'AI Provider',
    switchedTo: 'Switched to',
    providerOpenAI: 'GPT-4o Mini',
    providerOpenAIDescription: 'Fast and cost-effective',
    providerClaude: 'Claude Haiku',
    providerClaudeDescription: 'Nuanced understanding',
    // Quick actions
    comparePolicies: 'Compare my policies',
    findGaps: 'Find coverage gaps',
    whatsMyDeductible: "What's my deductible?",
    explainKasko: 'Explain my Kasko coverage',
    whenExpire: 'When do policies expire?',
    // History
    conversationHistory: 'Conversation History',
    noConversations: 'No conversations yet',
    newChat: 'New Chat',
    loadingHistory: 'Loading...',
    loadConversationFailed: 'Failed to load conversation',
    messages: 'messages',
    // Greeting
    greeting: 'Hello! How can I help you with your insurance policies today?',
    greetingWithCount: "Hello! I'm your AI insurance assistant. I can help you understand your {count} uploaded policies. Ask me anything about your coverage, compare policies, or get recommendations.",
    // Errors
    aiThinking: 'AI is thinking',
    connectionBanner: 'Having trouble connecting to the AI assistant',
    dismiss: 'Dismiss',
    messageFailed: 'Message failed',
    messageFailedDesc: 'There was a problem connecting to the AI assistant.',
    errorProcessRequest: "Sorry, I couldn't process your request. Please try again.",
    // Context
    referencing: 'Referencing:',
    referencedPolicies: 'Referenced Policies:',
    more: 'more',
    // Feedback
    thanksFeedback: 'Thanks for the feedback!',
    willImprove: "We'll try to improve",
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

  auth: {
    signIn: 'Sign In',
    signUp: 'Sign Up',
    signOut: 'Sign Out',
    email: 'Email',
    password: 'Password',
    confirmPassword: 'Confirm Password',
    fullName: 'Full Name',
    forgotPassword: 'Forgot password?',
    resetPassword: 'Reset Password',
    noAccount: "Don't have an account?",
    hasAccount: 'Already have an account?',
    createAccount: 'Create Account',
    orContinueWith: 'Or continue with',
    google: 'Google',
    github: 'GitHub',
    passwordMismatch: 'Passwords do not match',
    invalidEmail: 'Please enter a valid email',
    passwordTooShort: 'Password must be at least 6 characters',
    signInError: 'Failed to sign in. Please check your credentials.',
    signUpError: 'Failed to create account. Please try again.',
    signUpSuccess: 'Account created successfully!',
    checkEmail: 'Check your email to confirm your account.',
    welcomeBack: 'Welcome back',
    createYourAccount: 'Create your account',
    namePlaceholder: 'John Doe',
    authNotConfigured: 'Authentication Not Configured',
    authNotConfiguredDesc: 'Supabase credentials are not set. Please configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.',
    continueToDemo: 'Continue to Demo',
  },

  insights: {
    title: 'AI Insights',
    aiInsights: 'AI Insights',
    showMore: 'Show more',
    showLess: 'Show less',
    moreInsights: 'more insights',
    noInsights: 'No insights available',
    loading: 'Analyzing policy...',
  },

  evaluation: {
    title: 'Policy Evaluation',
    overallScore: 'Overall Score',
    grade: 'Grade',
    coverage: 'Coverage',
    premium: 'Premium',
    deductible: 'Deductible',
    compliance: 'Compliance',
    value: 'Value',
    excellent: 'Excellent',
    good: 'Good',
    fair: 'Fair',
    poor: 'Poor',
    critical: 'Critical',
    recommendations: 'Recommendations',
    showAllRecommendations: 'Show all recommendations',
    noRecommendations: 'No recommendations at this time',
  },

  comparison: {
    title: 'Policy Comparison',
    compareWith: 'Compare with',
    selectPolicies: 'Select policies to compare',
    differences: 'Differences',
    similarities: 'Similarities',
    coverageComparison: 'Coverage Comparison',
    premiumComparison: 'Premium Comparison',
    noPoliciesSelected: 'No policies selected',
    addPolicy: 'Add policy',
    removePolicy: 'Remove policy',
    betterValue: 'Better value',
    worseValue: 'Lower value',
    sameValue: 'Same value',
  },

  insurance: {
    kasko: 'Comprehensive Auto',
    traffic: 'Traffic Insurance',
    home: 'Home Insurance',
    health: 'Health Insurance',
    life: 'Life Insurance',
    dask: 'Earthquake Insurance',
    business: 'Business Insurance',
    nakliyat: 'Cargo Insurance',
    fire: 'Fire',
    earthquake: 'Earthquake',
    flood: 'Flood',
    theft: 'Theft',
    collision: 'Collision',
    naturalDisasters: 'Natural Disasters',
    personalAccident: 'Personal Accident',
    legalProtection: 'Legal Protection',
    roadAssistance: 'Road Assistance',
    glassBreakage: 'Glass Breakage',
    marketValue: 'Market Value',
    unlimited: 'Unlimited',
    included: 'Included',
    excluded: 'Excluded',
    optional: 'Optional',
  },

  coverageCategories: {
    main: 'Main Coverages',
    liability: 'Liability',
    supplementary: 'Supplementary',
    assistance: 'Assistance',
    legal: 'Legal',
    other: 'Other',
    critical: 'Critical',
    standard: 'Standard',
    minor: 'Minor',
  },

  tryAnalysis: {
    preparingDocument: 'Preparing document...',
    uploadingDocument: 'Uploading document...',
    extractingText: 'Extracting text from PDF...',
    analyzingStructure: 'Analyzing document structure...',
    processingWithAI: 'Processing with AI...',
    almostThere: 'Almost there...',
    analysisTimedOut: 'Analysis timed out. The AI service may be busy. Please try again.',
    noResponse: 'No response received from analysis service.',
    analysisFailed: 'Analysis failed',
    aiExtractionFailed: 'AI extraction failed',
    noDataExtracted: 'No data could be extracted from this document.',
    finalizingAnalysis: 'Finalizing analysis...',
    analysisComplete: 'Analysis complete!',
    lowConfidenceTitle: 'Low Confidence Result',
    analysisSuccessDesc: 'Your policy has been analyzed successfully.',
    trialAlreadyUsed: 'You have already used your free trial.',
    serviceUnavailableToast: 'Analysis service is temporarily unavailable. Please try again later.',
    pleaseWait: 'Please wait...',
    trialAlreadyUsedTitle: 'Trial Already Used',
    trialAlreadyUsedDesc: 'You have already used your free policy analysis for this session.',
    tryAgainIn: 'Try again in',
    signUpUnlimited: 'Sign up for unlimited analysis',
    backToHome: 'Back to Home',
    freeAnalysisBadge: 'Free Policy Analysis',
    title: 'Analyze Your Policy',
    subtitle: 'Upload a PDF policy document for instant AI-powered analysis',
    analysisFailedTitle: 'Analysis Failed',
    tryAgain: 'Try Again',
    percentComplete: '% complete',
    aiAnalyzing: 'AI is analyzing your policy...',
    dropFileHere: 'Drop your policy file here',
    uploadYourPolicy: 'Upload Your Policy',
    dragDropOrClick: 'Drag and drop your PDF here, or click to browse',
    secure: 'Secure',
    aiPowered: 'AI-Powered',
    oneFreeAnalysis: 'One free analysis per session',
    serviceUnavailable: 'Analysis service is temporarily unavailable',
    serviceStartingUp: 'The analysis service may be starting up. Please try again in a moment.',
    alreadyHaveAccount: 'Already have an account?',
  },

  preferences: {
    signInRequired: 'Sign in required',
    signInDescription: 'Please sign in to manage your preferences.',
    displayPreferences: 'Display Preferences',
    displayDescription: 'Customize how information is displayed.',
    emailPreferences: 'Email Preferences',
    emailDescription: 'Manage your email notification settings.',
    title: 'Preferences',
    subtitle: 'Customize your experience',
    saving: 'Saving...',
    modified: 'modified',
    resetAll: 'Reset All to Defaults',
    defaultLabel: 'Default',
    resetToDefault: 'Reset to default',
    remove: 'Remove',
    add: 'Add',
    notAvailable: 'N/A',
    on: 'On',
    off: 'Off',
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
    noNotifications: 'Henüz bildirim yok',
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
    // Hero
    heroTitle: 'Yapay Zeka Destekli Sigorta Analizi',
    heroSubtitle: 'Türkiye Sigorta Profesyonelleri için',
    heroDescription: 'Poliçelerinizi yükleyin, anında AI analizi alın ve piyasa standartlarıyla karşılaştırın.',
    uploadCta: 'Poliçenizi yükleyin',
    viewDemo: 'Demo Görüntüle',
    trustedBy: 'Sigorta profesyonellerinin güvendiği',
    badge: 'Yapay zeka destekli poliçe analizi',
    headlineMobile: 'Sigorta poliçelerinizi kıyaslayın',
    headlineDesktop: 'Sigorta poliçelerinizi anlayın ve',
    headlineHighlight: 'kıyaslayın',
    subheadline: 'Bir poliçe PDF yükleyin ve saniyeler içinde anlaşılır teminat analizi alın.',
    analyzeCtaButton: 'Poliçenizi Ücretsiz Analiz Edin',
    analyzingText: 'Analiz ediliyor...',
    seeExample: 'Örnek Analiz Görüntüle',
    freeNoSignup: 'Ücretsiz, kayıt gerekmez',
    kvkkCompliant: 'KVKK Uyumlu',
    sslBadge: '256-bit SSL',
    whatYouGet: 'Ne alacaksınız:',
    benefitFormats: 'PDF, Word ve taranmış belgeler',
    benefitBilingual: 'Türkçe/İngilizce teminat açıklamaları',
    benefitComparison: 'Yan yana poliçe karşılaştırması',
    samplePoliciesTitle: 'Örnek Poliçe Koleksiyonu',
    samplePoliciesDesc: 'Tüm Türk sigorta branş örneklerini görün',
    viewAll: 'Tümünü Gör',
    builtForProfessionals: 'Türk sigorta profesyonelleri için tasarlandı',
    supportedPolicyTypes: 'Kasko, Trafik, DASK, Sağlık ve daha fazlası',
    policyAnalysisPlatform: 'Poliçe Analiz Platformu',
    secureEncrypted: 'Güvenli ve Şifreli',
    licensedAdvisors: 'Lisanslı Sigorta Danışmanları',
    uploadPolicyButton: 'Poliçe Yükle',
    signedOutSuccess: 'Başarıyla çıkış yapıldı',
    signOutFailed: 'Çıkış yapılamadı',
    guest: 'Misafir',
    notSignedIn: 'Giriş yapılmadı',

    // How It Works
    howItWorks: 'Nasıl çalışır',
    howItWorksSubtitle: 'Üç basit adımda başlayın',
    simpleProcess: 'Basit Süreç',
    howItWorksHeadline: 'Poliçelerinizi kıyaslamak için üç adım',
    howItWorksDesc: 'Jargon yok, kılavuz yok—sadece kendi dilinizde net teminat bilgisi.',
    step1Title: 'Poliçe yükleyin',
    step1Description: 'Sigorta belgelerinizi bırakın—PDF, Word veya taranmış görüntüler. Her formatı kabul ediyoruz.',
    step2Title: 'AI teminatları analiz eder',
    step2Description: 'Yapay zekamız limitleri, muafiyetleri, ek teminatları ve istisnaları çıkarır ve günlük dilde açıklar.',
    step3Title: 'Karşılaştırın ve takip edin',
    step3Description: 'Poliçeleri yan yana karşılaştırın ve yenileme tarihleri için hatırlatıcılar ayarlayın.',

    // Benefits
    benefits: 'Neden InsurAI',
    benefitsSubtitle: 'Sigorta profesyonelleri için tasarlandı',
    benefitsSectionDesc: 'Türk sigorta piyasası profesyonelleri için en güçlü sigorta analiz platformu.',
    benefitAnalysisTitle: 'Kapsamlı Analiz',
    benefitAnalysisDesc: 'Yapay zeka, poliçe belgelerinizdeki her detayı otomatik olarak çıkarır.',
    benefitInstantTitle: 'Anlık Sonuçlar',
    benefitInstantDesc: 'Saatler yerine saniyeler içinde detaylı teminat dökümü alın.',
    benefitMultiLangTitle: 'Çoklu Dil Desteği',
    benefitMultiLangDesc: 'Türkçe ve İngilizce poliçelerle sorunsuz çalışır.',
    benefitRenewalTitle: 'Yenileme Takibi',
    benefitRenewalDesc: 'Otomatik hatırlatıcılarla hiçbir yenilemeyi kaçırmayın.',
    benefitSecurityTitle: 'Banka Düzeyinde Güvenlik',
    benefitSecurityDesc: 'Belgeleriniz şifrelenir ve korunur.',
    benefitBenchmarkTitle: 'Piyasa Kıyaslaması',
    benefitBenchmarkDesc: 'Teminatınızı piyasa standartlarıyla karşılaştırın.',

    // Stats
    statPolicyTypes: 'Desteklenen Poliçe Türleri',
    statPolicyTypesValue: '7',
    statPolicyTypesDetail: 'Kasko, Trafik, DASK, Sağlık, Hayat, Konut, İşyeri',
    statLanguages: 'Dil',
    statLanguagesValue: 'TR / EN',
    statLanguagesDetail: 'Tam Türkçe ve İngilizce destek',
    statCoverageChecks: 'Teminat Kontrolleri',
    statCoverageChecksValue: '15+',
    statCoverageChecksDetail: 'Eksiklikler, limitler, istisnalar, uyumluluk',
    statAnalysisTime: 'Analiz Süresi',
    statAnalysisTimeValue: '<60sn',
    statAnalysisTimeDetail: 'Yüklemeden tam kıyaslama raporuna',

    // WhyChooseUs
    whyKvkkTitle: 'KVKK Uyumlu',
    whyKvkkDesc: 'Türk veri koruma mevzuatına uygun tasarım',
    whyNoSignupTitle: 'Kayıt Gerekmez',
    whyNoSignupDesc: 'Hemen ücretsiz tam poliçe analizi deneyin',
    whyTurkeyTitle: 'Türkiye Odaklı',
    whyTurkeyDesc: 'Özellikle Türk sigorta piyasası için geliştirildi',

    // Testimonials / Use Cases
    useCasesTitle: 'InsurAI ile neler',
    useCasesHighlight: 'yapabilirsiniz',
    useCasesSubtitle: 'Sigorta profesyonelleri ve poliçe sahipleri için gerçek kullanım senaryoları.',
    useCaseBrokers: 'Sigorta Brokerleri',
    useCaseBrokersDesc: 'Müşteri poliçelerini yükleyin, anında teminat eksikliği raporları alın ve yan yana karşılaştırmalar sunun — saatler yerine dakikalar içinde.',
    useCaseRiskManagers: 'Kurumsal Risk Yöneticileri',
    useCaseRiskManagersDesc: 'Karmaşık ticari poliçeleri piyasa kıyaslamalarıyla analiz edin ve yenileme sezonundan önce eksik teminatlı alanları belirleyin.',
    useCasePolicyholders: 'Bireysel Poliçe Sahipleri',
    useCasePolicyholdersDesc: 'Kasko veya sağlık poliçenizi yükleyin ve neyin teminatta olup olmadığının anlaşılır bir açıklamasını alın.',

    // FAQ
    faq: 'Sıkça sorulan sorular',
    faqSubtitle: 'InsurAI hakkında bilmeniz gereken her şey.',
    faqHighlight: 'sorular',
    faqQ1: 'Hangi dosya formatları desteklenir?',
    faqA1: 'PDF, Word belgeleri (DOC, DOCX) ve görüntü dosyaları (PNG, JPG, JPEG) desteklenmektedir. Yapay zekamız OCR ile taranmış belgeleri de işleyebilir.',
    faqQ2: 'AI analizi ne kadar doğru?',
    faqA2: 'Yapay zekamız çıkarılan verileri çapraz doğrulamak için birden fazla model kullanır ve belirsizlikleri işaretler. Her sonuç, çıkarımın ne kadar güvenilir olduğunu gösteren bir güven puanı içerir.',
    faqQ3: 'Verilerim güvende mi?',
    faqA3: 'Evet, tüm belgeler için banka düzeyinde şifreleme (AES-256) kullanıyoruz. Dosyalarınız güvenli şekilde işlenir ve üçüncü taraflarla paylaşılmaz. Tamamen KVKK uyumluyuz.',
    faqQ4: 'Hangi sigorta türleri desteklenir?',
    faqA4: 'Kasko, Trafik, Konut, Sağlık, DASK, Hayat ve Ticari poliçeler dahil tüm büyük Türk sigorta türlerini destekliyoruz.',
    faqQ5: 'Farklı sigortacıların poliçelerini karşılaştırabilir miyim?',
    faqA5: 'Evet. Herhangi bir Türk sigorta şirketinden poliçe yükleyin ve yapay zeka destekli analizimizle yan yana karşılaştırın.',

    // Footer
    footerDescription: 'Türk sigorta piyasası profesyonelleri için yapay zeka destekli poliçe analiz platformu.',
    footerProduct: 'Ürün',
    footerFeatures: 'Özellikler',
    footerPricing: 'Fiyatlandırma',
    footerApi: 'API',
    footerIntegrations: 'Entegrasyonlar',
    footerCompany: 'Şirket',
    footerAbout: 'Hakkımızda',
    footerBlog: 'Blog',
    footerCareers: 'Kariyer',
    footerContact: 'İletişim',
    footerLocation: 'İstanbul, Türkiye',
    footerCopyright: '© 2025 InsurAI. Tüm hakları saklıdır.',
    footerPrivacy: 'Gizlilik Politikası',
    footerTerms: 'Kullanım Koşulları',
    footerCookies: 'Çerez Politikası',

    // ComparisonMock
    comparisonTitle: 'Poliçe Karşılaştırması',
    comparisonSubtitle: 'Yan yana analiz',
    comparisonCoverage: 'Teminat',
    comparisonCollision: 'Çarpma/Çarpışma',
    comparisonTheft: 'Hırsızlık Koruması',
    comparisonNaturalDisaster: 'Doğal Afet',
    comparisonGlass: 'Cam Teminatı',
    comparisonRoadside: 'Yol Yardım',
    comparisonAiInsight: 'AI İçgörüsü:',
    comparisonAiInsightText: 'A poliçesi daha iyi doğal afet teminatı sunuyor',
    comparisonSample: 'Örnek Karşılaştırma',
    comparisonBestCoverage: 'En İyi Teminat',
    comparisonLowestPremium: 'En Düşük Prim',
    comparisonAiPick: 'AI Seçimi',
    comparisonDisclaimer: 'Örnek gösterim — sonuçlarınız gerçek poliçelerinizi yansıtacaktır',

    // SampleReportPreview
    reportBenchmark: 'Kıyaslama Raporu',
    reportSample: 'Örnek',
    reportOverallScore: 'Genel Puan',
    reportAboveAverage: 'Piyasa ortalamasının üzerinde',
    reportStrongCoverage: 'Güçlü Teminat',
    reportStrongCoverageDesc: 'Çarpma, hırsızlık, yangın dahil',
    reportGapDetected: 'Eksiklik Tespit Edildi',
    reportGapDesc: 'Eksik: Doğal afet teminatı',
    reportAiRecommendation: 'AI Önerisi',
    reportAiRecommendationDesc: '+%12 koruma için sel teminatı ekleyin',
    reportFullAnalysis: 'Tam analiz 15+ metrik ve karşılaştırma içerir',
    reportCoverageConfirmed: 'Çarpma, hırsızlık, yangın teminatı onaylandı',
    reportGapMissing: 'Eksiklik: Doğal afet teminatı eksik',
    reportAiRecShort: 'AI önerisi: Sel teminatı ekleyin',
    reportScoreLabel: 'Puan: 78/100',

    // TrustedProviders
    trustedProvidersTitle: 'Büyük Türk sigortacılarıyla çalışır',
    trustedProvidersMore: '+daha fazla',
    trustedProvidersWorksWith: 'Çalıştığımız:',
    trustedProvidersMoreCount: '+4 daha',

    // UploadWidget
    uploadDropHere: 'Poliçenizi buraya bırakın',
    uploadOrClick: 'veya göz atmak için tıklayın',
    uploadProcessing: 'Poliçeniz işleniyor...',
    uploadFailed: 'Yükleme başarısız',
    uploadTryAgain: 'Tekrar dene',
    uploadNoValidFiles: 'Geçerli dosya seçilmedi. Dosya türünü ve boyutunu kontrol edin.',
    uploadFailedDesc: 'Dosyalarınız yüklenirken bir sorun oluştu. Lütfen tekrar deneyin.',
    uploadMaxSize: 'en fazla {size}MB',

    // CompareSection (CTA)
    ctaTitle: 'Poliçelerinizi anlamaya hazır mısınız?',
    ctaDescription: 'İlk poliçenizi yükleyin ve yapay zeka destekli sigorta analizinin gücünü görün.',
    freeInstantAnalysis: 'Ücretsiz anlık analiz',

    // PolicyComparisonSection
    compareSideBySide: 'Poliçeleri',
    compareSideBySideHighlight: 'yan yana karşılaştırın',
    compareDesc: 'Poliçeleriniz arasındaki farkları bir bakışta görün.',
    compareCoverage: 'Teminat',
    compareCoverageLimit: 'Teminat Limiti',
    compareAnnualPremium: 'Yıllık Prim',
    compareDeductible: 'Muafiyet',
    compareFloodProtection: 'Sel Koruması',
    compareEarthquakeCoverage: 'Deprem Teminatı',
    compareIncluded: 'Dahil',
    compareExcluded: 'Hariç',
    compareOptional: 'İsteğe Bağlı',
    comparePolicyA: 'Poliçe A',
    comparePolicyB: 'Poliçe B',
    compareInsurerA: 'Sigortacı ABC',
    compareInsurerB: 'Sigortacı XYZ',

    // ComparisonMock - primler
    comparisonPerYear: '/yıl',
    comparisonPremiumA: '₺4.200/yıl',
    comparisonPremiumB: '₺3.800/yıl',

    // WhoItsFor
    whoTitle: 'Sigorta profesyonelleri',
    whoHighlight: 'için tasarlandı',
    whoDesc: 'İster broker, ister risk yöneticisi veya poliçe sahibi olun, InsurAI teminatınızı anlamanıza yardımcı olur.',
    whoBrokersTitle: 'Sigorta Brokerleri',
    whoBrokersDesc: 'Müşterileriniz için poliçeleri hızla analiz edin ve karşılaştırın.',
    whoRiskTitle: 'Kurumsal Risk Yöneticileri',
    whoRiskDesc: 'Karmaşık poliçe portföylerini kolayca yönetin.',
    whoPolicyholdersTitle: 'Bireysel Poliçe Sahipleri',
    whoPolicyholdersDesc: 'Teminatınızı anlaşılır bir dilde anlayın.',
  },

  policy: {
    policies: 'Poliçeler',
    policy: 'Poliçe',
    policyNumber: 'Poliçe Numarası',
    provider: 'Sigorta Şirketi',
    type: 'Tür',
    coverage: 'Teminat',
    sumInsured: 'Sigorta Bedeli',
    limit: 'Limit',
    sumInsuredLimit: 'Bedel / Limit',
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
    totalSumInsured: 'Toplam Bedel',
    totalLimit: 'Toplam Limit',
    expiringSoon: 'Yakında Bitiyor',
    noPoliciesFound: 'Poliçe bulunamadı',
    uploadFirst: 'Başlamak için ilk poliçenizi yükleyin',
    adjustFilters: 'Filtreleri ayarlamayı deneyin',
    insured: 'Sigortalı',
    plate: 'Plaka',
    vehicle: 'Araç',
    address: 'Adres',
    business: 'İşyeri',
    subject: 'Konu',
    viewDetails: 'Detayları Görüntüle',
    perYear: '/yıl',
  },

  upload: {
    title: 'Poliçe Yükle',
    subtitle: 'Sigorta belgelerinizi AI analizi için yükleyin',
    dropHere: 'Poliçelerinizi buraya bırakın',
    orClickBrowse: 'veya göz atmak için tıklayın',
    supportedFormats: 'Desteklenen',
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
    // Toast mesajları
    filesAccepted: 'dosya kabul edildi',
    filesRejected: 'dosya doğrulama hataları nedeniyle reddedildi.',
    diagnosticsRunning: 'Tanılama çalıştırılıyor...',
    diagnosticsTestingProviders: 'Her sağlayıcı ile API anahtarı geçerliliği test ediliyor',
    diagnosticsComplete: 'Tanılama tamamlandı',
    diagnosticsFailed: 'Tanılama başarısız',
    diagnosticsUnreachable: 'Tanılama çalıştırılamadı',
    diagnosticsUnreachableDesc: 'Arka uç sunucuya erişilemiyor olabilir',
    retrying: 'Tekrar deneniyor...',
    retryingDesc: 'Dosya yeniden işlenmeye çalışılıyor.',
    fileRemoved: 'Dosya kaldırıldı',
    fileRemovedDesc: 'Dosya yükleme kuyruğundan kaldırıldı.',
    noPolicies: 'Analiz edilecek poliçe yok',
    noPoliciesDesc: 'Lütfen en az bir poliçenin işlenmesini bekleyin.',
    samplePoliciesLoaded: 'Örnek poliçeler yüklendi',
    samplePoliciesLoadedDesc: 'örnek Türk sigorta poliçesi yüklendi.',
    // Analiz tamamlandı
    analysisComplete: 'Analiz tamamlandı',
    analysisCompleteLowConfidence: 'Analiz tamamlandı — düşük güvenilirlik',
    verifyData: 'Bazı veriler hatalı olabilir — lütfen doğrulayın.',
    savedToCloud: '(buluta kaydedildi)',
    demoMode: '(demo modu)',
    confidence: 'güvenilirlik',
    // Çakışma çözümü
    duplicateDetected: 'Kopya tespit edildi',
    amendmentDetected: 'Değişiklik tespit edildi',
    matchesExisting: 'mevcut bir poliçeyle eşleşiyor. Lütfen nasıl devam edileceğini seçin.',
    uploadSkipped: 'Yükleme atlandı',
    uploadSkippedDesc: 'Poliçe zaten mevcut olduğu için kaydedilmedi.',
    policyUpdated: 'Poliçe güncellendi',
    policyUpdatedDesc: 'Mevcut poliçe yeni verilerle güncellendi.',
    updateFailed: 'Güncelleme başarısız',
    policySaved: 'Poliçe kaydedildi',
    policySavedDesc: 'Poliçe ayrı bir kayıt olarak kaydedildi.',
    saveFailed: 'Kaydetme başarısız',
    amendmentTracked: 'Değişiklik kaydedildi',
    amendmentFailed: 'Değişiklik kaydedilemedi',
    editMode: 'Düzenleme Modu',
    editModeDesc: 'Kaydetmeden önce çıkarılan verileri düzenleyin. Değişiklik yapmak için poliçeye gidin.',
    viewPolicyBtn: 'Poliçeyi Görüntüle',
    // Hata başlıkları ve mesajları
    errorAnalysisFailed: 'Analiz Başarısız',
    errorAiNotConfigured: 'AI Yapılandırılmadı',
    errorAiUnavailable: 'AI servisi kullanılamıyor.',
    errorContactSupport: 'Bu sorun devam ederse lütfen destek ile iletişime geçin.',
    errorPdfTimeout: 'PDF İşleme Zaman Aşımı',
    errorPdfTimeoutMsg: 'PDF işlenmesi çok uzun sürdü.',
    errorPdfTimeoutTip: 'Dosya çok büyük veya karmaşık olabilir. Daha küçük bir dosya deneyin veya tekrar deneyin.',
    errorPdfWorker: 'PDF İşleme Hatası',
    errorPdfWorkerMsg: 'PDF işlemcisi bir hatayla karşılaştı.',
    errorPdfWorkerTip: 'Bu genellikle geçicidir. Lütfen tekrar deneyin.',
    errorFileRead: 'Dosya Okuma Hatası',
    errorFileReadMsg: 'Yüklenen dosya okunamadı.',
    errorFileReadTip: 'Dosya taşınmış veya bozulmuş olabilir. Lütfen dosyayı tekrar seçin.',
    errorPdfParse: 'PDF İşleme Hatası',
    errorPdfParseMsg: 'PDF dosyası okunamadı.',
    errorPdfParseTip: 'Dosya bozuk, şifreli veya desteklenmeyen bir formatta olabilir.',
    errorRateLimit: 'İstek Limiti Aşıldı',
    errorRateLimitMsg: 'AI servisine çok fazla istek gönderildi.',
    errorRateLimitTip: 'Lütfen tekrar denemeden önce birkaç dakika bekleyin.',
    errorNetwork: 'Ağ Hatası',
    errorNetworkMsg: 'Arka uç sunucuya bağlanılamadı.',
    errorNetworkTip: 'Lütfen internet bağlantınızı kontrol edin ve tekrar deneyin.',
    errorProviderNotReady: 'AI Sağlayıcı Hazır Değil',
    errorProviderNotReadyMsg: 'AI sağlayıcı sunucuda yapılandırılmamış.',
    errorProviderNotReadyTip: 'Bu sorun devam ederse lütfen destek ile iletişime geçin.',
    errorLowConfidence: 'Düşük Çıkarım Güvenilirliği',
    errorLowConfidenceMsg: 'AI bu belgeden güvenilir şekilde veri çıkaramadı.',
    errorLowConfidenceTip: 'PDF taranmış veya düşük metin kalitesine sahip olabilir. Daha net bir belge deneyin.',
    errorRequestTimeout: 'İstek Zaman Aşımı',
    errorRequestTimeoutMsg: 'İstek tamamlanması çok uzun sürdü.',
    errorRequestTimeoutTip: 'Belge çok büyük veya AI servisi yavaş olabilir. Daha sonra tekrar deneyin.',
    // Durum rozetleri
    checkingBackend: 'Arka uç sunucu kontrol ediliyor...',
    aiExtractionEnabled: 'AI çıkarım etkin',
    demoModeStatus: 'Demo modu - yükleme örnek veri kullanacak',
    cloudStorageEnabled: 'Bulut depolama etkin',
    // Üretim bannerları
    serviceUnavailable: 'Servis Geçici Olarak Kullanılamıyor',
    technicalDifficulties: 'Teknik zorluklar yaşıyoruz. Lütfen daha sonra tekrar deneyin.',
    serviceConfigIssue: 'Servis Yapılandırma Sorunu',
    serviceNotConfigured: 'AI servisi düzgün yapılandırılmamış. Lütfen destek ile iletişime geçin.',
    tryAgainBtn: 'Tekrar Dene',
    // JSX etiketleri
    openingFileSelector: 'Dosya seçici açılıyor...',
    filesFailedCount: 'dosya işlenemedi',
    clickRetryOrRemove: 'Tekrar denemek veya dosyaları kaldırmak için tıklayın',
    retryAll: 'Tümünü Tekrar Dene',
    uploadedFiles: 'Yüklenen Dosyalar',
    analyzed: 'analiz edildi',
    processingFiles: 'dosya işleniyor...',
    viewAnalysis: 'Analizi Görüntüle',
    uploadingStatus: 'Yükleniyor...',
    aiAnalyzingStatus: 'AI analiz ediyor...',
    duplicateAwaiting: 'Kopya tespit edildi - çözüm bekleniyor',
    amendmentAwaiting: 'Değişiklik tespit edildi - çözüm bekleniyor',
    lowConfidenceStatus: 'Düşük güvenilirlik',
    aiExtractedStatus: 'AI çıkarıldı',
    demoDataStatus: 'Demo verisi',
    resolveBtn: 'Çöz',
  },

  chat: {
    title: 'Poliçe Asistanı',
    policiesLoaded: 'poliçe yüklendi',
    askAboutPolicies: 'Poliçeleriniz hakkında sorun...',
    send: 'Gönder',
    sending: 'Gönderiliyor...',
    connectionIssue: 'Bağlantı sorunu',
    connectionError: 'AI asistanına bağlanırken sorun yaşanıyor',
    retryMessage: 'Tekrar Dene',
    welcomeMessage: 'Merhaba! Ben AI sigorta asistanınızım. Poliçelerinizi anlamanıza yardımcı olabilirim. Teminatlarınız hakkında sorular sorun, poliçeleri karşılaştırın veya öneriler alın.',
    // Mesaj işlemleri
    copyToClipboard: 'Panoya kopyala',
    copied: 'Kopyalandı',
    copy: 'Kopyala',
    copiedToClipboard: 'Panoya kopyalandı',
    failedToCopy: 'Kopyalama başarısız',
    helpful: 'Faydalı',
    notHelpful: 'Faydalı değil',
    viewPolicy: 'Poliçeyi Görüntüle',
    // Sağlayıcı
    aiProvider: 'AI Sağlayıcı',
    switchedTo: 'Değiştirildi:',
    providerOpenAI: 'GPT-4o Mini',
    providerOpenAIDescription: 'Hızlı ve uygun maliyetli',
    providerClaude: 'Claude Haiku',
    providerClaudeDescription: 'Detaylı anlayış',
    // Hızlı işlemler
    comparePolicies: 'Poliçelerimi karşılaştır',
    findGaps: 'Teminat boşluklarını bul',
    whatsMyDeductible: 'Muafiyetim ne kadar?',
    explainKasko: 'Kasko teminatımı açıkla',
    whenExpire: 'Poliçeler ne zaman bitiyor?',
    // Geçmiş
    conversationHistory: 'Konuşma Geçmişi',
    noConversations: 'Henüz konuşma yok',
    newChat: 'Yeni Sohbet',
    loadingHistory: 'Yükleniyor...',
    loadConversationFailed: 'Konuşma yüklenemedi',
    messages: 'mesaj',
    // Karşılama
    greeting: 'Merhaba! Bugün sigorta poliçeleriniz hakkında nasıl yardımcı olabilirim?',
    greetingWithCount: 'Merhaba! Ben AI sigorta asistanınızım. {count} yüklü poliçenizi anlamanıza yardımcı olabilirim. Teminatlarınız hakkında sorular sorun, poliçeleri karşılaştırın veya öneriler alın.',
    // Hatalar
    aiThinking: 'AI düşünüyor',
    connectionBanner: 'AI asistanına bağlanırken sorun yaşanıyor',
    dismiss: 'Kapat',
    messageFailed: 'Mesaj gönderilemedi',
    messageFailedDesc: 'AI asistanına bağlanırken bir sorun oluştu.',
    errorProcessRequest: 'Üzgünüm, isteğinizi işleyemedim. Lütfen tekrar deneyin.',
    // Bağlam
    referencing: 'Referans:',
    referencedPolicies: 'Referans Verilen Poliçeler:',
    more: 'daha',
    // Geri bildirim
    thanksFeedback: 'Geri bildiriminiz için teşekkürler!',
    willImprove: 'İyileştirmeye çalışacağız',
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

  auth: {
    signIn: 'Giriş Yap',
    signUp: 'Kayıt Ol',
    signOut: 'Çıkış Yap',
    email: 'E-posta',
    password: 'Şifre',
    confirmPassword: 'Şifreyi Onayla',
    fullName: 'Ad Soyad',
    forgotPassword: 'Şifremi unuttum',
    resetPassword: 'Şifreyi Sıfırla',
    noAccount: 'Hesabınız yok mu?',
    hasAccount: 'Zaten hesabınız var mı?',
    createAccount: 'Hesap Oluştur',
    orContinueWith: 'Veya şununla devam edin',
    google: 'Google',
    github: 'GitHub',
    passwordMismatch: 'Şifreler eşleşmiyor',
    invalidEmail: 'Geçerli bir e-posta adresi girin',
    passwordTooShort: 'Şifre en az 6 karakter olmalıdır',
    signInError: 'Giriş başarısız. Lütfen bilgilerinizi kontrol edin.',
    signUpError: 'Hesap oluşturulamadı. Lütfen tekrar deneyin.',
    signUpSuccess: 'Hesap başarıyla oluşturuldu!',
    checkEmail: 'Hesabınızı onaylamak için e-postanızı kontrol edin.',
    welcomeBack: 'Tekrar hoş geldiniz',
    createYourAccount: 'Hesabınızı oluşturun',
    namePlaceholder: 'Ahmet Yılmaz',
    authNotConfigured: 'Kimlik Doğrulama Yapılandırılmamış',
    authNotConfiguredDesc: 'Supabase bilgileri ayarlanmamış. Lütfen .env dosyanızda VITE_SUPABASE_URL ve VITE_SUPABASE_ANON_KEY değerlerini yapılandırın.',
    continueToDemo: 'Demoya Devam Et',
  },

  insights: {
    title: 'AI İçgörüleri',
    aiInsights: 'AI İçgörüleri',
    showMore: 'Daha fazla göster',
    showLess: 'Daha az göster',
    moreInsights: 'daha fazla içgörü',
    noInsights: 'Henüz içgörü yok',
    loading: 'Poliçe analiz ediliyor...',
  },

  evaluation: {
    title: 'Poliçe Değerlendirmesi',
    overallScore: 'Genel Puan',
    grade: 'Not',
    coverage: 'Teminat',
    premium: 'Prim',
    deductible: 'Muafiyet',
    compliance: 'Uyumluluk',
    value: 'Değer',
    excellent: 'Mükemmel',
    good: 'İyi',
    fair: 'Orta',
    poor: 'Zayıf',
    critical: 'Kritik',
    recommendations: 'Öneriler',
    showAllRecommendations: 'Tüm önerileri göster',
    noRecommendations: 'Şu anda öneri yok',
  },

  comparison: {
    title: 'Poliçe Karşılaştırması',
    compareWith: 'Şununla karşılaştır',
    selectPolicies: 'Karşılaştırmak için poliçe seçin',
    differences: 'Farklılıklar',
    similarities: 'Benzerlikler',
    coverageComparison: 'Teminat Karşılaştırması',
    premiumComparison: 'Prim Karşılaştırması',
    noPoliciesSelected: 'Poliçe seçilmedi',
    addPolicy: 'Poliçe ekle',
    removePolicy: 'Poliçeyi kaldır',
    betterValue: 'Daha iyi değer',
    worseValue: 'Daha düşük değer',
    sameValue: 'Aynı değer',
  },

  insurance: {
    kasko: 'Kasko',
    traffic: 'Trafik Sigortası',
    home: 'Konut Sigortası',
    health: 'Sağlık Sigortası',
    life: 'Hayat Sigortası',
    dask: 'DASK',
    business: 'İşyeri Sigortası',
    nakliyat: 'Nakliyat Sigortası',
    fire: 'Yangın',
    earthquake: 'Deprem',
    flood: 'Sel/Su Baskını',
    theft: 'Hırsızlık',
    collision: 'Çarpma/Çarpışma',
    naturalDisasters: 'Doğal Afetler',
    personalAccident: 'Ferdi Kaza',
    legalProtection: 'Hukuksal Koruma',
    roadAssistance: 'Yol Yardım',
    glassBreakage: 'Cam Kırılması',
    marketValue: 'Rayiç Değer',
    unlimited: 'Sınırsız',
    included: 'Dahil',
    excluded: 'Hariç',
    optional: 'İsteğe Bağlı',
  },

  coverageCategories: {
    main: 'Ana Teminatlar',
    liability: 'Sorumluluk',
    supplementary: 'Ek Teminatlar',
    assistance: 'Yardım Hizmetleri',
    legal: 'Hukuki',
    other: 'Diğer',
    critical: 'Kritik',
    standard: 'Standart',
    minor: 'Küçük',
  },

  tryAnalysis: {
    preparingDocument: 'Belge hazırlanıyor...',
    uploadingDocument: 'Belge yükleniyor...',
    extractingText: 'PDF\'den metin çıkarılıyor...',
    analyzingStructure: 'Belge yapısı analiz ediliyor...',
    processingWithAI: 'Yapay zeka ile işleniyor...',
    almostThere: 'Neredeyse bitti...',
    analysisTimedOut: 'Analiz zaman aşımına uğradı. Yapay zeka servisi meşgul olabilir. Lütfen tekrar deneyin.',
    noResponse: 'Analiz servisinden yanıt alınamadı.',
    analysisFailed: 'Analiz başarısız oldu',
    aiExtractionFailed: 'Yapay zeka çıkarımı başarısız oldu',
    noDataExtracted: 'Bu belgeden veri çıkarılamadı.',
    finalizingAnalysis: 'Analiz sonuçlandırılıyor...',
    analysisComplete: 'Analiz tamamlandı!',
    lowConfidenceTitle: 'Düşük Güvenilirlik Sonucu',
    analysisSuccessDesc: 'Poliçeniz başarıyla analiz edildi.',
    trialAlreadyUsed: 'Ücretsiz denemenizi zaten kullandınız.',
    serviceUnavailableToast: 'Analiz servisi geçici olarak kullanılamıyor. Lütfen daha sonra tekrar deneyin.',
    pleaseWait: 'Lütfen bekleyin...',
    trialAlreadyUsedTitle: 'Deneme Zaten Kullanıldı',
    trialAlreadyUsedDesc: 'Bu oturum için ücretsiz poliçe analizinizi zaten kullandınız.',
    tryAgainIn: 'Tekrar deneyin:',
    signUpUnlimited: 'Sınırsız analiz için kayıt olun',
    backToHome: 'Ana Sayfaya Dön',
    freeAnalysisBadge: 'Ücretsiz Poliçe Analizi',
    title: 'Poliçenizi Analiz Edin',
    subtitle: 'Anlık yapay zeka destekli analiz için PDF poliçe belgesi yükleyin',
    analysisFailedTitle: 'Analiz Başarısız',
    tryAgain: 'Tekrar Dene',
    percentComplete: '% tamamlandı',
    aiAnalyzing: 'Yapay zeka poliçenizi analiz ediyor...',
    dropFileHere: 'Poliçe dosyanızı buraya bırakın',
    uploadYourPolicy: 'Poliçenizi Yükleyin',
    dragDropOrClick: 'PDF dosyanızı sürükleyip bırakın veya tıklayarak seçin',
    secure: 'Güvenli',
    aiPowered: 'Yapay Zeka Destekli',
    oneFreeAnalysis: 'Oturum başına bir ücretsiz analiz',
    serviceUnavailable: 'Analiz servisi geçici olarak kullanılamıyor',
    serviceStartingUp: 'Analiz servisi başlatılıyor olabilir. Lütfen bir dakika sonra tekrar deneyin.',
    alreadyHaveAccount: 'Zaten hesabınız var mı?',
  },

  preferences: {
    signInRequired: 'Giriş yapmanız gerekiyor',
    signInDescription: 'Tercihlerinizi yönetmek için lütfen giriş yapın.',
    displayPreferences: 'Görüntüleme Tercihleri',
    displayDescription: 'Bilgilerin nasıl görüntüleneceğini özelleştirin.',
    emailPreferences: 'E-posta Tercihleri',
    emailDescription: 'E-posta bildirim ayarlarınızı yönetin.',
    title: 'Tercihler',
    subtitle: 'Deneyiminizi özelleştirin',
    saving: 'Kaydediliyor...',
    modified: 'değiştirildi',
    resetAll: 'Tümünü Varsayılana Sıfırla',
    defaultLabel: 'Varsayılan',
    resetToDefault: 'Varsayılana sıfırla',
    remove: 'Kaldır',
    add: 'Ekle',
    notAvailable: 'Mevcut Değil',
    on: 'Açık',
    off: 'Kapalı',
  },
}

// Pre-loaded translations
export const PRELOADED_TRANSLATIONS: Record<string, TranslationDictionary> = {
  en: EN_TRANSLATIONS,
  tr: TR_TRANSLATIONS,
}
