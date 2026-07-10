-- ══════════════════════════════════════════════════════
-- RENT LEDGER VIEW v2 — generates a row for every month
-- from lease start to current month, so missed months
-- automatically appear as outstanding.
-- ══════════════════════════════════════════════════════

CREATE OR REPLACE VIEW rent_ledger AS
SELECT
  r.id AS resident_uuid,
  r.slug AS resident_id,
  r.name,
  u.number AS unit,
  p.slug AS property_id,
  p.id AS property_uuid,
  l.rent_amount AS rent_due,
  l.tenant_portion,
  l.hap_payment,
  COALESCE(pay.total_tenant, 0) AS tenant_paid,
  COALESCE(pay.total_hap, 0) AS hap_received,
  GREATEST(0, l.rent_amount - COALESCE(pay.total_tenant, 0) - COALESCE(pay.total_hap, 0)) AS balance,
  CASE
    WHEN COALESCE(pay.total_tenant, 0) + COALESCE(pay.total_hap, 0) >= l.rent_amount THEN 'paid'
    WHEN COALESCE(pay.total_tenant, 0) + COALESCE(pay.total_hap, 0) > 0 THEN 'partial'
    ELSE 'outstanding'
  END AS status,
  months.month
FROM residents r
JOIN units u ON r.unit_id = u.id
JOIN properties p ON r.property_id = p.id
JOIN leases l ON l.resident_id = r.id AND l.status = 'active'
CROSS JOIN LATERAL (
  SELECT TO_CHAR(g, 'YYYY-MM') AS month
  FROM generate_series(
    GREATEST(DATE_TRUNC('month', l.start_date), DATE_TRUNC('month', CURRENT_DATE)),
    DATE_TRUNC('month', CURRENT_DATE),
    '1 month'::interval
  ) g
) months
LEFT JOIN (
  SELECT
    resident_id,
    month,
    SUM(CASE WHEN method != 'hap' THEN amount ELSE 0 END) AS total_tenant,
    SUM(CASE WHEN method = 'hap' THEN amount ELSE 0 END) AS total_hap
  FROM rent_payments
  GROUP BY resident_id, month
) pay ON pay.resident_id = r.id AND pay.month = months.month
WHERE r.status = 'active';
