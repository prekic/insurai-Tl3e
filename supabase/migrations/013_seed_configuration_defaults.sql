-- ============================================================================
-- Seed Configuration Defaults
-- Migration: 013_seed_configuration_defaults.sql
-- Description: Seeds all current hardcoded values into app_settings
-- Date: 2026-02-05
--
-- This migration populates the configuration system with all existing
-- hardcoded values from the codebase to ensure backward compatibility.
-- Values can then be modified via the Admin Dashboard.
-- ============================================================================

-- ===========================================
-- AI CONFIGURATION
-- Source: src/lib/ai/config.ts
-- ===========================================

INSERT INTO public.app_settings (category, key, value, value_type, description, description_tr, display_order, allowed_values) VALUES
-- OpenAI Settings
('ai', 'openai_extraction_model', '"gpt-4o"', 'string', 'OpenAI model for policy extraction', 'Poliçe çıkarma için OpenAI modeli', 1, '["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"]'),
('ai', 'openai_backup_model', '"gpt-4o-mini"', 'string', 'Backup OpenAI model', 'Yedek OpenAI modeli', 2, '["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"]'),

-- Anthropic Settings
('ai', 'anthropic_extraction_model', '"claude-sonnet-4-20250514"', 'string', 'Anthropic model for policy extraction', 'Poliçe çıkarma için Anthropic modeli', 3, '["claude-sonnet-4-20250514", "claude-3-5-haiku-20241022", "claude-3-opus-20240229"]'),
('ai', 'anthropic_backup_model', '"claude-3-5-haiku-20241022"', 'string', 'Backup Anthropic model', 'Yedek Anthropic modeli', 4, '["claude-sonnet-4-20250514", "claude-3-5-haiku-20241022"]'),

-- General AI Settings
('ai', 'max_tokens', '4096', 'number', 'Maximum tokens for AI response', 'AI yanıtı için maksimum token', 5, NULL),
('ai', 'temperature', '0.1', 'number', 'AI temperature for extraction (lower = more deterministic)', 'Çıkarma için AI sıcaklığı (düşük = daha belirleyici)', 6, NULL),
('ai', 'chat_temperature', '0.7', 'number', 'AI temperature for chat (higher = more creative)', 'Sohbet için AI sıcaklığı (yüksek = daha yaratıcı)', 7, NULL),
('ai', 'min_confidence', '0.4', 'number', 'Hard reject threshold — below this, extraction is too unreliable', 'Kesin red eşiği — altında çıkarma güvenilmez', 8, NULL),
('ai', 'warning_confidence', '0.7', 'number', 'Warning threshold — below this, results shown with low-confidence warning', 'Uyarı eşiği — altında sonuçlar düşük güven uyarısıyla gösterilir', 9, NULL),
('ai', 'extraction_timeout_ms', '90000', 'number', 'Extraction timeout in milliseconds', 'Milisaniye cinsinden çıkarma zaman aşımı', 10, NULL),

-- Provider Settings
('ai', 'preferred_provider', '"auto"', 'string', 'Preferred AI provider (auto = cost-optimized)', 'Tercih edilen AI sağlayıcı (auto = maliyet optimizasyonlu)', 11, '["auto", "openai", "anthropic"]'),
('ai', 'enable_fallback', 'true', 'boolean', 'Enable automatic fallback to secondary provider', 'İkincil sağlayıcıya otomatik geri dönüşü etkinleştir', 12, NULL),

-- Consensus Settings
('ai', 'consensus_enabled', 'true', 'boolean', 'Enable multi-model consensus for high-confidence extraction', 'Yüksek güvenilirlik çıkarma için çoklu model konsensüsünü etkinleştir', 13, NULL),
('ai', 'consensus_agreement_threshold', '0.8', 'number', 'Minimum agreement threshold for consensus', 'Konsensüs için minimum anlaşma eşiği', 14, NULL),
('ai', 'consensus_fields', '["policyNumber", "provider", "premium", "startDate", "endDate"]', 'array', 'Fields to check for consensus', 'Konsensüs için kontrol edilecek alanlar', 15, NULL)

ON CONFLICT (category, key) DO NOTHING;

-- ===========================================
-- POLICY EVALUATION CONFIGURATION
-- Source: src/lib/policy-evaluation/types.ts
-- ===========================================

INSERT INTO public.app_settings (category, key, value, value_type, description, description_tr, display_order, min_value, max_value) VALUES
-- Scoring Weights (must sum to 100)
('evaluation', 'weight_premium', '20', 'number', 'Weight for premium score (0-100)', 'Prim puanı ağırlığı (0-100)', 1, 0, 100),
('evaluation', 'weight_coverage', '30', 'number', 'Weight for coverage score (0-100)', 'Teminat puanı ağırlığı (0-100)', 2, 0, 100),
('evaluation', 'weight_deductible', '15', 'number', 'Weight for deductible score (0-100)', 'Muafiyet puanı ağırlığı (0-100)', 3, 0, 100),
('evaluation', 'weight_compliance', '20', 'number', 'Weight for compliance score (0-100)', 'Uyumluluk puanı ağırlığı (0-100)', 4, 0, 100),
('evaluation', 'weight_value', '15', 'number', 'Weight for value score (0-100)', 'Değer puanı ağırlığı (0-100)', 5, 0, 100),

-- Grade Thresholds
('evaluation', 'grade_a_threshold', '90', 'number', 'Minimum score for Grade A', 'A notu için minimum puan', 10, 0, 100),
('evaluation', 'grade_b_threshold', '80', 'number', 'Minimum score for Grade B', 'B notu için minimum puan', 11, 0, 100),
('evaluation', 'grade_c_threshold', '70', 'number', 'Minimum score for Grade C', 'C notu için minimum puan', 12, 0, 100),
('evaluation', 'grade_d_threshold', '60', 'number', 'Minimum score for Grade D', 'D notu için minimum puan', 13, 0, 100),

-- Status Thresholds
('evaluation', 'status_excellent_threshold', '90', 'number', 'Minimum score for Excellent status', 'Mükemmel durumu için minimum puan', 20, 0, 100),
('evaluation', 'status_good_threshold', '75', 'number', 'Minimum score for Good status', 'İyi durumu için minimum puan', 21, 0, 100),
('evaluation', 'status_fair_threshold', '60', 'number', 'Minimum score for Fair status', 'Orta durumu için minimum puan', 22, 0, 100),
('evaluation', 'status_poor_threshold', '40', 'number', 'Minimum score for Poor status', 'Kötü durumu için minimum puan', 23, 0, 100),

-- Evaluation Options
('evaluation', 'strict_compliance', 'true', 'boolean', 'Enable strict compliance checking', 'Sıkı uyumluluk kontrolünü etkinleştir', 30, NULL, NULL),
('evaluation', 'include_optional_coverages', 'true', 'boolean', 'Include optional coverages in evaluation', 'Değerlendirmede isteğe bağlı teminatları dahil et', 31, NULL, NULL),
('evaluation', 'use_regional_benchmarks', 'true', 'boolean', 'Use regional benchmarks for comparison', 'Karşılaştırma için bölgesel kıyaslamaları kullan', 32, NULL, NULL)

ON CONFLICT (category, key) DO NOTHING;

-- ===========================================
-- RATE LIMITING CONFIGURATION
-- Source: server/middleware/rate-limit.ts
-- ===========================================

INSERT INTO public.app_settings (category, key, value, value_type, description, description_tr, display_order, min_value, max_value) VALUES
-- General API Limits
('rate_limits', 'general_window_ms', '900000', 'number', 'General rate limit window (ms) - 15 minutes', 'Genel hız sınırı penceresi (ms) - 15 dakika', 1, 60000, 3600000),
('rate_limits', 'general_max_requests', '100', 'number', 'Max requests per window (general)', 'Pencere başına maksimum istek (genel)', 2, 10, 1000),

-- AI Extraction Limits
('rate_limits', 'ai_extraction_window_ms', '3600000', 'number', 'AI extraction rate limit window (ms) - 1 hour', 'AI çıkarma hız sınırı penceresi (ms) - 1 saat', 10, 60000, 86400000),
('rate_limits', 'ai_extraction_max_requests', '20', 'number', 'Max AI extraction requests per hour', 'Saat başına maksimum AI çıkarma isteği', 11, 5, 100),

-- OCR Limits
('rate_limits', 'ocr_window_ms', '3600000', 'number', 'OCR rate limit window (ms) - 1 hour', 'OCR hız sınırı penceresi (ms) - 1 saat', 20, 60000, 86400000),
('rate_limits', 'ocr_max_requests', '30', 'number', 'Max OCR requests per hour', 'Saat başına maksimum OCR isteği', 21, 5, 100),

-- Chat Limits
('rate_limits', 'chat_window_ms', '3600000', 'number', 'Chat rate limit window (ms) - 1 hour', 'Sohbet hız sınırı penceresi (ms) - 1 saat', 30, 60000, 86400000),
('rate_limits', 'chat_max_requests', '60', 'number', 'Max chat messages per hour', 'Saat başına maksimum sohbet mesajı', 31, 10, 200),

-- Health Check Limits
('rate_limits', 'health_window_ms', '60000', 'number', 'Health check rate limit window (ms) - 1 minute', 'Sağlık kontrolü hız sınırı penceresi (ms) - 1 dakika', 40, 10000, 300000),
('rate_limits', 'health_max_requests', '60', 'number', 'Max health check requests per minute', 'Dakika başına maksimum sağlık kontrolü isteği', 41, 10, 120),

-- Auth Limits
('rate_limits', 'auth_window_ms', '900000', 'number', 'Auth rate limit window (ms) - 15 minutes', 'Kimlik doğrulama hız sınırı penceresi (ms) - 15 dakika', 50, 60000, 3600000),
('rate_limits', 'auth_max_attempts', '10', 'number', 'Max login attempts per 15 minutes', '15 dakika başına maksimum giriş denemesi', 51, 3, 20)

ON CONFLICT (category, key) DO NOTHING;

-- ===========================================
-- OCR CONFIGURATION
-- Source: config/ocr_settings.json
-- ===========================================

INSERT INTO public.app_settings (category, key, value, value_type, description, description_tr, display_order, min_value, max_value) VALUES
-- Density Analysis
('ocr', 'chars_per_page_threshold', '200', 'number', 'Minimum chars per page to skip OCR', 'OCR atlamak için sayfa başına minimum karakter', 1, 50, 500),
('ocr', 'min_pages_for_average', '3', 'number', 'Minimum pages for average calculation', 'Ortalama hesaplaması için minimum sayfa', 2, 1, 10),
('ocr', 'page_variance_threshold', '0.5', 'number', 'Maximum allowed page variance', 'İzin verilen maksimum sayfa varyansı', 3, 0.1, 1.0),
('ocr', 'min_chars_for_valid_page', '50', 'number', 'Minimum chars for a valid page', 'Geçerli bir sayfa için minimum karakter', 4, 10, 200),

-- Confidence Thresholds
('ocr', 'skip_ocr_threshold', '0.85', 'number', 'Confidence threshold to skip OCR', 'OCR atlamak için güven eşiği', 10, 0.5, 1.0),
('ocr', 'selective_ocr_threshold', '0.60', 'number', 'Confidence threshold for selective OCR', 'Seçici OCR için güven eşiği', 11, 0.3, 0.9),

-- Confidence Weights
('ocr', 'weight_char_density', '0.25', 'number', 'Weight for character density score', 'Karakter yoğunluğu puanı ağırlığı', 20, 0, 1),
('ocr', 'weight_text_quality', '0.30', 'number', 'Weight for text quality score', 'Metin kalitesi puanı ağırlığı', 21, 0, 1),
('ocr', 'weight_page_variance', '0.15', 'number', 'Weight for page variance score', 'Sayfa varyansı puanı ağırlığı', 22, 0, 1),
('ocr', 'weight_encoding_check', '0.15', 'number', 'Weight for encoding check score', 'Kodlama kontrolü puanı ağırlığı', 23, 0, 1),
('ocr', 'weight_field_extraction', '0.15', 'number', 'Weight for field extraction score', 'Alan çıkarma puanı ağırlığı', 24, 0, 1),

-- Provider Thresholds
('ocr', 'google_vision_confidence', '0.80', 'number', 'Google Vision confidence threshold', 'Google Vision güven eşiği', 30, 0.5, 1.0),
('ocr', 'document_ai_confidence', '0.85', 'number', 'Document AI confidence threshold', 'Document AI güven eşiği', 31, 0.5, 1.0),
('ocr', 'tesseract_confidence', '0.70', 'number', 'Tesseract confidence threshold', 'Tesseract güven eşiği', 32, 0.5, 1.0),

-- Language Detection
('ocr', 'language_min_confidence', '0.40', 'number', 'Minimum language detection confidence', 'Minimum dil algılama güveni', 40, 0.1, 0.9),
('ocr', 'language_sample_size', '2000', 'number', 'Characters to sample for language detection', 'Dil algılama için örneklenecek karakter', 41, 500, 5000),

-- Policy Type Detection
('ocr', 'policy_type_min_confidence', '0.50', 'number', 'Minimum policy type detection confidence', 'Minimum poliçe tipi algılama güveni', 50, 0.3, 0.9),

-- Quality Checks
('ocr', 'min_word_length_average', '2', 'number', 'Minimum average word length', 'Minimum ortalama kelime uzunluğu', 60, 1, 5),
('ocr', 'max_garbage_char_ratio', '0.10', 'number', 'Maximum garbage character ratio', 'Maksimum çöp karakter oranı', 61, 0.01, 0.3),
('ocr', 'min_alphanumeric_ratio', '0.60', 'number', 'Minimum alphanumeric ratio', 'Minimum alfanümerik oranı', 62, 0.3, 0.9),

-- Performance
('ocr', 'max_pages_quick_analysis', '5', 'number', 'Max pages for quick analysis', 'Hızlı analiz için maksimum sayfa', 70, 1, 20),
('ocr', 'timeout_seconds', '30', 'number', 'OCR timeout in seconds', 'Saniye cinsinden OCR zaman aşımı', 71, 10, 120),
('ocr', 'max_text_length', '500000', 'number', 'Maximum text length for analysis', 'Analiz için maksimum metin uzunluğu', 72, 100000, 2000000)

ON CONFLICT (category, key) DO NOTHING;

-- ===========================================
-- FUZZY MATCHING CONFIGURATION
-- Source: src/lib/policy-utils.ts
-- ===========================================

INSERT INTO public.app_settings (category, key, value, value_type, description, description_tr, display_order, min_value, max_value) VALUES
-- General Thresholds
('fuzzy_matching', 'default_threshold', '0.85', 'number', 'Default fuzzy match threshold', 'Varsayılan bulanık eşleşme eşiği', 1, 0.5, 1.0),
('fuzzy_matching', 'short_string_threshold', '0.90', 'number', 'Threshold for strings < 5 chars', '5 karakterden kısa dizeler için eşik', 2, 0.7, 1.0),

-- Specific Field Thresholds
('fuzzy_matching', 'policy_number_threshold', '0.85', 'number', 'Policy number matching threshold', 'Poliçe numarası eşleştirme eşiği', 10, 0.7, 1.0),
('fuzzy_matching', 'provider_name_threshold', '0.80', 'number', 'Provider name matching threshold', 'Sağlayıcı adı eşleştirme eşiği', 11, 0.6, 1.0),
('fuzzy_matching', 'insured_name_threshold', '0.80', 'number', 'Insured name matching threshold', 'Sigortalı adı eşleştirme eşiği', 12, 0.6, 1.0),
('fuzzy_matching', 'coverage_name_threshold', '0.85', 'number', 'Coverage name matching threshold', 'Teminat adı eşleştirme eşiği', 13, 0.7, 1.0),

-- Array Comparison Thresholds
('fuzzy_matching', 'array_match_ratio', '0.70', 'number', 'Minimum ratio for array equality', 'Dizi eşitliği için minimum oran', 20, 0.5, 1.0),
('fuzzy_matching', 'keyword_overlap_ratio', '0.80', 'number', 'Minimum keyword overlap ratio', 'Minimum anahtar kelime örtüşme oranı', 21, 0.5, 1.0),

-- Numeric Tolerance
('fuzzy_matching', 'numeric_tolerance_percent', '0.02', 'number', 'Numeric comparison tolerance (2%)', 'Sayısal karşılaştırma toleransı (%2)', 30, 0.01, 0.1),
('fuzzy_matching', 'seddk_limit_tolerance', '0.05', 'number', 'SEDDK limit comparison tolerance (5%)', 'SEDDK limit karşılaştırma toleransı (%5)', 31, 0.02, 0.15),
('fuzzy_matching', 'coverage_limit_tolerance', '0.10', 'number', 'Coverage limit comparison tolerance (10%)', 'Teminat limit karşılaştırma toleransı (%10)', 32, 0.05, 0.2),
('fuzzy_matching', 'deductible_tolerance', '0.20', 'number', 'Deductible comparison tolerance (20%)', 'Muafiyet karşılaştırma toleransı (%20)', 33, 0.1, 0.3)

ON CONFLICT (category, key) DO NOTHING;

-- ===========================================
-- GAP ANALYSIS CONFIGURATION
-- Source: src/lib/market-data/gap-analyzer.ts
-- ===========================================

INSERT INTO public.app_settings (category, key, value, value_type, description, description_tr, display_order, min_value, max_value) VALUES
-- Missing Coverage Thresholds
('gap_analysis', 'missing_coverage_threshold', '50', 'number', 'Inclusion rate threshold for missing coverage (%)', 'Eksik teminat için dahil etme oranı eşiği (%)', 1, 30, 80),
('gap_analysis', 'critical_importance_threshold', '90', 'number', 'Inclusion rate for critical importance (%)', 'Kritik önem için dahil etme oranı (%)', 2, 80, 100),
('gap_analysis', 'recommended_importance_threshold', '70', 'number', 'Inclusion rate for recommended importance (%)', 'Önerilen önem için dahil etme oranı (%)', 3, 50, 90),

-- Underinsured Thresholds
('gap_analysis', 'underinsured_threshold', '70', 'number', 'Percentage of market average to flag underinsured (%)', 'Yetersiz sigortalı için piyasa ortalaması yüzdesi (%)', 10, 50, 90),
('gap_analysis', 'high_risk_underinsured', '40', 'number', 'Percentage for high-risk underinsured (%)', 'Yüksek riskli yetersiz sigortalı için yüzde (%)', 11, 20, 60),
('gap_analysis', 'medium_risk_underinsured', '55', 'number', 'Percentage for medium-risk underinsured (%)', 'Orta riskli yetersiz sigortalı için yüzde (%)', 12, 40, 70),

-- Deductible Thresholds
('gap_analysis', 'high_deductible_multiplier', '1.5', 'number', 'Multiplier of market average for high deductible', 'Yüksek muafiyet için piyasa ortalaması çarpanı', 20, 1.2, 2.5),

-- Gap Score Penalties
('gap_analysis', 'penalty_critical_missing', '15', 'number', 'Gap score penalty for critical missing coverage', 'Kritik eksik teminat için boşluk puanı cezası', 30, 10, 25),
('gap_analysis', 'penalty_recommended_missing', '8', 'number', 'Gap score penalty for recommended missing', 'Önerilen eksik için boşluk puanı cezası', 31, 5, 15),
('gap_analysis', 'penalty_optional_missing', '3', 'number', 'Gap score penalty for optional missing', 'İsteğe bağlı eksik için boşluk puanı cezası', 32, 1, 8),
('gap_analysis', 'penalty_high_risk_underinsured', '12', 'number', 'Penalty for high-risk underinsured', 'Yüksek riskli yetersiz sigortalı cezası', 33, 8, 20),
('gap_analysis', 'penalty_medium_risk_underinsured', '6', 'number', 'Penalty for medium-risk underinsured', 'Orta riskli yetersiz sigortalı cezası', 34, 3, 12),

-- Score Interpretation
('gap_analysis', 'good_alignment_threshold', '20', 'number', 'Gap score threshold for good alignment', 'İyi uyum için boşluk puanı eşiği', 40, 10, 30),
('gap_analysis', 'significant_gaps_threshold', '50', 'number', 'Gap score threshold for significant gaps', 'Önemli boşluklar için boşluk puanı eşiği', 41, 40, 70),
('gap_analysis', 'max_gap_score', '100', 'number', 'Maximum gap score', 'Maksimum boşluk puanı', 42, 100, 100)

ON CONFLICT (category, key) DO NOTHING;

-- ===========================================
-- UI/UX CONFIGURATION
-- ===========================================

INSERT INTO public.app_settings (category, key, value, value_type, description, description_tr, display_order) VALUES
-- Toast/Notification Settings
('ui', 'toast_success_duration_ms', '3000', 'number', 'Success toast duration (ms)', 'Başarı bildirimi süresi (ms)', 1),
('ui', 'toast_error_duration_ms', '5000', 'number', 'Error toast duration (ms)', 'Hata bildirimi süresi (ms)', 2),
('ui', 'toast_warning_duration_ms', '4000', 'number', 'Warning toast duration (ms)', 'Uyarı bildirimi süresi (ms)', 3),

-- Dashboard Settings
('ui', 'default_items_per_page', '10', 'number', 'Default items per page on dashboard', 'Panoda sayfa başına varsayılan öğe', 10),
('ui', 'max_items_per_page', '50', 'number', 'Maximum items per page', 'Sayfa başına maksimum öğe', 11),

-- Progress Updates
('ui', 'extraction_progress_interval_ms', '10000', 'number', 'Progress update interval during extraction (ms)', 'Çıkarma sırasında ilerleme güncelleme aralığı (ms)', 20),

-- Preview Settings
('ui', 'collapsed_preview_items', '2', 'number', 'Number of items to show in collapsed lists', 'Daraltılmış listelerde gösterilecek öğe sayısı', 30),
('ui', 'max_ai_insights_preview', '3', 'number', 'Max AI insights to show before expand', 'Genişletmeden önce gösterilecek maksimum AI içgörüsü', 31),
('ui', 'max_recommendations_preview', '2', 'number', 'Max recommendations to show before expand', 'Genişletmeden önce gösterilecek maksimum öneri', 32),

-- File Upload
('ui', 'max_file_size_mb', '10', 'number', 'Maximum upload file size (MB)', 'Maksimum yükleme dosya boyutu (MB)', 40),
('ui', 'allowed_file_extensions', '[".pdf", ".doc", ".docx", ".png", ".jpg", ".jpeg"]', 'array', 'Allowed file extensions', 'İzin verilen dosya uzantıları', 41)

ON CONFLICT (category, key) DO NOTHING;

-- ===========================================
-- EMAIL NOTIFICATION CONFIGURATION
-- ===========================================

INSERT INTO public.app_settings (category, key, value, value_type, description, description_tr, display_order) VALUES
-- Reminder Settings
('email', 'reminder_days', '[30, 14, 7, 3, 1]', 'array', 'Days before expiry to send reminders', 'Hatırlatıcı göndermek için sona ermeden önceki günler', 1),
('email', 'urgency_threshold_days', '7', 'number', 'Days threshold for urgent status', 'Acil durum için gün eşiği', 2),

-- Score Thresholds for Formatting
('email', 'score_good_threshold', '70', 'number', 'Score threshold for good (green) status', 'İyi (yeşil) durum için puan eşiği', 10),
('email', 'score_warning_threshold', '50', 'number', 'Score threshold for warning (yellow) status', 'Uyarı (sarı) durum için puan eşiği', 11),

-- Default Preferences
('email', 'default_marketing_enabled', 'true', 'boolean', 'Default marketing email preference', 'Varsayılan pazarlama e-postası tercihi', 20),
('email', 'default_reminders_enabled', 'true', 'boolean', 'Default reminder email preference', 'Varsayılan hatırlatıcı e-postası tercihi', 21),
('email', 'default_digest_enabled', 'false', 'boolean', 'Default digest email preference', 'Varsayılan özet e-postası tercihi', 22)

ON CONFLICT (category, key) DO NOTHING;

-- ===========================================
-- FEATURE FLAGS (Initial Set)
-- ===========================================

INSERT INTO public.feature_flags (key, name, description, enabled, rollout_percentage) VALUES
('use_db_config', 'Database Configuration', 'Use database for configuration instead of hardcoded values', true, 100),
('new_evaluation_algorithm', 'New Evaluation Algorithm', 'Enable improved policy evaluation algorithm', false, 0),
('ai_consensus_mode', 'AI Consensus Mode', 'Use multiple AI models for consensus extraction', false, 0),
('advanced_gap_analysis', 'Advanced Gap Analysis', 'Enable advanced gap analysis features', false, 0),
('user_preferences', 'User Preferences', 'Enable per-user preference customization', false, 0)
ON CONFLICT (key) DO NOTHING;

-- ===========================================
-- REGIONAL FACTORS (Turkish Regions)
-- Source: src/data/market-data/benchmarks.ts
-- ===========================================

INSERT INTO public.regional_factors (region_code, region_name, region_name_tr, policy_type, risk_factor, year, source) VALUES
('marmara', 'Marmara', 'Marmara', 'all', 1.15, 2026, 'SEDDK/TSB Statistics'),
('ege', 'Aegean', 'Ege', 'all', 1.05, 2026, 'SEDDK/TSB Statistics'),
('akdeniz', 'Mediterranean', 'Akdeniz', 'all', 1.08, 2026, 'SEDDK/TSB Statistics'),
('ic_anadolu', 'Central Anatolia', 'İç Anadolu', 'all', 0.95, 2026, 'SEDDK/TSB Statistics'),
('karadeniz', 'Black Sea', 'Karadeniz', 'all', 0.90, 2026, 'SEDDK/TSB Statistics'),
('dogu_anadolu', 'Eastern Anatolia', 'Doğu Anadolu', 'all', 0.85, 2026, 'SEDDK/TSB Statistics'),
('guneydogu', 'Southeastern Anatolia', 'Güneydoğu Anadolu', 'all', 0.88, 2026, 'SEDDK/TSB Statistics')
ON CONFLICT (region_code, policy_type, year) DO NOTHING;

-- ===========================================
-- INSURANCE PROVIDERS (Major Turkish Insurers)
-- Source: src/data/market-data/providers.ts
-- ===========================================

INSERT INTO public.insurance_providers (code, name, name_tr, market_share, customer_rating, established_year, headquarters) VALUES
('allianz', 'Allianz Sigorta', 'Allianz Sigorta', 12.8, 4.2, 1923, 'Istanbul'),
('axa', 'AXA Sigorta', 'AXA Sigorta', 10.5, 4.0, 1893, 'Istanbul'),
('anadolu', 'Anadolu Sigorta', 'Anadolu Sigorta', 9.2, 4.3, 1925, 'Istanbul'),
('aksigorta', 'Aksigorta', 'Aksigorta', 8.7, 4.1, 1960, 'Istanbul'),
('mapfre', 'MAPFRE Sigorta', 'MAPFRE Sigorta', 7.4, 3.9, 1992, 'Istanbul'),
('sompo', 'Sompo Japan Sigorta', 'Sompo Japan Sigorta', 6.8, 4.0, 1993, 'Istanbul'),
('zurich', 'Zurich Sigorta', 'Zurich Sigorta', 5.2, 4.1, 1986, 'Istanbul'),
('hdi', 'HDI Sigorta', 'HDI Sigorta', 4.8, 3.8, 2002, 'Istanbul'),
('groupama', 'Groupama Sigorta', 'Groupama Sigorta', 4.5, 3.9, 1986, 'Istanbul'),
('turk_nippon', 'Türk Nippon Sigorta', 'Türk Nippon Sigorta', 3.2, 3.7, 1994, 'Istanbul'),
('quick', 'Quick Sigorta', 'Quick Sigorta', 2.8, 3.5, 2007, 'Istanbul'),
('neova', 'Neova Sigorta', 'Neova Sigorta', 2.5, 3.6, 2008, 'Istanbul'),
('ray', 'Ray Sigorta', 'Ray Sigorta', 2.3, 3.8, 1958, 'Istanbul'),
('generali', 'Generali Sigorta', 'Generali Sigorta', 2.1, 3.9, 1989, 'Istanbul'),
('eureko', 'Eureko Sigorta', 'Eureko Sigorta', 1.9, 3.7, 2007, 'Istanbul')
ON CONFLICT (code) DO NOTHING;

-- ===========================================
-- KASKO COVERAGE BENCHMARKS (Sample)
-- Source: src/data/market-data/benchmarks.ts
-- ===========================================

INSERT INTO public.market_benchmarks (policy_type, coverage_type, coverage_name_tr, year, min_limit, typical_limit, max_limit, min_deductible, typical_deductible, max_deductible, inclusion_rate, importance, source) VALUES
('kasko', 'collision', 'Çarpma/Çarpışma', 2026, 100000, 500000, 2000000, 0, 2500, 10000, 100, 'critical', 'TSB Market Analysis'),
('kasko', 'theft', 'Hırsızlık', 2026, 100000, 500000, 2000000, 0, 2500, 10000, 100, 'critical', 'TSB Market Analysis'),
('kasko', 'natural_disasters', 'Doğal Afetler', 2026, 100000, 500000, 2000000, 0, 2500, 10000, 95, 'critical', 'TSB Market Analysis'),
('kasko', 'fire', 'Yangın', 2026, 100000, 500000, 2000000, 0, 2500, 10000, 100, 'critical', 'TSB Market Analysis'),
('kasko', 'glass', 'Cam Kırılması', 2026, 5000, 25000, 50000, 0, 0, 1000, 85, 'standard', 'TSB Market Analysis'),
('kasko', 'personal_accident', 'Ferdi Kaza', 2026, 50000, 100000, 500000, 0, 0, 0, 70, 'standard', 'TSB Market Analysis'),
('kasko', 'replacement_vehicle', 'İkame Araç', 2026, 0, 0, 0, 0, 0, 0, 60, 'optional', 'TSB Market Analysis'),
('kasko', 'roadside_assistance', 'Yol Yardım', 2026, 0, 0, 0, 0, 0, 0, 80, 'standard', 'TSB Market Analysis')
ON CONFLICT (policy_type, coverage_type, region_code, year, version) DO NOTHING;

-- ===========================================
-- TRAFFIC INSURANCE BENCHMARKS (ZMSS - Official SEDDK Limits)
-- ===========================================

INSERT INTO public.market_benchmarks (policy_type, coverage_type, coverage_name_tr, year, min_limit, typical_limit, max_limit, inclusion_rate, importance, source) VALUES
('traffic', 'material_damage_per_vehicle', 'Maddi Hasar (Araç Başı)', 2026, 300000, 300000, 300000, 100, 'critical', 'SEDDK Official 2025-2026'),
('traffic', 'material_damage_per_accident', 'Maddi Hasar (Kaza Başı)', 2026, 600000, 600000, 600000, 100, 'critical', 'SEDDK Official 2025-2026'),
('traffic', 'death_disability_per_person', 'Ölüm/Sakatlık (Kişi Başı)', 2026, 2700000, 2700000, 2700000, 100, 'critical', 'SEDDK Official 2025-2026'),
('traffic', 'death_disability_per_accident', 'Ölüm/Sakatlık (Kaza Başı)', 2026, 13500000, 13500000, 13500000, 100, 'critical', 'SEDDK Official 2025-2026'),
('traffic', 'medical_per_person', 'Sağlık Giderleri (Kişi Başı)', 2026, 2700000, 2700000, 2700000, 100, 'critical', 'SEDDK Official 2025-2026'),
('traffic', 'medical_per_accident', 'Sağlık Giderleri (Kaza Başı)', 2026, 13500000, 13500000, 13500000, 100, 'critical', 'SEDDK Official 2025-2026')
ON CONFLICT (policy_type, coverage_type, region_code, year, version) DO NOTHING;

-- ===========================================
-- SUCCESS MESSAGE
-- ===========================================
DO $$
BEGIN
  RAISE NOTICE 'Configuration system seeded successfully with % app_settings, % regional_factors, % insurance_providers, % market_benchmarks, % feature_flags',
    (SELECT COUNT(*) FROM public.app_settings),
    (SELECT COUNT(*) FROM public.regional_factors),
    (SELECT COUNT(*) FROM public.insurance_providers),
    (SELECT COUNT(*) FROM public.market_benchmarks),
    (SELECT COUNT(*) FROM public.feature_flags);
END $$;
