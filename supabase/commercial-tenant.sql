-- Add business_name to residents for commercial tenants
ALTER TABLE residents ADD COLUMN IF NOT EXISTS business_name TEXT;

-- Allow 0 bedrooms on units (for commercial spaces)
ALTER TABLE units ALTER COLUMN bedrooms SET DEFAULT 0;
ALTER TABLE units ALTER COLUMN bedrooms DROP NOT NULL;
