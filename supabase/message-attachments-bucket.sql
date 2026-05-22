-- ══════════════════════════════════════════════════════
-- SUPABASE STORAGE — Message Attachments Bucket
-- Run this in the SQL Editor once.
-- ══════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public)
VALUES ('message-attachments', 'message-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Authenticated users can upload to message-attachments
CREATE POLICY "msg_attach_authed_upload" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'message-attachments' AND auth.uid() IS NOT NULL);

-- Anyone (signed in or via public URL) can read
CREATE POLICY "msg_attach_public_read" ON storage.objects FOR SELECT
  USING (bucket_id = 'message-attachments');

-- Authenticated users can delete their own (allow any for now — tighten later)
CREATE POLICY "msg_attach_authed_delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'message-attachments' AND auth.uid() IS NOT NULL);
