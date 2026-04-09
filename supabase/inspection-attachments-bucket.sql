-- Create a dedicated storage bucket for inspection checklist attachments.
-- Run this in the Supabase SQL editor.

insert into storage.buckets (id, name, public)
values ('inspection-attachments', 'inspection-attachments', false)
on conflict (id) do nothing;

-- RLS policies: allow authenticated users to upload/read/delete their own
-- inspection attachments. Tighten later if needed (e.g. admin/maintenance only).

drop policy if exists "inspection_attachments_select" on storage.objects;
create policy "inspection_attachments_select"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'inspection-attachments');

drop policy if exists "inspection_attachments_insert" on storage.objects;
create policy "inspection_attachments_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'inspection-attachments');

drop policy if exists "inspection_attachments_delete" on storage.objects;
create policy "inspection_attachments_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'inspection-attachments');
