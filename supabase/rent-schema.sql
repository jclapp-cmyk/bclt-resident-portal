-- ══════════════════════════════════════════════════════
-- RENT PAYMENTS — tracks individual cash/check/HAP payments
-- ══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS rent_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resident_id UUID NOT NULL REFERENCES residents(id),
  property_id UUID NOT NULL REFERENCES properties(id),
  amount NUMERIC(10,2) NOT NULL,
  method TEXT NOT NULL DEFAULT 'cash',  -- cash, check, money_order, hap, ach
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  month TEXT NOT NULL,  -- YYYY-MM format, which billing month this applies to
  note TEXT,
  recorded_by TEXT DEFAULT 'Admin',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE rent_payments ENABLE ROW LEVEL SECURITY;
-- Allow all access for now (tighten later with role-based policies)
CREATE POLICY "Allow all rent_payments" ON rent_payments FOR ALL USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════════════════
-- RENT LEDGER VIEW — computed per-resident-per-month summary
-- Aggregates payments against lease amounts
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
  pay.month
FROM residents r
JOIN units u ON r.unit_id = u.id
JOIN properties p ON r.property_id = p.id
JOIN leases l ON l.resident_id = r.id AND l.status = 'active'
LEFT JOIN (
  SELECT
    resident_id,
    month,
    SUM(CASE WHEN method != 'hap' THEN amount ELSE 0 END) AS total_tenant,
    SUM(CASE WHEN method = 'hap' THEN amount ELSE 0 END) AS total_hap
  FROM rent_payments
  GROUP BY resident_id, month
) pay ON pay.resident_id = r.id
WHERE r.status = 'active';
