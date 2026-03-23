-- ══════════════════════════════════════════════════════
-- MAINTENANCE REQUESTS
-- ══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS maintenance_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,  -- e.g. MR-2401
  resident_id UUID REFERENCES residents(id),
  property_id UUID NOT NULL REFERENCES properties(id),
  unit_id UUID REFERENCES units(id),
  category TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'routine',  -- routine, urgent, critical
  status TEXT NOT NULL DEFAULT 'submitted',  -- submitted, in-progress, completed
  description TEXT NOT NULL,
  submitted_date DATE NOT NULL DEFAULT CURRENT_DATE,
  assigned_to TEXT,
  queue_pos INT,
  projected_complete DATE,
  completed_date DATE,
  notes JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE maintenance_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all maintenance_requests" ON maintenance_requests FOR ALL USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════════════════
-- SEED: Maintenance requests matching mock data
-- ══════════════════════════════════════════════════════

INSERT INTO maintenance_requests (code, resident_id, property_id, unit_id, category, priority, status, description, submitted_date, assigned_to, queue_pos, projected_complete, completed_date, notes) VALUES
  ('MR-2401',
    (SELECT id FROM residents WHERE slug='maria-santos'),
    (SELECT id FROM properties WHERE slug='wharf'),
    (SELECT id FROM units WHERE number='B-204'),
    'Plumbing', 'routine', 'in-progress', 'Kitchen faucet dripping constantly', '2026-03-10', 'Mike R.', 2, '2026-03-25', NULL,
    '[{"by":"Mike R.","date":"2026-03-12","text":"Parts ordered, will install Thursday."}]'::jsonb),
  ('MR-2398',
    (SELECT id FROM residents WHERE slug='maria-santos'),
    (SELECT id FROM properties WHERE slug='wharf'),
    (SELECT id FROM units WHERE number='B-204'),
    'HVAC', 'urgent', 'completed', 'Heater not producing warm air', '2026-02-28', 'Mike R.', NULL, NULL, '2026-03-02',
    '[{"by":"Mike R.","date":"2026-03-01","text":"Replaced ignitor. System running normally."}]'::jsonb),
  ('MR-2405',
    (SELECT id FROM residents WHERE slug='james-whitfield'),
    (SELECT id FROM properties WHERE slug='wharf'),
    (SELECT id FROM units WHERE number='A-108'),
    'Electrical', 'critical', 'submitted', 'Sparking outlet in bedroom', '2026-03-18', NULL, 1, NULL, NULL, '[]'::jsonb),
  ('MR-2403',
    (SELECT id FROM residents WHERE slug='linda-chen'),
    (SELECT id FROM properties WHERE slug='wharf'),
    (SELECT id FROM units WHERE number='C-310'),
    'Appliance', 'routine', 'in-progress', 'Dishwasher not draining', '2026-03-14', 'Mike R.', 3, '2026-03-28', NULL, '[]'::jsonb),
  ('MR-2400',
    (SELECT id FROM residents WHERE slug='robert-garcia'),
    (SELECT id FROM properties WHERE slug='wharf'),
    (SELECT id FROM units WHERE number='A-102'),
    'Pest', 'routine', 'submitted', 'Ants in kitchen near window', '2026-03-08', NULL, 4, NULL, NULL, '[]'::jsonb),
  ('MR-2410',
    (SELECT id FROM residents WHERE slug='anna-kowalski'),
    (SELECT id FROM properties WHERE slug='mesa'),
    (SELECT id FROM units WHERE number='M-101'),
    'Plumbing', 'urgent', 'in-progress', 'Bathroom toilet running continuously', '2026-03-15', 'Mike R.', 5, '2026-03-22', NULL, '[]'::jsonb),
  ('MR-2411',
    (SELECT id FROM residents WHERE slug='diana-foster'),
    (SELECT id FROM properties WHERE slug='mesa'),
    (SELECT id FROM units WHERE number='M-308'),
    'Structural', 'routine', 'submitted', 'Cracked window pane in living room', '2026-03-17', NULL, 6, NULL, NULL, '[]'::jsonb),
  ('MR-2412',
    (SELECT id FROM residents WHERE slug='helen-park'),
    (SELECT id FROM properties WHERE slug='terrace'),
    (SELECT id FROM units WHERE number='T-101'),
    'HVAC', 'routine', 'completed', 'Thermostat not responding', '2026-02-20', 'Mike R.', NULL, NULL, '2026-02-25',
    '[{"by":"Mike R.","date":"2026-02-25","text":"Replaced thermostat batteries and recalibrated."}]'::jsonb),
  ('MR-2413',
    (SELECT id FROM residents WHERE slug='betty-huang'),
    (SELECT id FROM properties WHERE slug='terrace'),
    (SELECT id FROM units WHERE number='T-202'),
    'Appliance', 'routine', 'in-progress', 'Refrigerator making loud noise', '2026-03-12', 'Mike R.', 7, '2026-03-26', NULL, '[]'::jsonb);
