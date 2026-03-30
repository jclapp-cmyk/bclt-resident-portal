-- Admin Notes table
create table if not exists admin_notes (
  id uuid default gen_random_uuid() primary key,
  resident_id uuid references residents(id) on delete cascade,
  author text not null default 'Admin',
  note_date date not null default current_date,
  text text not null,
  created_at timestamptz default now()
);

-- RLS
alter table admin_notes enable row level security;

create policy "Admins can manage admin notes"
  on admin_notes for all
  using (true)
  with check (true);

-- Index for fast lookups by resident
create index if not exists idx_admin_notes_resident on admin_notes(resident_id);
