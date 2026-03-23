-- ══════════════════════════════════════════════════════
-- MESSAGE THREADS
-- ══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS message_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  participants JSONB DEFAULT '[]'::jsonb,  -- array of resident slugs, or ["all"] for broadcast
  subject TEXT NOT NULL,
  last_message TEXT,
  last_date TIMESTAMPTZ,
  unread INT DEFAULT 0,
  channel TEXT DEFAULT 'email',  -- sms, email, phone, multi
  type TEXT DEFAULT 'direct',    -- direct, broadcast
  priority TEXT,                 -- null or "high"
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE message_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all message_threads" ON message_threads FOR ALL USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════════════════
-- MESSAGES
-- ══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  thread_id UUID NOT NULL REFERENCES message_threads(id),
  sender TEXT NOT NULL,  -- "admin" or resident slug
  body TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT DEFAULT 'delivered',  -- delivered, read
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all messages" ON messages FOR ALL USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════════════════
-- COMMUNICATION TEMPLATES
-- ══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS comm_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  channel TEXT DEFAULT 'sms',
  subject TEXT,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE comm_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all comm_templates" ON comm_templates FOR ALL USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════════════════
-- SEED DATA
-- ══════════════════════════════════════════════════════

-- Threads
INSERT INTO message_threads (code, participants, subject, last_message, last_date, unread, channel, type, priority) VALUES
  ('THR-001', '["maria-santos"]', 'Maintenance Request MR-2401', 'We have a master key, so no need. We''ll send a text when Mike is on his way.', '2026-03-12T15:00:00', 0, 'sms', 'direct', NULL),
  ('THR-002', '["all"]', 'Annual HQS Inspections Scheduled', 'Units A-building will be inspected March 25-27. Please ensure access to all rooms.', '2026-03-15T08:00:00', 0, 'multi', 'broadcast', 'high'),
  ('THR-003', '["james-whitfield"]', 'Lease Renewal — Unit A-108', 'I have a question about the new terms. Can the utility allowance be adjusted?', '2026-03-14T11:00:00', 1, 'email', 'direct', NULL),
  ('THR-004', '["all"]', 'Community BBQ — April 12th', 'Join us for a spring community BBQ at the courtyard from 12-3pm.', '2026-03-10T09:00:00', 0, 'multi', 'broadcast', NULL),
  ('THR-005', '["linda-chen"]', 'Recertification Documents Needed', 'I''ll upload them by Friday. Sorry for the delay!', '2026-03-11T16:45:00', 0, 'sms', 'direct', NULL),
  ('THR-006', '["all"]', 'Parking Lot Resurfacing', 'Lot B will be closed March 22-24 for resurfacing. Please use Lot A.', '2026-03-05T08:00:00', 0, 'multi', 'broadcast', NULL);

-- Messages
INSERT INTO messages (code, thread_id, sender, body, sent_at, status) VALUES
  ('MSG-001', (SELECT id FROM message_threads WHERE code='THR-001'), 'admin', 'Hi Maria, your maintenance request MR-2401 for the kitchen faucet has been assigned to Mike R. Parts have been ordered and he''ll install them Thursday.', '2026-03-12T10:15:00', 'delivered'),
  ('MSG-002', (SELECT id FROM message_threads WHERE code='THR-001'), 'maria-santos', 'Thank you! Thursday works for me. Should I leave a key or will someone be there to let him in?', '2026-03-12T14:30:00', 'read'),
  ('MSG-003', (SELECT id FROM message_threads WHERE code='THR-001'), 'admin', 'We have a master key, so no need. We''ll send a text when Mike is on his way. Thanks!', '2026-03-12T15:00:00', 'delivered'),
  ('MSG-004', (SELECT id FROM message_threads WHERE code='THR-002'), 'admin', 'Units A-building will be inspected March 25-27. Please ensure access to all rooms. A preparation checklist has been posted to your portal.', '2026-03-15T08:00:00', 'delivered'),
  ('MSG-005', (SELECT id FROM message_threads WHERE code='THR-003'), 'admin', 'Hi James, your lease renewal for Unit A-108 is ready for review. Please check the portal for the updated terms and let us know if you have questions.', '2026-03-13T09:00:00', 'delivered'),
  ('MSG-006', (SELECT id FROM message_threads WHERE code='THR-003'), 'james-whitfield', 'I have a question about the new terms. Can the utility allowance be adjusted? My electric bill has gone up significantly.', '2026-03-14T11:00:00', 'read'),
  ('MSG-007', (SELECT id FROM message_threads WHERE code='THR-004'), 'admin', 'Join us for a spring community BBQ at the courtyard from 12-3pm. Food and drinks provided. Hope to see you there!', '2026-03-10T09:00:00', 'delivered'),
  ('MSG-008', (SELECT id FROM message_threads WHERE code='THR-005'), 'admin', 'Hi Linda, we still need your updated pay stubs for recertification. Can you upload them to the portal by end of week?', '2026-03-11T10:00:00', 'delivered'),
  ('MSG-009', (SELECT id FROM message_threads WHERE code='THR-005'), 'linda-chen', 'I''ll upload them by Friday. Sorry for the delay!', '2026-03-11T16:45:00', 'read'),
  ('MSG-010', (SELECT id FROM message_threads WHERE code='THR-006'), 'admin', 'Lot B will be closed March 22-24 for resurfacing. Please use Lot A during this time. Thank you for your patience.', '2026-03-05T08:00:00', 'delivered');

-- Templates
INSERT INTO comm_templates (code, name, channel, subject, body) VALUES
  ('TPL-1', 'Rent Reminder', 'sms', NULL, 'BCLT: Reminder — your rent payment is due on the 1st. Pay online at your portal or contact the office.'),
  ('TPL-2', 'Maintenance Update', 'sms', NULL, 'BCLT: Your maintenance request has been updated. Check your portal for details.'),
  ('TPL-3', 'Recertification Nudge', 'email', 'Action Required: Annual Recertification', 'Dear resident, your annual recertification deadline is approaching. Please complete all steps in your portal as soon as possible.'),
  ('TPL-4', 'Inspection Notice', 'multi', 'Upcoming Inspection Notice', 'Your unit is scheduled for an upcoming inspection. Please ensure access to all rooms and review the preparation checklist on your portal.'),
  ('TPL-5', 'Emergency Alert', 'sms', NULL, 'BCLT ALERT: This is an urgent notice. Please contact the office at (415) 555-0100 for details.');
