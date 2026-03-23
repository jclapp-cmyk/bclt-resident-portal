-- ══════════════════════════════════════════════════════
-- VENDORS
-- ══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company TEXT NOT NULL,
  contact TEXT,
  phone TEXT,
  email TEXT,
  trade TEXT NOT NULL,
  license TEXT,
  license_exp DATE,
  insured BOOLEAN DEFAULT true,
  coi_exp DATE,
  active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all vendors" ON vendors FOR ALL USING (true) WITH CHECK (true);

-- Seed vendors
INSERT INTO vendors (company, contact, phone, email, trade, license, license_exp, insured, coi_exp, active, notes) VALUES
  ('Bay Plumbing Co.', 'Tom Hernandez', '(415) 555-0142', 'tom@bayplumbing.com', 'Plumbing', 'CA-PLB-892341', '2027-03-15', true, '2026-12-01', true, 'Preferred for emergency calls. 24/7 availability.'),
  ('Pacific HVAC Services', 'Janet Liu', '(415) 555-0287', 'janet@pachvac.com', 'HVAC', 'CA-HVAC-445120', '2026-08-30', true, '2026-09-15', true, 'Handles all Carrier warranty work.'),
  ('Marin Pest Solutions', 'Dave Kowalski', '(415) 555-0391', 'dave@marinpest.com', 'Pest Control', 'CA-PCO-12890', '2027-01-10', true, '2027-01-10', true, 'Quarterly treatment contract. Bed bug specialist.'),
  ('Coastal Electric', 'Ray Nguyen', '(415) 555-0544', 'ray@coastalelectric.com', 'Electrical', 'CA-ELEC-667234', '2026-05-20', true, '2026-06-01', true, ''),
  ('Summit Roofing', 'Carlos Mendez', '(415) 555-0678', 'carlos@summitroofing.com', 'Roofing', 'CA-ROF-334521', '2025-11-30', false, '2025-11-30', false, 'License expired. DO NOT USE until renewed.');

-- ══════════════════════════════════════════════════════
-- UNIT INSPECTIONS
-- ══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS unit_inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  property_id UUID NOT NULL REFERENCES properties(id),
  unit_id UUID REFERENCES units(id),
  category TEXT NOT NULL,
  inspection_date DATE NOT NULL,
  inspector TEXT,
  result TEXT NOT NULL DEFAULT 'Pass',
  score TEXT,
  failed_items JSONB DEFAULT '[]'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE unit_inspections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all unit_inspections" ON unit_inspections FOR ALL USING (true) WITH CHECK (true);

-- Seed unit inspections
INSERT INTO unit_inspections (code, property_id, unit_id, category, inspection_date, inspector, result, score, failed_items, notes) VALUES
  ('UI-101', (SELECT id FROM properties WHERE slug='wharf'), (SELECT id FROM units WHERE number='B-204'), 'Annual / Routine', '2025-12-05', 'Mike R.', 'Pass', NULL, '[]', 'All items in good condition.'),
  ('UI-102', (SELECT id FROM properties WHERE slug='wharf'), (SELECT id FROM units WHERE number='B-204'), 'Safety / Smoke Detector', '2025-10-15', 'Mike R.', 'Fail', NULL, '["CO detector - battery dead","Fire extinguisher charge - low"]', 'Replaced CO battery. Fire extinguisher scheduled for replacement.'),
  ('UI-103', (SELECT id FROM properties WHERE slug='wharf'), (SELECT id FROM units WHERE number='A-108'), 'Pre-HQS / Pre-REAC', '2025-11-01', 'Mike R.', 'Pass', '14/15', '["Paint condition (lead-safe) - peeling in bathroom"]', 'Minor paint touch-up needed before HQS.'),
  ('UI-104', (SELECT id FROM properties WHERE slug='wharf'), (SELECT id FROM units WHERE number='C-310'), 'Pest', '2026-01-20', 'Mike R.', 'Fail', NULL, '["Roach evidence - kitchen cabinets","Entry points sealed - gap under sink"]', 'Vendor treatment scheduled.'),
  ('UI-105', (SELECT id FROM properties WHERE slug='wharf'), (SELECT id FROM units WHERE number='B-204'), 'Seasonal / Preventive', '2026-03-01', 'Mike R.', 'Pass', NULL, '[]', 'HVAC filter replaced. All weatherization intact.'),
  ('UI-106', (SELECT id FROM properties WHERE slug='mesa'), (SELECT id FROM units WHERE number='M-101'), 'Annual / Routine', '2025-11-20', 'Mike R.', 'Pass', NULL, '[]', 'Unit in good condition.'),
  ('UI-107', (SELECT id FROM properties WHERE slug='mesa'), (SELECT id FROM units WHERE number='M-205'), 'Safety / Smoke Detector', '2026-01-10', 'Mike R.', 'Pass', NULL, '[]', 'All detectors functional.'),
  ('UI-108', (SELECT id FROM properties WHERE slug='terrace'), (SELECT id FROM units WHERE number='T-101'), 'Annual / Routine', '2025-12-15', 'Mike R.', 'Pass', NULL, '[]', 'Unit in excellent condition.'),
  ('UI-109', (SELECT id FROM properties WHERE slug='terrace'), (SELECT id FROM units WHERE number='T-202'), 'Seasonal / Preventive', '2026-02-10', 'Mike R.', 'Fail', NULL, '["HVAC filter - heavily clogged"]', 'Filter replaced on site.');

-- ══════════════════════════════════════════════════════
-- REGULATORY INSPECTIONS
-- ══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS reg_inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  property_id UUID NOT NULL REFERENCES properties(id),
  type TEXT NOT NULL,
  authority TEXT NOT NULL,
  inspection_date DATE,
  result TEXT DEFAULT 'Pass',
  score INT,
  next_due DATE,
  units_inspected INT,
  deficiencies INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE reg_inspections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all reg_inspections" ON reg_inspections FOR ALL USING (true) WITH CHECK (true);

-- Seed regulatory inspections
INSERT INTO reg_inspections (code, property_id, type, authority, inspection_date, result, score, next_due, units_inspected, deficiencies) VALUES
  ('RI-01', (SELECT id FROM properties WHERE slug='wharf'), 'HQS', 'Marin County Housing Authority', '2025-11-14', 'Pass', NULL, '2026-11-14', 42, 0),
  ('RI-02', (SELECT id FROM properties WHERE slug='wharf'), 'REAC/NSPIRE', 'HUD', '2025-06-20', 'Pass', 88, '2027-06-20', 42, 3),
  ('RI-03', (SELECT id FROM properties WHERE slug='wharf'), 'Fire & Safety', 'Bolinas Fire Dept.', '2025-09-10', 'Pass', NULL, '2026-09-10', NULL, 1),
  ('RI-04', (SELECT id FROM properties WHERE slug='wharf'), 'LIHTC Compliance', 'TCAC (California)', '2025-04-15', 'Pass', NULL, '2026-04-15', 10, 0),
  ('RI-05', (SELECT id FROM properties WHERE slug='wharf'), 'Lead-Based Paint', 'EPA / CA DPH', '2024-08-22', 'Pass', NULL, '2026-08-22', 8, 0),
  ('RI-06', (SELECT id FROM properties WHERE slug='mesa'), 'HQS', 'Marin County Housing Authority', '2025-10-05', 'Pass', NULL, '2026-10-05', 18, 0),
  ('RI-07', (SELECT id FROM properties WHERE slug='mesa'), 'Fire & Safety', 'Bolinas Fire Dept.', '2025-08-20', 'Pass', NULL, '2026-08-20', NULL, 0),
  ('RI-08', (SELECT id FROM properties WHERE slug='terrace'), 'HQS', 'Marin County Housing Authority', '2025-12-01', 'Pass', NULL, '2026-12-01', 24, 1),
  ('RI-09', (SELECT id FROM properties WHERE slug='terrace'), 'REAC/NSPIRE', 'HUD', '2025-03-15', 'Pass', 92, '2027-03-15', 24, 1),
  ('RI-10', (SELECT id FROM properties WHERE slug='terrace'), 'Fire & Safety', 'Bolinas Fire Dept.', '2025-07-10', 'Pass', NULL, '2026-07-10', NULL, 0);
