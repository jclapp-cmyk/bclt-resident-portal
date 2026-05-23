-- ══════════════════════════════════════════════════════
-- INSPECTION TIME WINDOWS
-- Adds a free-form time/window field to regulatory + unit inspections.
-- Run once in Supabase SQL editor.
-- ══════════════════════════════════════════════════════

ALTER TABLE reg_inspections
  ADD COLUMN IF NOT EXISTS time_window TEXT;

ALTER TABLE unit_inspections
  ADD COLUMN IF NOT EXISTS time_window TEXT;
