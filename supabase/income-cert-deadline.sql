-- ══════════════════════════════════════════════════════
-- INCOME CERTIFICATION — deadline + reject reason + needs-info
-- Run once in the Supabase SQL editor.
-- ══════════════════════════════════════════════════════

ALTER TABLE income_certifications
  ADD COLUMN IF NOT EXISTS deadline DATE,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS info_request TEXT,
  ADD COLUMN IF NOT EXISTS last_notified_at TIMESTAMPTZ;
