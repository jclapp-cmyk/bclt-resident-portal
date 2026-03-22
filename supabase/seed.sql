-- BCLT Resident Portal — Seed Data
-- Run this AFTER schema.sql in Supabase SQL Editor

-- ── Properties ──
insert into properties (slug, name, address, type, year_built, last_renovation, total_units, unit_breakdown, total_sf, common_area_sf, lot_size, ada_units, manager, manager_phone, manager_email, office_hours, documents) values
('wharf', 'Wharf Road Apartments', '123 Wharf Rd, Bolinas, CA 94924', 'Garden-Style Apartments', 1978, 2019, 42,
 '{"1BR": 12, "2BR": 18, "3BR": 10, "4BR": 2}', 38400, 4200, '2.8 acres', 4,
 'Sarah Chen', '(415) 555-0100', 'sarah@bclt.org', 'Mon-Fri 9am-5pm',
 '[{"name":"Site Plan","type":"site-plan","uploaded":"2024-08-15"},{"name":"Plot Map (Plat Survey)","type":"plot-map","uploaded":"2023-03-10"},{"name":"1BR Floor Plan","type":"floor-plan","uploaded":"2024-08-15"},{"name":"2BR Floor Plan","type":"floor-plan","uploaded":"2024-08-15"},{"name":"3BR Floor Plan","type":"floor-plan","uploaded":"2024-08-15"},{"name":"Utility Infrastructure Map","type":"utility-map","uploaded":"2024-01-20"},{"name":"Emergency Evacuation Routes","type":"evacuation","uploaded":"2024-06-01"}]'),
('mesa', 'Mesa Road Townhomes', '456 Mesa Rd, Bolinas, CA 94924', 'Townhomes', 1992, 2022, 18,
 '{"2BR": 8, "3BR": 10}', 22000, 1800, '1.5 acres', 2,
 'David Park', '(415) 555-0200', 'david@bclt.org', 'Mon-Fri 9am-5pm',
 '[{"name":"Site Plan","type":"site-plan","uploaded":"2023-05-10"},{"name":"Plot Map","type":"plot-map","uploaded":"2022-11-01"}]'),
('terrace', 'Terrace Lane Senior Living', '789 Terrace Ln, Bolinas, CA 94924', 'Senior Housing', 2005, null, 24,
 '{"1BR": 16, "2BR": 8}', 18000, 3000, '1.2 acres', 6,
 'Lisa Tran', '(415) 555-0300', 'lisa@bclt.org', 'Mon-Fri 8am-4pm',
 '[{"name":"Site Plan","type":"site-plan","uploaded":"2024-02-20"},{"name":"ADA Compliance Report","type":"compliance","uploaded":"2024-09-15"}]');

-- ── Units ──
insert into units (property_id, number, bedrooms, bathrooms, sqft, floor_plan, utility_responsibility, appliances, last_inspection) values
((select id from properties where slug='wharf'), 'B-204', 2, 1, 885, '2BR Type A',
 '{"electric":"Tenant","gas":"Tenant","water":"Owner","trash":"Owner","internet":"Tenant"}',
 '[{"name":"Refrigerator","make":"GE","model":"GTS18","age":"3 yrs","warranty":"Active"},{"name":"Stove/Oven","make":"Whirlpool","model":"WFG320","age":"3 yrs","warranty":"Active"},{"name":"HVAC","make":"Carrier","model":"24ACC636","age":"5 yrs","warranty":"Expired"},{"name":"Water Heater","make":"Rheem","model":"PROE50","age":"2 yrs","warranty":"Active"}]',
 '{"date":"2025-11-14","type":"HQS","result":"Pass"}'),
((select id from properties where slug='wharf'), 'A-108', 1, 1, null, null, '{}', '[]', null),
((select id from properties where slug='wharf'), 'C-310', 3, 1, null, null, '{}', '[]', null),
((select id from properties where slug='wharf'), 'A-102', 1, 1, null, null, '{}', '[]', null),
((select id from properties where slug='wharf'), 'B-108', 2, 1, null, null, '{}', '[]', null),
((select id from properties where slug='mesa'),  'M-101', 2, 1, null, null, '{}', '[]', null),
((select id from properties where slug='mesa'),  'M-205', 3, 1, null, null, '{}', '[]', null),
((select id from properties where slug='mesa'),  'M-308', 3, 1, null, null, '{}', '[]', null),
((select id from properties where slug='terrace'), 'T-101', 1, 1, null, null, '{}', '[]', null),
((select id from properties where slug='terrace'), 'T-108', 1, 1, null, null, '{}', '[]', null),
((select id from properties where slug='terrace'), 'T-202', 2, 1, null, null, '{}', '[]', null);

-- ── Residents ──
insert into residents (slug, property_id, unit_id, name, phone, email, preferred_channel, status, move_in_date) values
('maria-santos',    (select id from properties where slug='wharf'), (select id from units where number='B-204' and property_id=(select id from properties where slug='wharf')), 'Maria Santos', '(415) 555-0101', 'maria.santos@email.com', 'sms', 'active', '2023-06-01'),
('james-whitfield', (select id from properties where slug='wharf'), (select id from units where number='A-108' and property_id=(select id from properties where slug='wharf')), 'James Whitfield', '(415) 555-0202', 'james.w@email.com', 'email', 'active', '2022-09-01'),
('linda-chen',      (select id from properties where slug='wharf'), (select id from units where number='C-310' and property_id=(select id from properties where slug='wharf')), 'Linda Chen', '(415) 555-0303', 'linda.chen@email.com', 'sms', 'active', '2024-01-15'),
('robert-garcia',   (select id from properties where slug='wharf'), (select id from units where number='A-102' and property_id=(select id from properties where slug='wharf')), 'Robert Garcia', '(415) 555-0404', 'r.garcia@email.com', 'phone', 'active', '2021-03-01'),
('sarah-johnson',   (select id from properties where slug='wharf'), (select id from units where number='B-108' and property_id=(select id from properties where slug='wharf')), 'Sarah Johnson', '(415) 555-0505', 's.johnson@email.com', 'email', 'active', '2024-07-01'),
('anna-kowalski',   (select id from properties where slug='mesa'),  (select id from units where number='M-101' and property_id=(select id from properties where slug='mesa')),  'Anna Kowalski', '(415) 555-0601', 'anna.k@email.com', 'email', 'active', '2023-03-01'),
('carlos-rivera',   (select id from properties where slug='mesa'),  (select id from units where number='M-205' and property_id=(select id from properties where slug='mesa')),  'Carlos Rivera', '(415) 555-0602', 'carlos.r@email.com', 'sms', 'active', '2024-06-01'),
('diana-foster',    (select id from properties where slug='mesa'),  (select id from units where number='M-308' and property_id=(select id from properties where slug='mesa')),  'Diana Foster', '(415) 555-0603', 'diana.f@email.com', 'email', 'active', '2022-11-01'),
('helen-park',      (select id from properties where slug='terrace'), (select id from units where number='T-101' and property_id=(select id from properties where slug='terrace')), 'Helen Park', '(415) 555-0701', 'helen.p@email.com', 'phone', 'active', '2023-08-01'),
('george-williams', (select id from properties where slug='terrace'), (select id from units where number='T-108' and property_id=(select id from properties where slug='terrace')), 'George Williams', '(415) 555-0702', 'george.w@email.com', 'email', 'active', '2024-02-01'),
('betty-huang',     (select id from properties where slug='terrace'), (select id from units where number='T-202' and property_id=(select id from properties where slug='terrace')), 'Betty Huang', '(415) 555-0703', 'betty.h@email.com', 'sms', 'active', '2023-12-01');

-- ── Leases ──
insert into leases (resident_id, unit_id, start_date, end_date, rent_amount, tenant_portion, hap_payment, status)
select r.id, r.unit_id, v.start_date, v.end_date, v.rent, v.tenant, v.hap, 'active'
from (values
  ('maria-santos',    '2023-06-01'::date, '2024-05-31'::date, 1150.00, 485.00, 665.00),
  ('james-whitfield', '2022-09-01'::date, '2025-08-31'::date, 950.00,  320.00, 630.00),
  ('linda-chen',      '2024-01-15'::date, '2025-01-14'::date, 1350.00, 550.00, 800.00),
  ('robert-garcia',   '2021-03-01'::date, '2026-02-28'::date, 950.00,  295.00, 655.00),
  ('sarah-johnson',   '2024-07-01'::date, '2025-06-30'::date, 1150.00, 410.00, 740.00),
  ('anna-kowalski',   '2023-03-01'::date, '2025-02-28'::date, 1250.00, 520.00, 730.00),
  ('carlos-rivera',   '2024-06-01'::date, '2025-05-31'::date, 1450.00, 600.00, 850.00),
  ('diana-foster',    '2022-11-01'::date, '2025-10-31'::date, 1400.00, 580.00, 820.00),
  ('helen-park',      '2023-08-01'::date, '2025-07-31'::date, 850.00,  280.00, 570.00),
  ('george-williams', '2024-02-01'::date, '2026-01-31'::date, 850.00,  310.00, 540.00),
  ('betty-huang',     '2023-12-01'::date, '2025-11-30'::date, 1050.00, 400.00, 650.00)
) as v(slug, start_date, end_date, rent, tenant, hap)
join residents r on r.slug = v.slug;

-- ── Lease Documents ──
insert into lease_documents (resident_id, name, type, size, uploaded_at, uploaded_by)
select r.id, v.name, v.type, v.size, v.uploaded_at, 'Admin'
from (values
  ('maria-santos',    'Lease_Agreement_2023.pdf',     'lease',      512000, '2023-06-01T10:00:00Z'::timestamptz),
  ('maria-santos',    'Lease_Renewal_2024.pdf',       'renewal',    245000, '2024-05-15T14:00:00Z'::timestamptz),
  ('maria-santos',    'HQS_Inspection_Nov2025.pdf',   'inspection', 180000, '2025-11-14T16:00:00Z'::timestamptz),
  ('james-whitfield', 'Lease_Agreement_2022.pdf',     'lease',      498000, '2022-09-01T10:00:00Z'::timestamptz),
  ('james-whitfield', 'HUD_50058_2025.pdf',           'hud_form',   320000, '2025-06-20T11:00:00Z'::timestamptz),
  ('linda-chen',      'Lease_Agreement_2024.pdf',     'lease',      510000, '2024-01-15T10:00:00Z'::timestamptz),
  ('robert-garcia',   'Lease_Agreement_2021.pdf',     'lease',      475000, '2021-03-01T10:00:00Z'::timestamptz),
  ('robert-garcia',   'Utility_Allowance_2025.pdf',   'utility',    95000,  '2025-01-15T10:00:00Z'::timestamptz),
  ('sarah-johnson',   'Lease_Agreement_2024.pdf',     'lease',      530000, '2024-07-01T10:00:00Z'::timestamptz)
) as v(slug, name, type, size, uploaded_at)
join residents r on r.slug = v.slug;
