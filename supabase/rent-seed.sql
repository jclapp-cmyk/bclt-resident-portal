-- ══════════════════════════════════════════════════════
-- SEED: Rent payments for March 2026
-- Uses subqueries to look up UUIDs from slugs
-- ══════════════════════════════════════════════════════

-- Wharf Road residents
INSERT INTO rent_payments (resident_id, property_id, amount, method, payment_date, month, note) VALUES
  ((SELECT id FROM residents WHERE slug='maria-santos'), (SELECT id FROM properties WHERE slug='wharf'), 485, 'check', '2026-03-01', '2026-03', 'Check #4521'),
  ((SELECT id FROM residents WHERE slug='maria-santos'), (SELECT id FROM properties WHERE slug='wharf'), 665, 'hap', '2026-03-01', '2026-03', 'HAP - PHA'),
  ((SELECT id FROM residents WHERE slug='james-whitfield'), (SELECT id FROM properties WHERE slug='wharf'), 320, 'cash', '2026-03-03', '2026-03', NULL),
  ((SELECT id FROM residents WHERE slug='james-whitfield'), (SELECT id FROM properties WHERE slug='wharf'), 630, 'hap', '2026-03-01', '2026-03', 'HAP - PHA'),
  ((SELECT id FROM residents WHERE slug='linda-chen'), (SELECT id FROM properties WHERE slug='wharf'), 800, 'hap', '2026-03-01', '2026-03', 'HAP - PHA'),
  ((SELECT id FROM residents WHERE slug='robert-garcia'), (SELECT id FROM properties WHERE slug='wharf'), 655, 'hap', '2026-03-01', '2026-03', 'HAP - PHA'),
  ((SELECT id FROM residents WHERE slug='sarah-johnson'), (SELECT id FROM properties WHERE slug='wharf'), 410, 'check', '2026-03-02', '2026-03', 'Check #1189'),
  ((SELECT id FROM residents WHERE slug='sarah-johnson'), (SELECT id FROM properties WHERE slug='wharf'), 740, 'hap', '2026-03-01', '2026-03', 'HAP - PHA');

-- Mesa Road residents
INSERT INTO rent_payments (resident_id, property_id, amount, method, payment_date, month, note) VALUES
  ((SELECT id FROM residents WHERE slug='anna-kowalski'), (SELECT id FROM properties WHERE slug='mesa'), 520, 'cash', '2026-03-01', '2026-03', NULL),
  ((SELECT id FROM residents WHERE slug='anna-kowalski'), (SELECT id FROM properties WHERE slug='mesa'), 730, 'hap', '2026-03-01', '2026-03', 'HAP - PHA'),
  ((SELECT id FROM residents WHERE slug='carlos-rivera'), (SELECT id FROM properties WHERE slug='mesa'), 600, 'money_order', '2026-03-04', '2026-03', 'MO #882741'),
  ((SELECT id FROM residents WHERE slug='carlos-rivera'), (SELECT id FROM properties WHERE slug='mesa'), 850, 'hap', '2026-03-01', '2026-03', 'HAP - PHA'),
  ((SELECT id FROM residents WHERE slug='diana-foster'), (SELECT id FROM properties WHERE slug='mesa'), 820, 'hap', '2026-03-01', '2026-03', 'HAP - PHA');

-- Terrace Lane residents
INSERT INTO rent_payments (resident_id, property_id, amount, method, payment_date, month, note) VALUES
  ((SELECT id FROM residents WHERE slug='helen-park'), (SELECT id FROM properties WHERE slug='terrace'), 280, 'cash', '2026-03-01', '2026-03', NULL),
  ((SELECT id FROM residents WHERE slug='helen-park'), (SELECT id FROM properties WHERE slug='terrace'), 570, 'hap', '2026-03-01', '2026-03', 'HAP - PHA'),
  ((SELECT id FROM residents WHERE slug='george-williams'), (SELECT id FROM properties WHERE slug='terrace'), 310, 'check', '2026-03-05', '2026-03', 'Check #7764'),
  ((SELECT id FROM residents WHERE slug='george-williams'), (SELECT id FROM properties WHERE slug='terrace'), 540, 'hap', '2026-03-01', '2026-03', 'HAP - PHA'),
  ((SELECT id FROM residents WHERE slug='betty-huang'), (SELECT id FROM properties WHERE slug='terrace'), 400, 'cash', '2026-03-02', '2026-03', NULL),
  ((SELECT id FROM residents WHERE slug='betty-huang'), (SELECT id FROM properties WHERE slug='terrace'), 650, 'hap', '2026-03-01', '2026-03', 'HAP - PHA');
