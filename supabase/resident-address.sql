-- Add mailing address fields to residents
ALTER TABLE residents ADD COLUMN IF NOT EXISTS mailing_street TEXT;
ALTER TABLE residents ADD COLUMN IF NOT EXISTS mailing_city TEXT;
ALTER TABLE residents ADD COLUMN IF NOT EXISTS mailing_state TEXT DEFAULT 'CA';
ALTER TABLE residents ADD COLUMN IF NOT EXISTS mailing_zip TEXT;
