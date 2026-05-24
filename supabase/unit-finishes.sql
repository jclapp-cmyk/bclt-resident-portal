-- ══════════════════════════════════════════════════════
-- UNIT FINISHES
-- The units table already has an `appliances` JSONB column from the
-- original schema; this adds a matching `finishes` column so each
-- unit can track its own materials/finishes alongside its appliances.
-- Run once in the Supabase SQL editor.
-- ══════════════════════════════════════════════════════

ALTER TABLE units
  ADD COLUMN IF NOT EXISTS finishes JSONB DEFAULT '[]'::jsonb;
