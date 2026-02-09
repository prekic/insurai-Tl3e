-- ============================================================================
-- Confidence Scoring Weights
-- Migration: 016_confidence_weights.sql
-- Description: Adds configurable confidence scoring weights to AI settings
-- Date: 2026-02-09
-- ============================================================================

INSERT INTO public.app_settings (category, key, value, value_type, description, description_tr, display_order, min_value, max_value) VALUES
('ai', 'confidence_weight_policy_number', '0.20', 'number', 'Weight for policy number confidence in overall score (all weights must sum to 1.0)', 'Genel puandaki poliçe numarası güven ağırlığı (tüm ağırlıklar toplamı 1.0 olmalı)', 20, 0, 1),
('ai', 'confidence_weight_provider', '0.15', 'number', 'Weight for provider confidence in overall score', 'Genel puandaki sigorta şirketi güven ağırlığı', 21, 0, 1),
('ai', 'confidence_weight_dates', '0.20', 'number', 'Weight for dates confidence in overall score', 'Genel puandaki tarih güven ağırlığı', 22, 0, 1),
('ai', 'confidence_weight_premium', '0.20', 'number', 'Weight for premium confidence in overall score', 'Genel puandaki prim güven ağırlığı', 23, 0, 1),
('ai', 'confidence_weight_coverages', '0.25', 'number', 'Weight for coverages confidence in overall score', 'Genel puandaki teminat güven ağırlığı', 24, 0, 1)

ON CONFLICT (category, key) DO NOTHING;
