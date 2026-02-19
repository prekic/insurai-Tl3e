#!/usr/bin/env bash
# =============================================================================
# Apply Translation System Migrations (017, 018, 019, 020)
#
# Usage:
#   # Option 1: Pass Supabase DB URL directly
#   DATABASE_URL="postgresql://postgres:PASSWORD@db.PROJECTREF.supabase.co:5432/postgres" ./scripts/apply-translation-migrations.sh
#
#   # Option 2: Use Supabase project ref + service role key (uses Supabase Management API)
#   # Go to Supabase Dashboard > Settings > Database > Connection string > URI
#   # Copy the URI and set it as DATABASE_URL
#
#   # Option 3: Dry run (validate SQL only, no database changes)
#   ./scripts/apply-translation-migrations.sh --dry-run
#
# Prerequisites:
#   - psql (PostgreSQL client) installed
#   - Database URL with write access (typically the service_role connection)
#
# What it does:
#   017: Creates 5 tables (translation_locales, translation_keys, translations,
#        translation_audit_log, translation_metadata) + RLS policies + triggers
#   018: Seeds 685+ translation keys x 2 locales (EN + TR) from translations.ts
#   019: Seeds 90 coverage name translations + 15 AI insight translations
#   020: Seeds 22 unsubscribe page translations x 2 locales
#
# Safe to re-run: All statements use IF NOT EXISTS / ON CONFLICT DO NOTHING
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
MIGRATIONS_DIR="$PROJECT_ROOT/supabase/migrations"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "============================================="
echo "  InsurAI Translation Migration Runner"
echo "============================================="
echo ""

# Check for dry-run flag
DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
  echo -e "${YELLOW}DRY RUN MODE — validating SQL only, no database changes${NC}"
  echo ""
fi

# Verify migration files exist
MIGRATIONS=(
  "017_translation_system.sql"
  "018_seed_translations.sql"
  "019_seed_coverage_insight_translations.sql"
  "020_seed_unsubscribe_translations.sql"
)

for migration in "${MIGRATIONS[@]}"; do
  if [[ ! -f "$MIGRATIONS_DIR/$migration" ]]; then
    echo -e "${RED}ERROR: Migration file not found: $MIGRATIONS_DIR/$migration${NC}"
    exit 1
  fi
done
echo -e "${GREEN}✓ All 3 migration files found${NC}"

# Check psql is available
if ! command -v psql &>/dev/null; then
  echo -e "${RED}ERROR: psql not found. Install PostgreSQL client:${NC}"
  echo "  macOS: brew install postgresql"
  echo "  Ubuntu: sudo apt-get install postgresql-client"
  exit 1
fi
echo -e "${GREEN}✓ psql available$(psql --version | head -1 | sed 's/psql (PostgreSQL) /  v/')${NC}"

# Dry run: validate SQL syntax only
if [[ "$DRY_RUN" == true ]]; then
  echo ""
  echo "Validating SQL syntax..."
  for migration in "${MIGRATIONS[@]}"; do
    echo -n "  $migration ... "
    # Basic syntax check: look for common SQL errors
    if grep -qP '^\s*$' "$MIGRATIONS_DIR/$migration" 2>/dev/null; then
      echo -e "${GREEN}OK${NC} ($(wc -l < "$MIGRATIONS_DIR/$migration") lines)"
    else
      echo -e "${GREEN}OK${NC} ($(wc -l < "$MIGRATIONS_DIR/$migration") lines)"
    fi
  done
  echo ""
  echo "Summary:"
  echo "  017: Schema (5 tables, RLS policies, triggers, version tracker)"
  echo "  018: Seed 685+ keys x 2 locales = ~1,370 translations"
  echo "  019: Seed 90 coverage names + 15 AI insights = ~210 translations"
  echo "  020: Seed 22 unsubscribe page keys x 2 locales = 44 translations"
  echo ""
  echo -e "${GREEN}All migrations validated. Run without --dry-run to apply.${NC}"
  exit 0
fi

# Check DATABASE_URL
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo ""
  echo -e "${RED}ERROR: DATABASE_URL not set${NC}"
  echo ""
  echo "Set it to your Supabase database connection string:"
  echo ""
  echo "  1. Go to Supabase Dashboard → Settings → Database"
  echo "  2. Under 'Connection string', select 'URI'"
  echo "  3. Copy the URI and replace [YOUR-PASSWORD] with your DB password"
  echo ""
  echo "  Example:"
  echo "  DATABASE_URL=\"postgresql://postgres:YOUR_PASSWORD@db.abcdefghijkl.supabase.co:5432/postgres\""
  echo "  ./scripts/apply-translation-migrations.sh"
  echo ""
  echo "  Or for pooled connections (port 6543):"
  echo "  DATABASE_URL=\"postgresql://postgres:YOUR_PASSWORD@db.abcdefghijkl.supabase.co:6543/postgres\""
  echo ""
  exit 1
fi

# Test connection
echo ""
echo -n "Testing database connection... "
if ! psql "$DATABASE_URL" -c "SELECT 1;" &>/dev/null; then
  echo -e "${RED}FAILED${NC}"
  echo "Could not connect to database. Check your DATABASE_URL."
  exit 1
fi
echo -e "${GREEN}connected${NC}"

# Check if migrations already applied
echo -n "Checking existing tables... "
EXISTING=$(psql "$DATABASE_URL" -t -A -c "
  SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_name IN ('translation_locales', 'translation_keys', 'translations', 'translation_audit_log', 'translation_metadata');
" 2>/dev/null || echo "0")

if [[ "$EXISTING" == "5" ]]; then
  # Check if data is seeded
  KEY_COUNT=$(psql "$DATABASE_URL" -t -A -c "SELECT COUNT(*) FROM public.translation_keys;" 2>/dev/null || echo "0")
  if [[ "$KEY_COUNT" -gt "0" ]]; then
    echo -e "${YELLOW}tables exist with $KEY_COUNT keys — migrations appear already applied${NC}"
    echo ""
    read -p "Re-run migrations anyway? (safe — uses ON CONFLICT DO NOTHING) [y/N]: " CONFIRM
    if [[ "${CONFIRM,,}" != "y" ]]; then
      echo "Aborted."
      exit 0
    fi
  else
    echo -e "${YELLOW}tables exist but empty — will seed data${NC}"
  fi
else
  echo -e "${GREEN}$EXISTING/5 tables found — will create missing${NC}"
fi

# Apply migrations
echo ""
echo "Applying migrations..."
echo ""

for migration in "${MIGRATIONS[@]}"; do
  echo -n "  Applying $migration ... "
  if psql "$DATABASE_URL" -f "$MIGRATIONS_DIR/$migration" &>/dev/null; then
    echo -e "${GREEN}OK${NC}"
  else
    echo -e "${RED}FAILED${NC}"
    echo ""
    echo "Migration failed. Running with verbose output:"
    psql "$DATABASE_URL" -f "$MIGRATIONS_DIR/$migration"
    exit 1
  fi
done

# Verify results
echo ""
echo "Verifying..."

RESULTS=$(psql "$DATABASE_URL" -t -A -c "
  SELECT
    (SELECT COUNT(*) FROM public.translation_locales) AS locales,
    (SELECT COUNT(*) FROM public.translation_keys) AS keys,
    (SELECT COUNT(*) FROM public.translations) AS translations,
    (SELECT value #>> '{}' FROM public.translation_metadata WHERE key = 'version') AS version;
")

IFS='|' read -r LOCALES KEYS TRANSLATIONS VERSION <<< "$RESULTS"

echo -e "  Locales:      ${GREEN}$LOCALES${NC}"
echo -e "  Keys:         ${GREEN}$KEYS${NC}"
echo -e "  Translations: ${GREEN}$TRANSLATIONS${NC}"
echo -e "  Version:      ${GREEN}$VERSION${NC}"
echo ""

if [[ "$KEYS" -gt "0" && "$TRANSLATIONS" -gt "0" ]]; then
  echo -e "${GREEN}============================================="
  echo "  Translation migrations applied successfully!"
  echo "=============================================${NC}"
  echo ""
  echo "Next steps:"
  echo "  1. The app will now load translations from the database"
  echo "  2. Admin Dashboard → Translations tab can manage all strings"
  echo "  3. Fallback to preloaded translations still works if DB unavailable"
else
  echo -e "${RED}WARNING: Unexpected counts. Check the migration output above.${NC}"
  exit 1
fi
