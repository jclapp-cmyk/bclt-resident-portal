-- ══════════════════════════════════════════════════════
-- WIPE ALL INSPECTION DATA
-- Removes the seeded test rows (with "Mike R." as inspector) plus any
-- other test inspection records, so the Inspections page starts empty.
--
-- DOES delete:
--   - unit_inspections (the per-unit history rows)
--   - reg_inspections (regulatory / authority-scheduled inspections)
--
-- Does NOT delete:
--   - inspection_templates (saved templates)
--   - inspection_checklists (custom checklist definitions)
--   - properties, units, residents, staff, vendors
-- ══════════════════════════════════════════════════════

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'unit_inspections') THEN
    DELETE FROM unit_inspections;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'reg_inspections') THEN
    DELETE FROM reg_inspections;
  END IF;
END $$;

COMMIT;

-- Sanity check — should both return 0:
SELECT
  (SELECT COUNT(*) FROM unit_inspections) AS unit_inspections,
  (SELECT COUNT(*) FROM reg_inspections)  AS reg_inspections;
