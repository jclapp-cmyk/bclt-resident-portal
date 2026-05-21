-- ══════════════════════════════════════════════════════
-- MAINTENANCE REDESIGN
-- Adds intake → work-order pipeline and vendor linkage.
-- Run this once in the Supabase SQL editor.
-- ══════════════════════════════════════════════════════

-- New columns
ALTER TABLE maintenance_requests
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'resident',
  ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES vendors(id),
  ADD COLUMN IF NOT EXISTS requester_name TEXT,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ;

-- Migrate existing statuses to the new pipeline:
--   submitted + unassigned → 'new'        (intake)
--   submitted + assigned   → 'todo'       (accepted work order)
--   completed              → 'done'
--   in-progress            → unchanged
UPDATE maintenance_requests SET status = 'new'  WHERE status = 'submitted' AND assigned_to IS NULL;
UPDATE maintenance_requests SET status = 'todo' WHERE status = 'submitted' AND assigned_to IS NOT NULL;
UPDATE maintenance_requests SET status = 'done' WHERE status = 'completed';

-- All existing rows have resident_id, so they were resident-submitted
UPDATE maintenance_requests SET source = 'resident' WHERE source IS NULL;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS maintenance_requests_status_idx ON maintenance_requests(status);
CREATE INDEX IF NOT EXISTS maintenance_requests_assigned_idx ON maintenance_requests(assigned_to);
CREATE INDEX IF NOT EXISTS maintenance_requests_vendor_idx ON maintenance_requests(vendor_id);
