-- Stripe Connect — per-property connected accounts
ALTER TABLE properties ADD COLUMN IF NOT EXISTS stripe_account_id TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS stripe_onboarded BOOLEAN DEFAULT false;

-- Add stripe_session_id to rent_payments if not already present
ALTER TABLE rent_payments ADD COLUMN IF NOT EXISTS stripe_session_id TEXT;
CREATE INDEX IF NOT EXISTS idx_rent_payments_stripe_session ON rent_payments (stripe_session_id) WHERE stripe_session_id IS NOT NULL;
