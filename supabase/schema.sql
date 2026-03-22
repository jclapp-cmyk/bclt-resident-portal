-- BCLT Resident Portal — Core Schema
-- Run this in Supabase SQL Editor (Settings > SQL Editor)

create extension if not exists "uuid-ossp";

-- ══════════════════════════════════════════
-- PROPERTIES
-- ══════════════════════════════════════════
create table properties (
  id              uuid primary key default uuid_generate_v4(),
  slug            text unique not null,
  name            text not null,
  address         text,
  type            text,
  year_built      int,
  last_renovation int,
  total_units     int not null default 0,
  unit_breakdown  jsonb default '{}'::jsonb,
  total_sf        int default 0,
  common_area_sf  int default 0,
  lot_size        text,
  ada_units       int default 0,
  manager         text,
  manager_phone   text,
  manager_email   text,
  office_hours    text,
  documents       jsonb default '[]'::jsonb,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ══════════════════════════════════════════
-- UNITS
-- ══════════════════════════════════════════
create table units (
  id                     uuid primary key default uuid_generate_v4(),
  property_id            uuid not null references properties(id) on delete cascade,
  number                 text not null,
  bedrooms               int not null default 1,
  bathrooms              int not null default 1,
  sqft                   int,
  floor_plan             text,
  utility_responsibility jsonb default '{}'::jsonb,
  appliances             jsonb default '[]'::jsonb,
  last_inspection        jsonb,
  created_at             timestamptz default now(),
  updated_at             timestamptz default now(),
  unique(property_id, number)
);

-- ══════════════════════════════════════════
-- RESIDENTS
-- ══════════════════════════════════════════
create table residents (
  id                uuid primary key default uuid_generate_v4(),
  slug              text unique not null,
  property_id       uuid not null references properties(id),
  unit_id           uuid references units(id),
  name              text not null,
  phone             text,
  email             text,
  preferred_channel text default 'email',
  status            text default 'active',
  move_in_date      date,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

-- ══════════════════════════════════════════
-- LEASES
-- ══════════════════════════════════════════
create table leases (
  id              uuid primary key default uuid_generate_v4(),
  resident_id     uuid not null references residents(id) on delete cascade,
  unit_id         uuid not null references units(id),
  start_date      date not null,
  end_date        date,
  rent_amount     numeric(10,2) not null,
  tenant_portion  numeric(10,2),
  hap_payment     numeric(10,2),
  status          text default 'active',
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ══════════════════════════════════════════
-- LEASE DOCUMENTS
-- ══════════════════════════════════════════
create table lease_documents (
  id            uuid primary key default uuid_generate_v4(),
  resident_id   uuid not null references residents(id) on delete cascade,
  lease_id      uuid references leases(id),
  name          text not null,
  type          text,
  size          int,
  storage_path  text,
  uploaded_at   timestamptz default now(),
  uploaded_by   text default 'Admin'
);

-- ══════════════════════════════════════════
-- ROW LEVEL SECURITY (permissive for now)
-- ══════════════════════════════════════════
alter table properties      enable row level security;
alter table units            enable row level security;
alter table residents        enable row level security;
alter table leases           enable row level security;
alter table lease_documents  enable row level security;

create policy "public read"  on properties      for select using (true);
create policy "public read"  on units            for select using (true);
create policy "public read"  on residents        for select using (true);
create policy "public read"  on leases           for select using (true);
create policy "public read"  on lease_documents  for select using (true);

create policy "public insert"  on properties      for insert with check (true);
create policy "public update"  on properties      for update using (true);
create policy "public insert"  on units            for insert with check (true);
create policy "public update"  on units            for update using (true);
create policy "public insert"  on residents        for insert with check (true);
create policy "public update"  on residents        for update using (true);
create policy "public insert"  on leases           for insert with check (true);
create policy "public update"  on leases           for update using (true);
create policy "public insert"  on lease_documents  for insert with check (true);
create policy "public update"  on lease_documents  for update using (true);

-- ══════════════════════════════════════════
-- UPDATED_AT TRIGGER
-- ══════════════════════════════════════════
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_properties_updated     before update on properties     for each row execute function update_updated_at();
create trigger trg_units_updated           before update on units           for each row execute function update_updated_at();
create trigger trg_residents_updated       before update on residents       for each row execute function update_updated_at();
create trigger trg_leases_updated          before update on leases          for each row execute function update_updated_at();
create trigger trg_lease_documents_updated before update on lease_documents for each row execute function update_updated_at();
