-- Fix: Temporarily disable RLS on user_profiles so the trigger can work
-- We'll re-enable with proper policies once auth flow is verified
ALTER TABLE user_profiles DISABLE ROW LEVEL SECURITY;
