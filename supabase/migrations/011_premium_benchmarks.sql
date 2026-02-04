-- Migration 011: Premium Benchmarks
-- Purpose: Admin-editable premium benchmarks for policy evaluation
-- Replaces hardcoded PREMIUM_BENCHMARKS in coverage-limits.ts

-- Create enum for comparison method
DO $$ BEGIN
  CREATE TYPE premium_comparison_method AS ENUM ('direct_premium', 'value_based');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create the premium_benchmarks table
CREATE TABLE IF NOT EXISTS public.premium_benchmarks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Insurance type identification
  insurance_type TEXT NOT NULL,
  insurance_type_tr TEXT NOT NULL,

  -- Sub-classification (vehicle class, property type, etc.)
  sub_type TEXT,
  sub_type_tr TEXT,

  -- Premium range values (in TRY)
  min_premium NUMERIC NOT NULL DEFAULT 0,
  avg_premium NUMERIC NOT NULL DEFAULT 0,
  max_premium NUMERIC NOT NULL DEFAULT 0,

  -- Comparison method:
  -- 'direct_premium' = compare actual premium against min/avg/max
  -- 'value_based' = premium is calculated as percentage of insured value
  comparison_method premium_comparison_method NOT NULL DEFAULT 'direct_premium',

  -- For value_based comparison: premium as percentage of insured value
  -- e.g., 0.02 means 2% of vehicle value
  value_min_rate NUMERIC,  -- Minimum expected rate (e.g., 0.01 = 1%)
  value_avg_rate NUMERIC,  -- Average market rate
  value_max_rate NUMERIC,  -- Maximum typical rate

  -- Metadata
  currency TEXT NOT NULL DEFAULT 'TRY',
  year INTEGER NOT NULL DEFAULT 2025,
  source TEXT,
  source_tr TEXT,
  notes TEXT,
  notes_tr TEXT,

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Audit fields
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_premium_benchmarks_insurance_type
  ON public.premium_benchmarks(insurance_type);
CREATE INDEX IF NOT EXISTS idx_premium_benchmarks_active
  ON public.premium_benchmarks(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_premium_benchmarks_type_subtype
  ON public.premium_benchmarks(insurance_type, sub_type);

-- Add RLS policies
ALTER TABLE public.premium_benchmarks ENABLE ROW LEVEL SECURITY;

-- Anyone can read active benchmarks (needed for policy evaluation)
CREATE POLICY "Anyone can read active benchmarks"
  ON public.premium_benchmarks FOR SELECT
  USING (is_active = true);

-- Only admins can modify (handled via service role key in admin routes)
CREATE POLICY "Service role can manage all benchmarks"
  ON public.premium_benchmarks FOR ALL
  USING (auth.role() = 'service_role');

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_premium_benchmarks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_premium_benchmarks_updated_at ON public.premium_benchmarks;
CREATE TRIGGER trigger_premium_benchmarks_updated_at
  BEFORE UPDATE ON public.premium_benchmarks
  FOR EACH ROW
  EXECUTE FUNCTION update_premium_benchmarks_updated_at();

-- Seed with existing hardcoded values
INSERT INTO public.premium_benchmarks (
  insurance_type, insurance_type_tr, sub_type, sub_type_tr,
  min_premium, avg_premium, max_premium,
  comparison_method, value_min_rate, value_avg_rate, value_max_rate,
  year, source, source_tr
) VALUES
-- Traffic Insurance (ZMSS) - Direct Premium Comparison
('zmss', 'Zorunlu Mali Sorumluluk (Trafik)', 'automobile', 'Otomobil',
  3000, 4500, 8000, 'direct_premium', NULL, NULL, NULL,
  2025, 'TSB Market Data', 'TSB Piyasa Verileri'),

('zmss', 'Zorunlu Mali Sorumluluk (Trafik)', 'motorcycle', 'Motosiklet',
  1500, 2500, 5000, 'direct_premium', NULL, NULL, NULL,
  2025, 'TSB Market Data', 'TSB Piyasa Verileri'),

('zmss', 'Zorunlu Mali Sorumluluk (Trafik)', 'commercial_vehicle', 'Ticari Araç',
  5000, 8000, 15000, 'direct_premium', NULL, NULL, NULL,
  2025, 'TSB Market Data', 'TSB Piyasa Verileri'),

-- Kasko - Value Based Comparison (premium as % of vehicle value)
('kasko', 'Kasko', 'economy', 'Ekonomik Araç',
  4000, 10000, 15000, 'value_based', 0.015, 0.025, 0.04,
  2025, 'TSB Market Data', 'TSB Piyasa Verileri'),

('kasko', 'Kasko', 'mid_range', 'Orta Segment',
  10000, 18000, 25000, 'value_based', 0.012, 0.022, 0.035,
  2025, 'TSB Market Data', 'TSB Piyasa Verileri'),

('kasko', 'Kasko', 'luxury', 'Lüks Araç',
  20000, 35000, 80000, 'value_based', 0.01, 0.018, 0.03,
  2025, 'TSB Market Data', 'TSB Piyasa Verileri'),

('kasko', 'Kasko', 'commercial', 'Ticari Araç',
  8000, 15000, 30000, 'value_based', 0.02, 0.03, 0.05,
  2025, 'TSB Market Data', 'TSB Piyasa Verileri'),

-- DASK - Direct Premium Comparison
('dask', 'DASK (Zorunlu Deprem)', 'apartment_concrete', 'Betonarme Apartman',
  500, 1200, 2000, 'direct_premium', NULL, NULL, NULL,
  2025, 'DASK Official', 'DASK Resmi Tarifesi'),

('dask', 'DASK (Zorunlu Deprem)', 'house_concrete', 'Betonarme Müstakil',
  700, 1500, 2500, 'direct_premium', NULL, NULL, NULL,
  2025, 'DASK Official', 'DASK Resmi Tarifesi'),

('dask', 'DASK (Zorunlu Deprem)', 'other_structure', 'Diğer Yapılar',
  400, 900, 1600, 'direct_premium', NULL, NULL, NULL,
  2025, 'DASK Official', 'DASK Resmi Tarifesi'),

-- Home Insurance - Value Based (premium as % of property value)
('home', 'Konut Sigortası', 'apartment', 'Apartman Dairesi',
  1500, 3500, 8000, 'value_based', 0.001, 0.002, 0.004,
  2025, 'TSB Market Data', 'TSB Piyasa Verileri'),

('home', 'Konut Sigortası', 'villa', 'Villa/Müstakil',
  3000, 7000, 15000, 'value_based', 0.0015, 0.003, 0.006,
  2025, 'TSB Market Data', 'TSB Piyasa Verileri'),

-- Health Insurance - Direct Premium Comparison
('health', 'Sağlık Sigortası', 'individual_basic', 'Bireysel Temel',
  8000, 15000, 25000, 'direct_premium', NULL, NULL, NULL,
  2025, 'TSB Market Data', 'TSB Piyasa Verileri'),

('health', 'Sağlık Sigortası', 'individual_comprehensive', 'Bireysel Kapsamlı',
  20000, 40000, 80000, 'direct_premium', NULL, NULL, NULL,
  2025, 'TSB Market Data', 'TSB Piyasa Verileri'),

('health', 'Sağlık Sigortası', 'supplementary', 'Tamamlayıcı',
  3000, 6000, 12000, 'direct_premium', NULL, NULL, NULL,
  2025, 'TSB Market Data', 'TSB Piyasa Verileri'),

-- Life Insurance - Direct Premium Comparison
('life', 'Hayat Sigortası', 'term_life', 'Vadeli Hayat',
  1000, 3000, 10000, 'direct_premium', NULL, NULL, NULL,
  2025, 'TSB Market Data', 'TSB Piyasa Verileri'),

('life', 'Hayat Sigortası', 'credit_life', 'Kredi Hayat',
  500, 2000, 5000, 'direct_premium', NULL, NULL, NULL,
  2025, 'TSB Market Data', 'TSB Piyasa Verileri'),

-- Business Insurance - Value Based
('business', 'İşyeri Sigortası', 'small_business', 'Küçük İşletme',
  3000, 8000, 20000, 'value_based', 0.002, 0.004, 0.008,
  2025, 'TSB Market Data', 'TSB Piyasa Verileri'),

('business', 'İşyeri Sigortası', 'medium_business', 'Orta İşletme',
  10000, 30000, 100000, 'value_based', 0.0015, 0.003, 0.006,
  2025, 'TSB Market Data', 'TSB Piyasa Verileri'),

-- Nakliyat (Transportation/Cargo)
('nakliyat', 'Nakliyat Sigortası', 'domestic', 'Yurtiçi Nakliyat',
  2000, 5000, 15000, 'value_based', 0.002, 0.005, 0.01,
  2025, 'TSB Market Data', 'TSB Piyasa Verileri'),

('nakliyat', 'Nakliyat Sigortası', 'international', 'Uluslararası Nakliyat',
  5000, 15000, 50000, 'value_based', 0.003, 0.008, 0.015,
  2025, 'TSB Market Data', 'TSB Piyasa Verileri')

ON CONFLICT DO NOTHING;

-- Add comment for documentation
COMMENT ON TABLE public.premium_benchmarks IS 'Admin-editable premium benchmarks for policy evaluation. Supports both direct premium comparison and value-based (% of insured value) comparison methods.';
COMMENT ON COLUMN public.premium_benchmarks.comparison_method IS 'direct_premium: compare actual premium against min/avg/max values. value_based: premium evaluated as percentage of insured value (e.g., kasko premium as % of vehicle value).';
