-- ══════════════════════════════════════════════════════
-- TENANT DEPOSITS — security deposits, pet deposits, etc.
-- ══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tenant_deposits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resident_id UUID NOT NULL REFERENCES residents(id),
  property_id UUID NOT NULL REFERENCES properties(id),
  deposit_type TEXT NOT NULL DEFAULT 'security',  -- security, pet, key, other
  amount NUMERIC(10,2) NOT NULL,
  date_collected DATE NOT NULL DEFAULT CURRENT_DATE,
  method TEXT DEFAULT 'check',  -- cash, check, money_order, ach
  status TEXT NOT NULL DEFAULT 'held',  -- held, partially_refunded, refunded, applied
  refund_amount NUMERIC(10,2) DEFAULT 0,
  refund_date DATE,
  deductions JSONB DEFAULT '[]',  -- [{description, amount}]
  note TEXT,
  recorded_by TEXT DEFAULT 'Admin',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE tenant_deposits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all tenant_deposits" ON tenant_deposits FOR ALL USING (true) WITH CHECK (true);
