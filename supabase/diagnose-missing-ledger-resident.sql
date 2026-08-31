-- ══════════════════════════════════════════════════════
-- DIAGNOSTIC — why does a resident not appear in rent_ledger?
-- Run in the Supabase SQL editor. Read-only; changes nothing.
--
-- Returns COUNTS AND VERDICT STRINGS ONLY. No names, no rent
-- amounts, no dates, no slugs. Output is safe to share.
--
-- rent_ledger requires ALL of the following to hold:
--   r.status   = 'active'
--   r.unit_id  -> a real units row
--   r.property_id -> a real properties row
--   a leases row with resident_id = r.id AND status = 'active'
-- Any one failing drops the resident from the view entirely.
-- ══════════════════════════════════════════════════════

-- 1. Which join condition is failing, and for how many residents.
--    Expect one row naming the fault with count 1, plus
--    'all conditions pass' with the rest.
SELECT
  CASE
    WHEN NOT ok_resident_active THEN 'FAIL: residents.status is not active'
    WHEN NOT ok_unit            THEN 'FAIL: residents.unit_id is null or does not match a units row'
    WHEN NOT ok_property        THEN 'FAIL: residents.property_id is null or does not match a properties row'
    WHEN NOT ok_active_lease    THEN 'FAIL: no leases row with status exactly ''active'''
    ELSE 'all conditions pass'
  END AS verdict,
  count(*) AS residents
FROM (
  SELECT
    (r.status = 'active')                            AS ok_resident_active,
    (r.unit_id IS NOT NULL AND u.id IS NOT NULL)     AS ok_unit,
    (r.property_id IS NOT NULL AND p.id IS NOT NULL) AS ok_property,
    (l.id IS NOT NULL)                               AS ok_active_lease
  FROM residents r
  LEFT JOIN units u      ON u.id = r.unit_id
  LEFT JOIN properties p ON p.id = r.property_id
  LEFT JOIN leases l     ON l.resident_id = r.id AND l.status = 'active'
) t
GROUP BY 1
ORDER BY 1;

-- 2. Distinct lease status literals in use, delimited so trailing
--    whitespace and wrong case are visible. Status values only.
SELECT
  '[' || status || ']' AS status_literal,
  length(status)       AS len,
  count(*)             AS leases
FROM leases
GROUP BY 1, 2
ORDER BY leases DESC;

-- 3. Same as 1, narrowed to the 10 Park Ave resident. Confirms the
--    fault above is the one keeping that resident out of the ledger.
SELECT
  CASE
    WHEN NOT ok_resident_active THEN 'FAIL: residents.status is not active'
    WHEN NOT ok_unit            THEN 'FAIL: residents.unit_id is null or does not match a units row'
    WHEN NOT ok_active_lease AND lease_rows = 0 THEN 'FAIL: resident has no leases row at all'
    WHEN NOT ok_active_lease    THEN 'FAIL: resident has leases, but none with status exactly ''active'''
    ELSE 'all conditions pass'
  END AS verdict,
  count(*) AS residents
FROM (
  SELECT
    (r.status = 'active')                        AS ok_resident_active,
    (r.unit_id IS NOT NULL AND u.id IS NOT NULL) AS ok_unit,
    (l.id IS NOT NULL)                           AS ok_active_lease,
    (SELECT count(*) FROM leases WHERE resident_id = r.id) AS lease_rows
  FROM residents r
  JOIN properties p      ON p.id = r.property_id
  LEFT JOIN units u      ON u.id = r.unit_id
  LEFT JOIN leases l     ON l.resident_id = r.id AND l.status = 'active'
  WHERE p.slug = '10-park-ave-wcig'
) t
GROUP BY 1
ORDER BY 1;
