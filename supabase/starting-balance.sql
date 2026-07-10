-- Add starting_balance column to residents for initial ledger setup
ALTER TABLE residents ADD COLUMN IF NOT EXISTS starting_balance NUMERIC(10,2) DEFAULT 0;
