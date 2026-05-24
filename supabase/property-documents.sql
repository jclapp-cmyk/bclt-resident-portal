-- ══════════════════════════════════════════════════════
-- PROPERTY RECORDS — plans, manuals, regulatory agreements, etc.
-- Run once in the Supabase SQL editor.
-- ══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS property_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL,        -- plan | manual | regulatory_agreement | inspection_report | insurance | other
  name TEXT NOT NULL,
  path TEXT NOT NULL,            -- storage object path
  notes TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT now(),
  uploaded_by TEXT
);

ALTER TABLE property_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "property_docs_authed_read" ON property_documents FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "property_docs_authed_write" ON property_documents FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "property_docs_authed_update" ON property_documents FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "property_docs_authed_delete" ON property_documents FOR DELETE USING (auth.uid() IS NOT NULL);

CREATE INDEX IF NOT EXISTS property_documents_property_idx ON property_documents(property_id);

-- Private storage bucket — only authenticated users can access
INSERT INTO storage.buckets (id, name, public)
VALUES ('property-documents', 'property-documents', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "prop_doc_authed_upload" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'property-documents' AND auth.uid() IS NOT NULL);

CREATE POLICY "prop_doc_authed_read" ON storage.objects FOR SELECT
  USING (bucket_id = 'property-documents' AND auth.uid() IS NOT NULL);

CREATE POLICY "prop_doc_authed_delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'property-documents' AND auth.uid() IS NOT NULL);
