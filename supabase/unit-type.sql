-- ══════════════════════════════════════════════════════
-- UNIT TYPE
-- Replaces the boolean is_rv with a proper unit_type enum: apartment,
-- sro, house, rv. Existing is_rv values are migrated. The boolean
-- column is left in place for any code that still references it.
-- ══════════════════════════════════════════════════════

ALTER TABLE units
  ADD COLUMN IF NOT EXISTS unit_type TEXT;

-- Backfill: rows with is_rv = true get 'rv', everything else 'apartment'
UPDATE units SET unit_type = 'rv'        WHERE unit_type IS NULL AND is_rv = true;
UPDATE units SET unit_type = 'apartment' WHERE unit_type IS NULL;

-- Index for filtering
CREATE INDEX IF NOT EXISTS units_unit_type_idx ON units(unit_type);
