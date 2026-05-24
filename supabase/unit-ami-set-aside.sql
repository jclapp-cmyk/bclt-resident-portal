-- ══════════════════════════════════════════════════════
-- UNIT AMI SET-ASIDE
-- The AMI tier the unit is restricted to (e.g. 30%, 50%, 60%, 80%, Market).
-- Used during income certification to compare resident income against the
-- correct rent + income limits.
-- ══════════════════════════════════════════════════════

ALTER TABLE units
  ADD COLUMN IF NOT EXISTS ami_set_aside TEXT;
