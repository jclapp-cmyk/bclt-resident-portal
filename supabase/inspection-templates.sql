-- ══════════════════════════════════════════════════════
-- INSPECTION TEMPLATES — custom checklists admins can author
-- Run once in the Supabase SQL editor.
-- ══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS inspection_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,           -- e.g. TPL-abc123
  name TEXT NOT NULL,
  description TEXT,
  frequency TEXT,                      -- "Annual", "Quarterly", "Monthly", "As needed", etc.
  scoring TEXT,                        -- "pass-fail" | "scored" | "yesNoNa"
  sections JSONB NOT NULL DEFAULT '[]'::jsonb,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE inspection_templates ENABLE ROW LEVEL SECURITY;

-- Allow any authenticated user to read/write (tighten later if needed)
CREATE POLICY "templates_authed_read" ON inspection_templates FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY "templates_authed_write" ON inspection_templates FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "templates_authed_update" ON inspection_templates FOR UPDATE
  USING (auth.uid() IS NOT NULL);
CREATE POLICY "templates_authed_delete" ON inspection_templates FOR DELETE
  USING (auth.uid() IS NOT NULL);

CREATE INDEX IF NOT EXISTS inspection_templates_active_idx ON inspection_templates(active);
