-- ══════════════════════════════════════════════════════
-- WIPE ALL RESIDENT DATA
-- One-time cleanup script. Removes every resident plus all the
-- downstream data tied to them, so you can start fresh.
--
-- What this DOES delete:
--   - All residents (the residents table)
--   - All household members
--   - All leases + lease documents
--   - All rent payments
--   - All maintenance requests + their notes/photos refs
--   - All income certifications + TIC members/income/assets
--   - All onboarding workflows
--   - All compliance documents
--   - All admin notes attached to residents
--   - All message threads + messages with resident participants
--   - All user_profiles with role = 'resident' (portal logins)
--   - All emergency_contacts (if the table exists)
--
-- What this does NOT touch:
--   - properties, units
--   - staff_members, vendors
--   - user_profiles with role = 'admin' or 'maintenance'
--   - inspection_templates, inspection_checklists
--   - reg_inspections, unit_inspections (they're tied to units/properties)
--
-- Run this in the Supabase SQL editor (Dashboard → SQL → New query).
-- It's wrapped in a transaction — if anything fails, everything rolls back.
-- ══════════════════════════════════════════════════════

BEGIN;

-- 1. TIC (income certification) child tables — must go before income_certifications
DELETE FROM tic_income;
DELETE FROM tic_assets;
DELETE FROM tic_members;

-- 2. Income certifications
DELETE FROM income_certifications;

-- 3. Rent payments
DELETE FROM rent_payments;

-- 4. Maintenance requests (their photos column is JSONB, no separate table)
DELETE FROM maintenance_requests;

-- 5. Lease documents + leases
DELETE FROM lease_documents;
DELETE FROM leases;

-- 6. Onboarding + compliance
DELETE FROM onboarding_workflows;
DELETE FROM compliance_docs;

-- 7. Admin notes attached to residents
DELETE FROM admin_notes WHERE resident_id IS NOT NULL;

-- 8. Emergency contacts (table is optional — ignore if it doesn't exist)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'emergency_contacts') THEN
    DELETE FROM emergency_contacts;
  END IF;
END $$;

-- 9. Household members cascade from residents, but be explicit for clarity
DELETE FROM household_members;

-- 10. Message threads + messages where any resident is a participant
--     (Broadcast threads are kept since they don't reference a specific resident.)
DELETE FROM messages WHERE thread_id IN (
  SELECT id FROM message_threads
  WHERE participants && (SELECT array_agg(slug) FROM residents)
);
DELETE FROM message_threads
  WHERE participants && (SELECT array_agg(slug) FROM residents);

-- 11. User profiles with role = 'resident' (portal logins)
DELETE FROM user_profiles WHERE role = 'resident';

-- 12. Finally, residents themselves
DELETE FROM residents;

COMMIT;

-- Sanity check — should return 0 for all
SELECT
  (SELECT COUNT(*) FROM residents)               AS residents,
  (SELECT COUNT(*) FROM household_members)       AS household_members,
  (SELECT COUNT(*) FROM leases)                  AS leases,
  (SELECT COUNT(*) FROM maintenance_requests)    AS maintenance_requests,
  (SELECT COUNT(*) FROM income_certifications)   AS income_certifications,
  (SELECT COUNT(*) FROM rent_payments)           AS rent_payments,
  (SELECT COUNT(*) FROM user_profiles WHERE role = 'resident') AS resident_logins;
