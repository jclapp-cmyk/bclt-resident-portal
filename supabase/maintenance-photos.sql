-- ══════════════════════════════════════════════════════
-- MAINTENANCE PHOTOS — add column + public storage bucket
-- Run this once in the Supabase SQL editor.
-- ══════════════════════════════════════════════════════

-- 1) Persist photo paths on the maintenance row
ALTER TABLE maintenance_requests
  ADD COLUMN IF NOT EXISTS photos JSONB DEFAULT '[]'::jsonb;

-- 2) Public bucket so admin can render photos without signing each URL
INSERT INTO storage.buckets (id, name, public)
VALUES ('maintenance-photos', 'maintenance-photos', true)
ON CONFLICT (id) DO NOTHING;

-- 3) Storage policies — authenticated users upload, anyone can read
CREATE POLICY "maint_photos_authed_upload" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'maintenance-photos' AND auth.uid() IS NOT NULL);

CREATE POLICY "maint_photos_public_read" ON storage.objects FOR SELECT
  USING (bucket_id = 'maintenance-photos');

CREATE POLICY "maint_photos_authed_delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'maintenance-photos' AND auth.uid() IS NOT NULL);
