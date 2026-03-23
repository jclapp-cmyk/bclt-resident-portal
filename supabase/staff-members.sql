-- Staff members: property managers and maintenance staff
CREATE TABLE IF NOT EXISTS staff_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'maintenance' CHECK (role IN ('property_manager', 'maintenance', 'admin')),
  email TEXT,
  phone TEXT,
  property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE staff_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_full_staff" ON staff_members FOR ALL USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "anyone_read_staff" ON staff_members FOR SELECT USING (true);
