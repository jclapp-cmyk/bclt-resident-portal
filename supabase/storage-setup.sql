-- ══════════════════════════════════════════════════════
-- SUPABASE STORAGE — Lease Documents Bucket
-- Run this in the SQL Editor
-- ══════════════════════════════════════════════════════

-- Create the storage bucket for lease documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('lease-documents', 'lease-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Policy: Admins can upload files
CREATE POLICY "admin_upload" ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'lease-documents'
    AND (SELECT role FROM public.user_profiles WHERE id = auth.uid()) = 'admin'
  );

-- Policy: Admins can read all files
CREATE POLICY "admin_read" ON storage.objects FOR SELECT
  USING (
    bucket_id = 'lease-documents'
    AND (SELECT role FROM public.user_profiles WHERE id = auth.uid()) IN ('admin')
  );

-- Policy: Residents can read their own files (path starts with their resident slug)
CREATE POLICY "resident_read_own" ON storage.objects FOR SELECT
  USING (
    bucket_id = 'lease-documents'
    AND (storage.foldername(name))[1] = (
      SELECT r.slug FROM public.residents r
      JOIN public.user_profiles up ON up.resident_id = r.id
      WHERE up.id = auth.uid()
    )
  );

-- Policy: Residents can upload to their own folder
CREATE POLICY "resident_upload_own" ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'lease-documents'
    AND (storage.foldername(name))[1] = (
      SELECT r.slug FROM public.residents r
      JOIN public.user_profiles up ON up.resident_id = r.id
      WHERE up.id = auth.uid()
    )
  );

-- Policy: Admins can delete files
CREATE POLICY "admin_delete" ON storage.objects FOR DELETE
  USING (
    bucket_id = 'lease-documents'
    AND (SELECT role FROM public.user_profiles WHERE id = auth.uid()) = 'admin'
  );
