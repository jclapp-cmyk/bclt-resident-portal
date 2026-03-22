-- BCLT Resident Portal — Auth Schema
-- Run this in Supabase SQL Editor AFTER schema.sql and seed.sql

-- ══════════════════════════════════════════
-- USER PROFILES (links auth.users to app roles)
-- ══════════════════════════════════════════
create table user_profiles (
  id            uuid primary key,  -- will match auth.users.id after first login
  email         text not null unique,
  role          text not null check (role in ('resident', 'admin', 'maintenance')),
  resident_id   uuid references residents(id),
  display_name  text,
  created_at    timestamptz default now()
);

alter table user_profiles enable row level security;

-- Anyone authenticated can read their own profile
create policy "users read own profile"
  on user_profiles for select
  using (auth.uid() = id);

-- Admins can read all profiles
create policy "admins read all profiles"
  on user_profiles for select
  using (
    exists (select 1 from user_profiles where id = auth.uid() and role = 'admin')
  );

-- Admins can insert/update/delete profiles
create policy "admins insert profiles"
  on user_profiles for insert
  with check (
    exists (select 1 from user_profiles where id = auth.uid() and role = 'admin')
  );

create policy "admins update profiles"
  on user_profiles for update
  using (
    exists (select 1 from user_profiles where id = auth.uid() and role = 'admin')
  );

-- Allow the trigger function to update profiles (runs as SECURITY DEFINER)
-- No additional policy needed since the trigger uses SECURITY DEFINER

-- ══════════════════════════════════════════
-- AUTO-LINK TRIGGER
-- When a user signs in for the first time via magic link,
-- match their auth.users email to the pre-created user_profiles row
-- and update the profile's id to the real auth user id.
-- ══════════════════════════════════════════
create or replace function link_profile_on_signup()
returns trigger as $$
begin
  update user_profiles
  set id = new.id
  where email = new.email
    and id != new.id;
  return new;
end;
$$ language plpgsql security definer;

create trigger trg_link_profile_on_signup
  after insert on auth.users
  for each row execute function link_profile_on_signup();

-- ══════════════════════════════════════════
-- SEED: Initial admin user profile
-- Uses a placeholder UUID. When the admin first signs in via magic link,
-- the trigger above will replace this UUID with their real auth.users.id.
-- ══════════════════════════════════════════
insert into user_profiles (id, email, role, resident_id, display_name)
values (
  '00000000-0000-0000-0000-000000000001',
  'maintenance@bolinaslandtrust.org',
  'admin',
  null,
  'Admin'
);
