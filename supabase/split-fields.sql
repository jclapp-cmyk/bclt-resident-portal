-- Split address into components
ALTER TABLE properties ADD COLUMN IF NOT EXISTS street TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS state TEXT DEFAULT 'CA';
ALTER TABLE properties ADD COLUMN IF NOT EXISTS zip TEXT;

-- Migrate existing address data (best effort)
UPDATE properties SET
  street = COALESCE(address, ''),
  city = '',
  state = 'CA',
  zip = ''
WHERE street IS NULL AND address IS NOT NULL;

-- Split resident name into first/last
ALTER TABLE residents ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE residents ADD COLUMN IF NOT EXISTS last_name TEXT;

-- Migrate existing name data
UPDATE residents SET
  first_name = split_part(name, ' ', 1),
  last_name = CASE
    WHEN position(' ' in name) > 0 THEN substring(name from position(' ' in name) + 1)
    ELSE ''
  END
WHERE first_name IS NULL AND name IS NOT NULL;
