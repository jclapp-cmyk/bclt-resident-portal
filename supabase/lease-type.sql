-- Add lease_type column to leases table
ALTER TABLE leases ADD COLUMN IF NOT EXISTS lease_type TEXT DEFAULT 'fixed' CHECK (lease_type IN ('fixed', 'month-to-month'));
