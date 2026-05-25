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
--   - All maintenance requests
--   - All income certifications + TIC household members / income / assets
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
-- Each delete is wrapped in an EXISTS check so missing tables don't crash it.
-- ══════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  t TEXT;
  resident_table_exists BOOLEAN;
BEGIN
  -- Tables to wipe in FK-safe order
  FOREACH t IN ARRAY ARRAY[
    'tic_income_entries',
    'tic_asset_entries',
    'tic_household_members',
    'income_certifications',
    'rent_payments',
    'maintenance_requests',
    'lease_documents',
    'leases',
    'onboarding_workflows',
    'compliance_docs',
    'emergency_contacts',
    'household_members'
  ]
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
      EXECUTE format('DELETE FROM %I', t);
    END IF;
  END LOOP;

  -- Admin notes: only the ones tied to a resident
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'admin_notes') THEN
    DELETE FROM admin_notes WHERE resident_id IS NOT NULL;
  END IF;

  -- Message threads + messages where any resident is a participant.
  -- Broadcast threads are kept since they don't reference specific residents.
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'residents')
    INTO resident_table_exists;

  IF resident_table_exists AND EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'message_threads'
  ) THEN
    -- participants is JSONB (array of resident slugs); use ?| to test
    -- whether any of the resident slugs appears in the JSONB array.
    -- Skip the whole step if there are no residents (?| with an empty
    -- text[] would just be no-op anyway).
    IF EXISTS (SELECT 1 FROM residents) THEN
      DELETE FROM messages WHERE thread_id IN (
        SELECT id FROM message_threads
        WHERE participants ?| (SELECT array_agg(slug) FROM residents)
      );
      DELETE FROM message_threads
        WHERE participants ?| (SELECT array_agg(slug) FROM residents);
    END IF;
  END IF;

  -- Resident portal logins
  DELETE FROM user_profiles WHERE role = 'resident';

  -- Finally, residents themselves
  IF resident_table_exists THEN
    DELETE FROM residents;
  END IF;
END $$;

COMMIT;

-- ── Sanity check — should return 0 for all ──
SELECT
  (SELECT COUNT(*) FROM residents)                                          AS residents,
  (SELECT COUNT(*) FROM household_members)                                  AS household_members,
  (SELECT COUNT(*) FROM leases)                                             AS leases,
  (SELECT COUNT(*) FROM maintenance_requests)                               AS maintenance_requests,
  (SELECT COUNT(*) FROM income_certifications)                              AS income_certifications,
  (SELECT COUNT(*) FROM rent_payments)                                      AS rent_payments,
  (SELECT COUNT(*) FROM user_profiles WHERE role = 'resident')              AS resident_logins;
