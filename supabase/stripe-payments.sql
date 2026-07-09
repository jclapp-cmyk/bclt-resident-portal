-- Add Stripe session tracking to rent_payments
ALTER TABLE rent_payments ADD COLUMN IF NOT EXISTS stripe_session_id TEXT;

-- Index for webhook dedup lookups
CREATE INDEX IF NOT EXISTS idx_rent_payments_stripe_session ON rent_payments (stripe_session_id) WHERE stripe_session_id IS NOT NULL;
