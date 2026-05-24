-- ══════════════════════════════════════════════════════
-- PROPERTY APPLIANCES + FINISHES
-- Free-form lists of what's in the building and what materials/finishes
-- are installed (helpful for replacements, repairs, and capital planning).
-- Run once in the Supabase SQL editor.
-- ══════════════════════════════════════════════════════

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS appliances JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS finishes JSONB DEFAULT '[]'::jsonb;
