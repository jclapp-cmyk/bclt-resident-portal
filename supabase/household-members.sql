-- Household members / secondary tenants
CREATE TABLE IF NOT EXISTS household_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  resident_id UUID NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  relationship TEXT NOT NULL DEFAULT 'Spouse',
  phone TEXT,
  email TEXT,
  date_of_birth DATE,
  is_adult BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE household_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_full_household" ON household_members FOR ALL USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "resident_own_household" ON household_members FOR SELECT USING (
  resident_id IN (SELECT resident_id FROM user_profiles WHERE id = auth.uid())
);
