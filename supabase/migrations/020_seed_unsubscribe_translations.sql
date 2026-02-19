-- ============================================================================
-- Seed Unsubscribe Page Translations
-- Migration: 020_seed_unsubscribe_translations.sql
-- Description: Seeds the unsubscribe section (22 keys x 2 locales) that was
--              added to translations.ts on Feb 18, 2026 but missed from DB seed.
-- Date: 2026-02-19
-- Safe to re-run: Uses ON CONFLICT DO NOTHING
-- ============================================================================

-- ===========================================
-- 1. Seed translation keys for unsubscribe section (22 keys)
-- ===========================================
INSERT INTO public.translation_keys (section, key, description) VALUES
  ('unsubscribe', 'title', 'unsubscribe.title'),
  ('unsubscribe', 'titleSuccess', 'unsubscribe.titleSuccess'),
  ('unsubscribe', 'titleError', 'unsubscribe.titleError'),
  ('unsubscribe', 'invalidLink', 'unsubscribe.invalidLink'),
  ('unsubscribe', 'invalidLinkDetails', 'unsubscribe.invalidLinkDetails'),
  ('unsubscribe', 'areYouSure', 'unsubscribe.areYouSure'),
  ('unsubscribe', 'willNotReceive', 'unsubscribe.willNotReceive'),
  ('unsubscribe', 'marketingEmails', 'unsubscribe.marketingEmails'),
  ('unsubscribe', 'specialOffers', 'unsubscribe.specialOffers'),
  ('unsubscribe', 'productUpdates', 'unsubscribe.productUpdates'),
  ('unsubscribe', 'willContinue', 'unsubscribe.willContinue'),
  ('unsubscribe', 'confirmButton', 'unsubscribe.confirmButton'),
  ('unsubscribe', 'processing', 'unsubscribe.processing'),
  ('unsubscribe', 'successMessage', 'unsubscribe.successMessage'),
  ('unsubscribe', 'changeYourMind', 'unsubscribe.changeYourMind'),
  ('unsubscribe', 'retry', 'unsubscribe.retry'),
  ('unsubscribe', 'connectionError', 'unsubscribe.connectionError'),
  ('unsubscribe', 'connectionErrorDetails', 'unsubscribe.connectionErrorDetails'),
  ('unsubscribe', 'unsubscribeFailed', 'unsubscribe.unsubscribeFailed'),
  ('unsubscribe', 'pleaseTryLater', 'unsubscribe.pleaseTryLater'),
  ('unsubscribe', 'backToHome', 'unsubscribe.backToHome'),
  ('unsubscribe', 'footer', 'unsubscribe.footer')
ON CONFLICT (section, key) DO NOTHING;

-- ===========================================
-- 2. Seed English translations
-- ===========================================
INSERT INTO public.translations (key_id, locale, value, is_reviewed) VALUES
  ((SELECT id FROM public.translation_keys WHERE section = 'unsubscribe' AND key = 'title'), 'en', 'Unsubscribe', TRUE),
  ((SELECT id FROM public.translation_keys WHERE section = 'unsubscribe' AND key = 'titleSuccess'), 'en', 'Unsubscribed', TRUE),
  ((SELECT id FROM public.translation_keys WHERE section = 'unsubscribe' AND key = 'titleError'), 'en', 'Error Occurred', TRUE),
  ((SELECT id FROM public.translation_keys WHERE section = 'unsubscribe' AND key = 'invalidLink'), 'en', 'Invalid unsubscribe link', TRUE),
  ((SELECT id FROM public.translation_keys WHERE section = 'unsubscribe' AND key = 'invalidLinkDetails'), 'en', 'Please try again from the link in your email.', TRUE),
  ((SELECT id FROM public.translation_keys WHERE section = 'unsubscribe' AND key = 'areYouSure'), 'en', 'Are you sure?', TRUE),
  ((SELECT id FROM public.translation_keys WHERE section = 'unsubscribe' AND key = 'willNotReceive'), 'en', 'By unsubscribing, you will no longer receive the following emails:', TRUE),
  ((SELECT id FROM public.translation_keys WHERE section = 'unsubscribe' AND key = 'marketingEmails'), 'en', 'Marketing and promotional emails', TRUE),
  ((SELECT id FROM public.translation_keys WHERE section = 'unsubscribe' AND key = 'specialOffers'), 'en', 'Special offers and campaigns', TRUE),
  ((SELECT id FROM public.translation_keys WHERE section = 'unsubscribe' AND key = 'productUpdates'), 'en', 'Product updates', TRUE),
  ((SELECT id FROM public.translation_keys WHERE section = 'unsubscribe' AND key = 'willContinue'), 'en', 'You will continue to receive important emails such as policy alerts and security notifications.', TRUE),
  ((SELECT id FROM public.translation_keys WHERE section = 'unsubscribe' AND key = 'confirmButton'), 'en', 'Yes, Unsubscribe Me', TRUE),
  ((SELECT id FROM public.translation_keys WHERE section = 'unsubscribe' AND key = 'processing'), 'en', 'Processing...', TRUE),
  ((SELECT id FROM public.translation_keys WHERE section = 'unsubscribe' AND key = 'successMessage'), 'en', 'You have been successfully unsubscribed from marketing emails. You will no longer receive promotional emails.', TRUE),
  ((SELECT id FROM public.translation_keys WHERE section = 'unsubscribe' AND key = 'changeYourMind'), 'en', 'If you change your mind, you can re-subscribe from your account settings.', TRUE),
  ((SELECT id FROM public.translation_keys WHERE section = 'unsubscribe' AND key = 'retry'), 'en', 'Try Again', TRUE),
  ((SELECT id FROM public.translation_keys WHERE section = 'unsubscribe' AND key = 'connectionError'), 'en', 'Connection error', TRUE),
  ((SELECT id FROM public.translation_keys WHERE section = 'unsubscribe' AND key = 'connectionErrorDetails'), 'en', 'Cannot reach the server. Please check your internet connection.', TRUE),
  ((SELECT id FROM public.translation_keys WHERE section = 'unsubscribe' AND key = 'unsubscribeFailed'), 'en', 'Unsubscribe failed', TRUE),
  ((SELECT id FROM public.translation_keys WHERE section = 'unsubscribe' AND key = 'pleaseTryLater'), 'en', 'Please try again later.', TRUE),
  ((SELECT id FROM public.translation_keys WHERE section = 'unsubscribe' AND key = 'backToHome'), 'en', 'Back to Home', TRUE),
  ((SELECT id FROM public.translation_keys WHERE section = 'unsubscribe' AND key = 'footer'), 'en', 'InsurAI - Turkey''s #1 Insurance Analysis Platform', TRUE)
ON CONFLICT (key_id, locale) DO NOTHING;

-- ===========================================
-- 3. Seed Turkish translations
-- ===========================================
INSERT INTO public.translations (key_id, locale, value, is_reviewed) VALUES
  ((SELECT id FROM public.translation_keys WHERE section = 'unsubscribe' AND key = 'title'), 'tr', 'Abonelikten Çık', TRUE),
  ((SELECT id FROM public.translation_keys WHERE section = 'unsubscribe' AND key = 'titleSuccess'), 'tr', 'Abonelikten Çıkıldı', TRUE),
  ((SELECT id FROM public.translation_keys WHERE section = 'unsubscribe' AND key = 'titleError'), 'tr', 'Hata Oluştu', TRUE),
  ((SELECT id FROM public.translation_keys WHERE section = 'unsubscribe' AND key = 'invalidLink'), 'tr', 'Geçersiz abonelikten çıkma bağlantısı', TRUE),
  ((SELECT id FROM public.translation_keys WHERE section = 'unsubscribe' AND key = 'invalidLinkDetails'), 'tr', 'E-postanızdaki bağlantıdan tekrar deneyin.', TRUE),
  ((SELECT id FROM public.translation_keys WHERE section = 'unsubscribe' AND key = 'areYouSure'), 'tr', 'Emin misiniz?', TRUE),
  ((SELECT id FROM public.translation_keys WHERE section = 'unsubscribe' AND key = 'willNotReceive'), 'tr', 'Abonelikten çıkarak artık aşağıdaki e-postaları almayacaksınız:', TRUE),
  ((SELECT id FROM public.translation_keys WHERE section = 'unsubscribe' AND key = 'marketingEmails'), 'tr', 'Pazarlama ve tanıtım e-postaları', TRUE),
  ((SELECT id FROM public.translation_keys WHERE section = 'unsubscribe' AND key = 'specialOffers'), 'tr', 'Özel teklifler ve kampanyalar', TRUE),
  ((SELECT id FROM public.translation_keys WHERE section = 'unsubscribe' AND key = 'productUpdates'), 'tr', 'Ürün güncellemeleri', TRUE),
  ((SELECT id FROM public.translation_keys WHERE section = 'unsubscribe' AND key = 'willContinue'), 'tr', 'Poliçe uyarıları ve güvenlik bildirimleri gibi önemli e-postaları almaya devam edeceksiniz.', TRUE),
  ((SELECT id FROM public.translation_keys WHERE section = 'unsubscribe' AND key = 'confirmButton'), 'tr', 'Evet, Aboneliğimi İptal Et', TRUE),
  ((SELECT id FROM public.translation_keys WHERE section = 'unsubscribe' AND key = 'processing'), 'tr', 'İşleniyor...', TRUE),
  ((SELECT id FROM public.translation_keys WHERE section = 'unsubscribe' AND key = 'successMessage'), 'tr', 'Pazarlama e-postalarından başarıyla çıktınız. Artık tanıtım e-postaları almayacaksınız.', TRUE),
  ((SELECT id FROM public.translation_keys WHERE section = 'unsubscribe' AND key = 'changeYourMind'), 'tr', 'Fikrinizi değiştirirseniz, hesap ayarlarınızdan tekrar abone olabilirsiniz.', TRUE),
  ((SELECT id FROM public.translation_keys WHERE section = 'unsubscribe' AND key = 'retry'), 'tr', 'Tekrar Dene', TRUE),
  ((SELECT id FROM public.translation_keys WHERE section = 'unsubscribe' AND key = 'connectionError'), 'tr', 'Bağlantı hatası', TRUE),
  ((SELECT id FROM public.translation_keys WHERE section = 'unsubscribe' AND key = 'connectionErrorDetails'), 'tr', 'Sunucuya ulaşılamıyor. Lütfen internet bağlantınızı kontrol edin.', TRUE),
  ((SELECT id FROM public.translation_keys WHERE section = 'unsubscribe' AND key = 'unsubscribeFailed'), 'tr', 'Abonelikten çıkma başarısız', TRUE),
  ((SELECT id FROM public.translation_keys WHERE section = 'unsubscribe' AND key = 'pleaseTryLater'), 'tr', 'Lütfen daha sonra tekrar deneyin.', TRUE),
  ((SELECT id FROM public.translation_keys WHERE section = 'unsubscribe' AND key = 'backToHome'), 'tr', 'Ana Sayfaya Dön', TRUE),
  ((SELECT id FROM public.translation_keys WHERE section = 'unsubscribe' AND key = 'footer'), 'tr', 'InsurAI - Türkiye''nin #1 Sigorta Analiz Platformu', TRUE)
ON CONFLICT (key_id, locale) DO NOTHING;

-- ===========================================
-- 4. Bump translation version
-- ===========================================
UPDATE public.translation_metadata SET value = '"3"'::jsonb WHERE key = 'version';
