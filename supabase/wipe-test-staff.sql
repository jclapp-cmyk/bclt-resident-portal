-- ══════════════════════════════════════════════════════
-- WIPE TEST STAFF ENTRIES
-- Targeted cleanup of obvious test staff. Matches names containing
-- "test" (case-insensitive) — preserves real staff like Jeff Clapp,
-- Alejandra Cuevas, Keith Ciampa, Kiko Guss.
--
-- Review the SELECTs at the top to confirm what will be deleted
-- BEFORE running the DELETE block.
-- ══════════════════════════════════════════════════════

-- ── 1. PREVIEW: what's about to be deleted ──
-- Run this first to see the list. If it looks right, run the DELETE block below.

SELECT 'staff_members' AS table_name, id, name, role, email
FROM staff_members
WHERE name ILIKE '%test%'

UNION ALL

SELECT 'user_profiles', id::text, COALESCE(display_name, email), role, email
FROM user_profiles
WHERE display_name ILIKE '%test%'
   OR email ILIKE '%test%';


-- ══════════════════════════════════════════════════════
-- DELETE BLOCK — uncomment to run after reviewing the preview.
-- ══════════════════════════════════════════════════════

/*
BEGIN;

-- Remove user_profiles whose display_name or email looks like a test.
-- This will NOT delete your real Jeff Clapp / Management account
-- (assuming his email doesn't contain "test").
DELETE FROM user_profiles
WHERE (display_name ILIKE '%test%' OR email ILIKE '%test%')
  AND role != 'resident';  -- safety: residents are managed via wipe-residents.sql

-- Remove staff_members entries with "test" in the name
DELETE FROM staff_members WHERE name ILIKE '%test%';

COMMIT;
*/

-- ── Sanity check after running ──
-- These should both return 0:
-- SELECT COUNT(*) FROM staff_members WHERE name ILIKE '%test%';
-- SELECT COUNT(*) FROM user_profiles WHERE (display_name ILIKE '%test%' OR email ILIKE '%test%') AND role != 'resident';
