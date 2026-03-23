-- ══════════════════════════════════════════════════════
-- COMPLIANCE DOCUMENTS
-- ══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS compliance_docs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id),
  resident_id UUID NOT NULL REFERENCES residents(id),
  unit TEXT NOT NULL,
  doc_type TEXT NOT NULL,  -- lease, inspection, hud_form, etc.
  status TEXT NOT NULL DEFAULT 'missing',  -- current, expired, missing
  expires DATE,
  last_uploaded DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE compliance_docs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all compliance_docs" ON compliance_docs FOR ALL USING (true) WITH CHECK (true);

-- Seed compliance docs
INSERT INTO compliance_docs (property_id, resident_id, unit, doc_type, status, expires, last_uploaded)
SELECT p.id, r.id, cd.unit, cd.doc_type, cd.status, cd.expires::date, cd.last_uploaded::date
FROM (VALUES
  ('wharf', 'maria-santos', 'B-204', 'lease', 'current', '2024-05-31', '2024-05-15'),
  ('wharf', 'maria-santos', 'B-204', 'inspection', 'current', NULL, '2025-11-14'),
  ('wharf', 'maria-santos', 'B-204', 'hud_form', 'missing', NULL, NULL),
  ('wharf', 'james-whitfield', 'A-108', 'lease', 'current', '2025-08-31', '2022-09-01'),
  ('wharf', 'james-whitfield', 'A-108', 'inspection', 'current', NULL, '2025-11-01'),
  ('wharf', 'james-whitfield', 'A-108', 'hud_form', 'current', NULL, '2025-06-20'),
  ('wharf', 'linda-chen', 'C-310', 'lease', 'expired', '2025-01-14', '2024-01-15'),
  ('wharf', 'linda-chen', 'C-310', 'inspection', 'missing', NULL, NULL),
  ('wharf', 'linda-chen', 'C-310', 'hud_form', 'missing', NULL, NULL),
  ('wharf', 'robert-garcia', 'A-102', 'lease', 'current', '2026-02-28', '2021-03-01'),
  ('wharf', 'robert-garcia', 'A-102', 'inspection', 'current', NULL, '2025-10-15'),
  ('wharf', 'robert-garcia', 'A-102', 'hud_form', 'current', NULL, '2025-04-15'),
  ('wharf', 'sarah-johnson', 'B-108', 'lease', 'expired', '2025-06-30', '2024-07-01'),
  ('wharf', 'sarah-johnson', 'B-108', 'inspection', 'missing', NULL, NULL),
  ('wharf', 'sarah-johnson', 'B-108', 'hud_form', 'missing', NULL, NULL),
  ('mesa', 'anna-kowalski', 'M-101', 'lease', 'current', '2025-02-28', '2023-03-01'),
  ('mesa', 'anna-kowalski', 'M-101', 'hud_form', 'current', NULL, '2025-01-10'),
  ('mesa', 'carlos-rivera', 'M-205', 'lease', 'current', '2025-05-31', '2024-06-01'),
  ('mesa', 'diana-foster', 'M-308', 'lease', 'current', '2025-10-31', '2022-11-01'),
  ('mesa', 'diana-foster', 'M-308', 'inspection', 'missing', NULL, NULL),
  ('terrace', 'helen-park', 'T-101', 'lease', 'current', '2025-07-31', '2023-08-01'),
  ('terrace', 'helen-park', 'T-101', 'hud_form', 'current', NULL, '2025-02-15'),
  ('terrace', 'george-williams', 'T-108', 'lease', 'current', '2026-01-31', '2024-02-01'),
  ('terrace', 'betty-huang', 'T-202', 'lease', 'current', '2025-11-30', '2023-12-01'),
  ('terrace', 'betty-huang', 'T-202', 'inspection', 'current', NULL, '2026-02-10')
) AS cd(prop_slug, res_slug, unit, doc_type, status, expires, last_uploaded)
JOIN properties p ON p.slug = cd.prop_slug
JOIN residents r ON r.slug = cd.res_slug;

-- ══════════════════════════════════════════════════════
-- ONBOARDING WORKFLOWS
-- ══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS onboarding_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  property_id UUID NOT NULL REFERENCES properties(id),
  resident_id UUID NOT NULL REFERENCES residents(id),
  type TEXT NOT NULL DEFAULT 'move-in',  -- move-in, move-out
  status TEXT NOT NULL DEFAULT 'not-started',  -- not-started, in-progress, completed
  start_date DATE,
  target_date DATE,
  steps JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE onboarding_workflows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all onboarding_workflows" ON onboarding_workflows FOR ALL USING (true) WITH CHECK (true);

-- Seed onboarding
INSERT INTO onboarding_workflows (code, property_id, resident_id, type, status, start_date, target_date, steps) VALUES
  ('OB-1', (SELECT id FROM properties WHERE slug='wharf'), (SELECT id FROM residents WHERE slug='sarah-johnson'), 'move-in', 'in-progress', '2026-02-15', '2026-03-01',
    '{"appReview":true,"bgCheck":true,"leaseSigning":true,"keyHandoff":false,"unitWalkthrough":false,"utilitySetup":false,"welcomePacket":false}'),
  ('OB-2', (SELECT id FROM properties WHERE slug='wharf'), (SELECT id FROM residents WHERE slug='linda-chen'), 'move-in', 'completed', '2024-01-05', '2024-01-15',
    '{"appReview":true,"bgCheck":true,"leaseSigning":true,"keyHandoff":true,"unitWalkthrough":true,"utilitySetup":true,"welcomePacket":true}'),
  ('OB-3', (SELECT id FROM properties WHERE slug='wharf'), (SELECT id FROM residents WHERE slug='robert-garcia'), 'move-out', 'in-progress', '2026-02-01', '2026-02-28',
    '{"noticeReceived":true,"inspectionScheduled":true,"finalWalkthrough":false,"depositReview":false,"keyReturn":false,"unitTurnover":false}'),
  ('OB-4', (SELECT id FROM properties WHERE slug='wharf'), (SELECT id FROM residents WHERE slug='james-whitfield'), 'move-out', 'not-started', '2026-08-01', '2026-08-31',
    '{"noticeReceived":false,"inspectionScheduled":false,"finalWalkthrough":false,"depositReview":false,"keyReturn":false,"unitTurnover":false}'),
  ('OB-5', (SELECT id FROM properties WHERE slug='mesa'), (SELECT id FROM residents WHERE slug='carlos-rivera'), 'move-in', 'in-progress', '2026-03-01', '2026-03-15',
    '{"appReview":true,"bgCheck":true,"leaseSigning":false,"keyHandoff":false,"unitWalkthrough":false,"utilitySetup":false,"welcomePacket":false}'),
  ('OB-6', (SELECT id FROM properties WHERE slug='terrace'), (SELECT id FROM residents WHERE slug='george-williams'), 'move-in', 'completed', '2024-01-15', '2024-02-01',
    '{"appReview":true,"bgCheck":true,"leaseSigning":true,"keyHandoff":true,"unitWalkthrough":true,"utilitySetup":true,"welcomePacket":true}');
