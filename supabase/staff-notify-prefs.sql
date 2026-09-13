-- Add notification preference columns to staff_members
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS notify_email BOOLEAN DEFAULT true;
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS notify_sms BOOLEAN DEFAULT true;
