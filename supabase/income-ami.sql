-- Add income and household size to residents
ALTER TABLE residents ADD COLUMN IF NOT EXISTS household_income NUMERIC DEFAULT 0;
ALTER TABLE residents ADD COLUMN IF NOT EXISTS household_size INTEGER DEFAULT 1;

-- 2026 Marin County AMI reference table (HUD FY2026 estimates)
-- These are approximate values for planning purposes
CREATE TABLE IF NOT EXISTS ami_reference (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  year INTEGER NOT NULL DEFAULT 2026,
  county TEXT NOT NULL DEFAULT 'Marin',
  household_size INTEGER NOT NULL,
  ami_100 NUMERIC NOT NULL,  -- 100% AMI
  ami_80 NUMERIC NOT NULL,   -- 80% AMI (Low Income)
  ami_60 NUMERIC NOT NULL,   -- 60% AMI (Very Low Income)
  ami_50 NUMERIC NOT NULL,   -- 50% AMI
  ami_30 NUMERIC NOT NULL    -- 30% AMI (Extremely Low Income)
);

-- Seed Marin County 2026 AMI data (approximate HUD limits)
INSERT INTO ami_reference (year, county, household_size, ami_100, ami_80, ami_60, ami_50, ami_30) VALUES
(2026, 'Marin', 1, 104900, 83920, 62940, 52450, 31470),
(2026, 'Marin', 2, 119900, 95920, 71940, 59950, 35970),
(2026, 'Marin', 3, 134850, 107880, 80910, 67425, 40455),
(2026, 'Marin', 4, 149800, 119840, 89880, 74900, 44940),
(2026, 'Marin', 5, 161800, 129440, 97080, 80900, 48540),
(2026, 'Marin', 6, 173800, 139040, 104280, 86900, 52140),
(2026, 'Marin', 7, 185800, 148640, 111480, 92900, 55740),
(2026, 'Marin', 8, 197800, 158240, 118680, 98900, 59340);

-- RLS
ALTER TABLE ami_reference ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone_read_ami" ON ami_reference FOR SELECT USING (true);
