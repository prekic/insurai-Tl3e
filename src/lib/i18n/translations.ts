// i18n Types and Base English Translations

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

  // Global (used across many components)
  global: {
    unlimited: string
    marketValue: string
    included: string
    unspecified: string
    critical: string
    important: string
    standard: string
    info: string
    none: string
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
    filter: string
    sort: string
    more: string
    less: string
    showFullText: string
    showLess: string
    showQuote: string
    hideQuote: string
    actions: string
    share: string
    shareFailed: string
    linkCopied: string
    copy: string
    copied: string
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
    testimonialsTitle: string
    testimonialsHighlight: string
    testimonialsSubtitle: string
    testimonial1Author: string
    testimonial1Quote: string
    testimonial2Author: string
    testimonial2Quote: string
    testimonial3Author: string
    testimonial3Quote: string

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
    hideDetails: string
    perYear: string
    coverageDetails: string
    exclusions: string
    specialConditions: string
    included: string
    notIncluded: string
    insuredPerson: string
    location: string
    period: string
    confidence: string
    new: string
    duplicate: string

    // Policy Detail View specific
    criticalCoverage: string
    paidByMarketValue: string
    noUpperLimit: string
    showFullText: string
    textStats: string
    policySummary: string
    keyFeatures: string
    advantages: string
    disadvantages: string
    policyEvaluation: string
    overallScore: string
    scoreBreakdown: string
    coverageQuality: string
    priceValue: string
    reliability: string
    recommendations: string
    highPriority: string
    mediumPriority: string
    actuarialInsights: string
    betaFeature: string
    marketComparison: string
    percentile: string
    expectedOutOfPocket: string
    premiumLabel: string
    expectedUncoveredLoss: string
    contractQualityScore: string
    partsStandard: string
    repairNetwork: string
    additionalCoverageLimited: string
    exclusionsTitle: string
    exclusionsDescription: string
    examples: string
    askInsurer: string
    askInsurerDesc: string
    clarifyWithInsurer: string
    notSpecifiedInPolicy: string
    rawText: string
    documentText: string
    processed: string
    raw: string
    noDeductible: string
    hasDeductible: string
    aboveAverage: string
    belowAverage: string
    marketPercentile: string
    aiInsightsTitle: string
    confidenceLabel: string
    insufficientData: string
    coveredScenariosTitle: string
    yourPremium: string
    marketAvg: string
    activeStatus: string
    aiInsightsTitleExport: string
    clickToViewDetails: string
    copied: string
    copy: string
    coverageLabel: string
    coveragesTitleExport: string
    dates: {
      start: string
      end: string
    }
    deductibleLabel: string
    endDate: string
    exclusionsAndQuestions: string
    exclusionsDesc: string
    exclusionsTitleExport: string
    expiringSoonStatus: string
    expiredStatus: string
    pendingStatus: string
    draftStatus: string
    extractionIncomplete: string
    extractionIncompleteDesc: string
    cannotVerify: string
    freeTrialResult: string
    goBack: string
    goToDashboard: string
    linkCopied: string
    lowConfidenceScore: string
    make: string
    marketValueHelp: string
    model: string
    modelYear: string
    moreInsights: string
    moreRecommendations: string
    notSpecified: string
    policyNotFound: string
    policyNotFoundDesc: string
    policyNumberLabel: string
    share: string
    shareFailed: string
    showLess: string
    signUpAndSave: string
    usageType: string
    vehicleClass: string
    vehicleInfoTitle: string
    vehicleMarketValue: string
    verifyImportantFields: string
    coreKaskoCoverages: string
    coreKaskoCoveragesDesc: string
    coreKaskoCoveragesNote: string
    coverageDeductible: string
    evaluationHistory: string
    evaluationHistoryLoading: string
    evaluationHistoryError: string
    evaluationHistoryEmpty: string
    evaluationHistoryDesc: string
  }

  // Export Menu (PolicyDetailView)
  exportMenu: {
    exportAs: string
    pdfReport: string
    pdfReportDesc: string
    csvExport: string
    csvExportDesc: string
    excelExport: string
    excelExportDesc: string
    excelSuccess: string
    textSummary: string
    textSummaryDesc: string
    generating: string
    pdfSuccess: string
    csvSuccess: string
    textSuccess: string
    exportFailed: string
    popupBlocked: string
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
    useSamplesLink: string
    orTrySamples: string
    addMoreFiles: string
    browseFiles: string
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
    errorOffline: string
    errorOfflineMsg: string
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
    aiConfiguration: string
    openaiLabel: string
    claudeLabel: string
    googleCloudLabel: string
    configured: string
    notConfigured: string
    getKey: string
    openaiDescription: string
    claudeDescription: string
    googleCloudDescription: string
    extraction: string
    consensus: string
    ocr: string
    on: string
    off: string
    demo: string
    apiKeysPrivacy: string
    languageInfo: string
    dataExport: string
    exportCSV: string
    exportPDF: string
    exportDescription: string
    storageCloud: string
    storageLocal: string
    storageLabel: string
    clearAllData: string
    accountSection: string
    signedIn: string
    openaiKeySaved: string
    openaiKeySavedDesc: string
    openaiKeyRemoved: string
    claudeKeySaved: string
    claudeKeySavedDesc: string
    claudeKeyRemoved: string
    googleKeySaved: string
    googleKeySavedDesc: string
    googleKeyRemoved: string
    noPoliciesExport: string
    policiesExported: string
    policiesExportedDesc: string
    pdfGenerated: string
    pdfGeneratedDesc: string
    allDataCleared: string
    allDataClearedDesc: string
    languageChanged: string
    removeOpenaiTitle: string
    removeOpenaiDesc: string
    removeClaudeTitle: string
    removeClaudeDesc: string
    removeGoogleTitle: string
    removeGoogleDesc: string
    removeKey: string
    save: string
    cancel: string
    edit: string
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
    location: string
    namePlaceholder: string
    emailPlaceholder: string
    phonePlaceholder: string
    locationPlaceholder: string
    companyPlaceholder: string
    yourName: string
    addCompany: string
    cloudSynced: string
    localOnly: string
    saving: string
    changePhoto: string
    usageStatistics: string
    policiesAnalyzed: string
    comparisons: string
    savedReports: string
    cloudStorage: string
    localStorage: string
    dataSynced: string
    signInToSync: string
    signIn: string
    profileUpdated: string
    profileUpdatedDesc: string
    profileSavedLocally: string
    profileSavedLocallyDesc: string
    failedToLoad: string
    failedToSave: string
    tryAgain: string
  }

  // Help
  help: {
    title: string
    searchHelp: string
    searchPlaceholder: string
    gettingStarted: string
    gettingStartedDesc: string
    policyAnalysis: string
    policyAnalysisDesc: string
    faq: string
    faqDesc: string
    troubleshooting: string
    troubleshootingDesc: string
    articlesCount: string
    popularArticles: string
    article1: string
    article2: string
    article3: string
    article4: string
    article5: string
    stillNeedHelp: string
    stillNeedHelpDesc: string
    chatWithAI: string
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
    emailPlaceholder: string
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
    subtitle: string
    clearAll: string
    selectedCount: string
    policiesNoLongerExist: string
    policiesDeletedOrMoved: string
    selectPoliciesToCompare: string
    uploadFirst: string
    uploadPolicy: string
    selectMinTwo: string
    comparisonError: string
    categoryWinners: string
    metricsComparison: string
    coverageMatrix: string
    keyDifferences: string
    major: string
    moderate: string
    minor: string
    tradeoffs: string
    aiRecommendation: string
    recommendedChoice: string
    improvementSuggestions: string
    recommendation: string
    exportComparison: string
    exportPdf: string
    exportCsv: string
    quickStats: string
    avgScore: string
    avgPremium: string
    totalCoverage: string
    policiesCompared: string
    scoreChart: string
    premium: string
    coverage: string
    deductible: string
    compliance: string
    value: string
    overall: string
    best: string
    included: string
    notIncluded: string
    pdfExported: string
    csvExported: string
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
    dailyLimitReached: string
    uploadsRemaining: string
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
    preparingToAnalyze: string
    elapsed: string
    detectedPages: string
    detectedProvider: string
    detectedLanguage: string
    tips: {
      tip1: string
      tip2: string
      tip3: string
      tip4: string
      tip5: string
    }
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

  // Shared Result
  shared: {
    analysisNotFound: string
    analysisNotFoundDesc: string
    tryFreeAnalysis: string
    backToHome: string
    linkExpired: string
    linkExpiredDesc: string
    sharedAnalysis: string
    expiresIn: string
    expiringSoon: string
    tryYourOwn: string
    policyAnalysis: string
    policySummary: string
    keyDetails: string
    policyNumber: string
    insured: string
    premium: string
    coverage: string
    coveragesCount: string
    moreCoverages: string
    keyExclusions: string
    aiInsights: string
    wantToAnalyze: string
    wantToAnalyzeDesc: string
    tryFree: string
    kvkkCompliant: string
    dataSecure: string
  }

  // Unsubscribe page
  unsubscribe: {
    title: string
    titleSuccess: string
    titleError: string
    invalidLink: string
    invalidLinkDetails: string
    areYouSure: string
    willNotReceive: string
    marketingEmails: string
    specialOffers: string
    productUpdates: string
    willContinue: string
    confirmButton: string
    processing: string
    successMessage: string
    changeYourMind: string
    retry: string
    connectionError: string
    connectionErrorDetails: string
    unsubscribeFailed: string
    pleaseTryLater: string
    backToHome: string
    footer: string
  }

  // Push notification opt-in prompt
  notifications: {
    promptTitle: string
    promptBody: string
    enableButton: string
    maybeLater: string
    permissionDenied: string
    permissionDeniedHint: string
  }

  // Onboarding
  onboarding: {
    welcomeTitle: string
    welcomeWithName: string
    welcomeSubtitle: string
    howItWorks: string
    step1Title: string
    step1Desc: string
    step2Title: string
    step2Desc: string
    step3Title: string
    step3Desc: string
    uploadTitle: string
    uploadSubtitle: string
    uploadHint: string
    invalidFile: string
    fileTooLarge: string
    skipForNow: string
    exploreSamples: string
  }

  // Not Found page
  notFound: {
    title: string
    description: string
    goBack: string
    tryThesePages: string
  }

  // Error Boundary
  errorBoundary: {
    title: string
    description: string
    tryAgain: string
    goHome: string
    errorDetails: string
    pageError: string
    pageErrorDesc: string
    reloadPage: string
    backToHome: string
    inlineError: string
    inlineTryAgain: string
  }

  // Policy Documents
  policyDocuments: {
    title: string
    loading: string
    upload: string
    uploading: string
    uploadingProgress: string
    openInNewTab: string
    refreshLink: string
    download: string
    confirmDelete: string
    deleteDoc: string
    noDocuments: string
    clickUpload: string
    documentCount: string
    documentsCount: string
  }

  // AI Insights Panel
  aiInsightsPanel: {
    title: string
    confidence: string
    description: string
    excellentAnalysis: string
    goodAnalysis: string
    fairAnalysis: string
    needsReview: string
    coveragesDetected: string
    detectedSummary: string
    keyFindings: string
    marketComparison: string
    yourPremium: string
    marketAvg: string
    marketRank: string
    lowest: string
    highest: string
    aboveMarket: string
    belowMarket: string
    riskAssessment: string
    veryLowRisk: string
    lowRisk: string
    moderateRisk: string
    highRisk: string
    veryHighRisk: string
    topIssue: string
    recommendedActions: string
    gapAnalysis: string
    critical: string
    high: string
    other: string
    topGap: string
    financialExposure: string
    remediationCost: string
    knowledgeReferences: string
    seddkTsb: string
    marketData: string
    generalConditions: string
    haveQuestions: string
    chatWithAI: string
  }

  // Conflict Resolution Dialog
  conflictResolution: {
    duplicateFound: string
    extractionVariance: string
    verifiedAmendment: string
    possibleAmendment: string
    duplicateDesc: string
    extractionVarianceDesc: string
    verifiedAmendmentDesc: string
    possibleAmendmentDesc: string
    existingPolicy: string
    differencesDetected: string
    extractionVarianceInfo: string
    verifiedAmendmentInfo: string
    criticalDifferencesInfo: string
    showAllDifferences: string
    hideDetails: string
    duplicateIdentical: string
    skip: string
    skipDesc: string
    updateExisting: string
    updateDesc: string
    keepBoth: string
    keepBothDesc: string
    skipRecommended: string
    skipRecommendedDesc: string
    edit: string
    editDesc: string
    updateAnyway: string
    updateAnywayDesc: string
    saveSeparately: string
    saveSeparatelyDesc: string
    trackAmendment: string
    trackAmendmentDesc: string
    skipAmendment: string
    skipAmendmentDesc: string
    // Banner
    duplicate: string
    alreadyExists: string
    extractionVarianceShort: string
    sameDocDifferent: string
    officialAmendment: string
    changeCount: string
    possibleChange: string
    diffCount: string
    resolve: string
  }

  // Policy Diff Viewer
  policyDiff: {
    noChanges: string
    empty: string
    items: string
    critical: string
    major: string
    moderate: string
    minor: string
    previousValue: string
    newValue: string
    removed: string
    added: string
    more: string
    criticalCount: string
    majorCount: string
    otherCount: string
  }

  // Email Preferences
  emailPreferences: {
    title: string
    description: string
    successMessage: string
    errorMessage: string
    notConfigured: string
    transactionalNote: string
  }

  // Coverage name translations (keyed by English name, value is locale-specific)
  coverageNames: Record<string, string>

  // AI insight translations (keyed by English insight text, value is locale-specific)
  insightTranslations: Record<string, string>
}

// Translation data lives in split files for lazy loading:
//   EN_TRANSLATIONS → './translations-en'  (async chunk, lazy-loaded)
//   TR_TRANSLATIONS → './translations-tr'  (async chunk, lazy-loaded)
//
// Import directly from those files when needed. Do NOT import from this file
// expecting translation objects — only types and COMMON_LOCALES are exported here.
//
// For the initial app state, import SKELETON_TRANSLATIONS from './translations-skeleton'.
