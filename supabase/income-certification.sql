-- Income Certification (TIC) Schema
-- Run this in Supabase SQL Editor

-- Master certification record
CREATE TABLE IF NOT EXISTS income_certifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  resident_id UUID NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
  cert_type TEXT NOT NULL DEFAULT 'annual' CHECK (cert_type IN ('initial', 'annual', 'interim', 'move_in', 'move_out')),
  effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_progress', 'pending_review', 'approved', 'rejected')),
  steps_completed JSONB DEFAULT '{"household":false,"income":false,"assets":false,"rent":false,"eligibility":false,"signature":false}',

  -- Household summary
  household_size INTEGER DEFAULT 1,

  -- Income totals
  total_annual_income NUMERIC(12,2) DEFAULT 0,
  total_asset_value NUMERIC(12,2) DEFAULT 0,
  total_asset_income NUMERIC(12,2) DEFAULT 0,
  imputed_asset_income NUMERIC(12,2) DEFAULT 0,
  income_for_determination NUMERIC(12,2) DEFAULT 0,

  -- AMI determination
  ami_percentage NUMERIC(5,2),
  ami_category TEXT,
  income_eligible BOOLEAN,

  -- Rent
  tenant_rent NUMERIC(10,2) DEFAULT 0,
  utility_allowance NUMERIC(10,2) DEFAULT 0,
  other_charges NUMERIC(10,2) DEFAULT 0,
  gross_rent NUMERIC(10,2) DEFAULT 0,
  hap_payment NUMERIC(10,2) DEFAULT 0,
  federal_assistance_source TEXT,
  rent_limit NUMERIC(10,2),
  rent_compliant BOOLEAN,

  -- Program
  program_type TEXT DEFAULT '9% LIHTC',
  additional_programs JSONB DEFAULT '[]',
  all_student_household BOOLEAN DEFAULT false,
  student_exemption TEXT,

  -- Signatures
  resident_signature TEXT, -- data URL from canvas
  resident_signed_at TIMESTAMPTZ,
  admin_signature TEXT,
  admin_signed_at TIMESTAMPTZ,
  admin_signer_name TEXT,

  -- Demographics (optional HUD reporting)
  demographics JSONB DEFAULT '[]',

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Household members snapshot per certification
CREATE TABLE IF NOT EXISTS tic_household_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  certification_id UUID NOT NULL REFERENCES income_certifications(id) ON DELETE CASCADE,
  member_name TEXT NOT NULL,
  relationship TEXT NOT NULL DEFAULT 'Head of Household',
  date_of_birth DATE,
  ssn_last4 TEXT,
  is_full_time_student BOOLEAN DEFAULT false,
  is_part_time_student BOOLEAN DEFAULT false,
  is_disabled BOOLEAN DEFAULT false,
  race_code TEXT,
  ethnicity_code TEXT,
  sort_order INTEGER DEFAULT 0
);

-- Income entries per member
CREATE TABLE IF NOT EXISTS tic_income_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  certification_id UUID NOT NULL REFERENCES income_certifications(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES tic_household_members(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('employment', 'social_security', 'public_assistance', 'other')),
  source_description TEXT,
  annual_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  verified BOOLEAN DEFAULT false,
  verification_doc_path TEXT -- Supabase Storage path
);

-- Asset entries per member
CREATE TABLE IF NOT EXISTS tic_asset_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  certification_id UUID NOT NULL REFERENCES income_certifications(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES tic_household_members(id) ON DELETE CASCADE,
  asset_type TEXT NOT NULL DEFAULT 'savings',
  description TEXT,
  is_imputed BOOLEAN DEFAULT false, -- disposed of asset within 2 years for less than FMV
  cash_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  annual_income NUMERIC(12,2) NOT NULL DEFAULT 0
);

-- RLS
ALTER TABLE income_certifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE tic_household_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE tic_income_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE tic_asset_entries ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "admin_full_certs" ON income_certifications FOR ALL USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "admin_full_tic_members" ON tic_household_members FOR ALL USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "admin_full_tic_income" ON tic_income_entries FOR ALL USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "admin_full_tic_assets" ON tic_asset_entries FOR ALL USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Resident can view own certs
CREATE POLICY "resident_view_own_certs" ON income_certifications FOR SELECT USING (
  resident_id IN (SELECT resident_id FROM user_profiles WHERE id = auth.uid())
);

-- Supabase Storage bucket for TIC verification documents
-- Run this separately or create via Supabase Dashboard > Storage:
-- CREATE BUCKET 'tic-documents' (public: false)

-- AMI reference data (Marin County 2026) with rent limits
-- Using the existing ami_reference table if it exists, otherwise create it
CREATE TABLE IF NOT EXISTS ami_rent_limits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  year INTEGER NOT NULL DEFAULT 2026,
  county TEXT NOT NULL DEFAULT 'Marin',
  ami_pct INTEGER NOT NULL,
  bedrooms INTEGER NOT NULL,
  rent_limit NUMERIC(10,2) NOT NULL,
  UNIQUE(year, county, ami_pct, bedrooms)
);

ALTER TABLE ami_rent_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone_read_rent_limits" ON ami_rent_limits FOR SELECT USING (true);

-- Seed Marin County 2026 LIHTC rent limits (approximate)
INSERT INTO ami_rent_limits (year, county, ami_pct, bedrooms, rent_limit) VALUES
(2026, 'Marin', 30, 0, 545), (2026, 'Marin', 30, 1, 584), (2026, 'Marin', 30, 2, 701), (2026, 'Marin', 30, 3, 809), (2026, 'Marin', 30, 4, 903),
(2026, 'Marin', 50, 0, 909), (2026, 'Marin', 50, 1, 974), (2026, 'Marin', 50, 2, 1168), (2026, 'Marin', 50, 3, 1349), (2026, 'Marin', 50, 4, 1505),
(2026, 'Marin', 60, 0, 1091), (2026, 'Marin', 60, 1, 1168), (2026, 'Marin', 60, 2, 1402), (2026, 'Marin', 60, 3, 1619), (2026, 'Marin', 60, 4, 1806),
(2026, 'Marin', 80, 0, 1454), (2026, 'Marin', 80, 1, 1558), (2026, 'Marin', 80, 2, 1869), (2026, 'Marin', 80, 3, 2158), (2026, 'Marin', 80, 4, 2408)
ON CONFLICT DO NOTHING;
