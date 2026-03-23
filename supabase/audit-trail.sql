-- ══════════════════════════════════════════════════════
-- AUDIT TRAIL — tracks all changes across the system
-- ══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id TEXT,           -- the PK or code of the affected record
  action TEXT NOT NULL,     -- INSERT, UPDATE, DELETE
  changed_by UUID,          -- auth.uid() of who made the change
  changed_by_email TEXT,    -- denormalized for easy display
  old_data JSONB,
  new_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Only admins can read the audit log
CREATE POLICY "audit_admin_read" ON audit_log FOR SELECT
  USING ((SELECT role FROM user_profiles WHERE id = auth.uid()) = 'admin');

-- Allow inserts from triggers (they run as SECURITY DEFINER)
CREATE POLICY "audit_insert" ON audit_log FOR INSERT WITH CHECK (true);

-- ══════════════════════════════════════════════════════
-- GENERIC AUDIT TRIGGER FUNCTION
-- ══════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION audit_trigger_fn() RETURNS TRIGGER AS $$
DECLARE
  rec_id TEXT;
  user_email TEXT;
BEGIN
  -- Try to get a human-readable ID
  rec_id := COALESCE(
    NEW.code,  -- maintenance_requests, unit_inspections, etc.
    NEW.slug,  -- residents, properties
    NEW.id::text
  );

  -- Get the email of who made the change
  SELECT email INTO user_email FROM user_profiles WHERE id = auth.uid();

  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (table_name, record_id, action, changed_by, changed_by_email, new_data)
    VALUES (TG_TABLE_NAME, rec_id, 'INSERT', auth.uid(), user_email, to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_log (table_name, record_id, action, changed_by, changed_by_email, old_data, new_data)
    VALUES (TG_TABLE_NAME, rec_id, 'UPDATE', auth.uid(), user_email, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    rec_id := COALESCE(OLD.code, OLD.slug, OLD.id::text);
    INSERT INTO audit_log (table_name, record_id, action, changed_by, changed_by_email, old_data)
    VALUES (TG_TABLE_NAME, rec_id, 'DELETE', auth.uid(), user_email, to_jsonb(OLD));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ══════════════════════════════════════════════════════
-- ATTACH AUDIT TRIGGERS TO KEY TABLES
-- ══════════════════════════════════════════════════════

CREATE TRIGGER audit_residents AFTER INSERT OR UPDATE OR DELETE ON residents
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER audit_leases AFTER INSERT OR UPDATE OR DELETE ON leases
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER audit_maintenance AFTER INSERT OR UPDATE OR DELETE ON maintenance_requests
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER audit_rent_payments AFTER INSERT ON rent_payments
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER audit_vendors AFTER INSERT OR UPDATE OR DELETE ON vendors
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER audit_unit_inspections AFTER INSERT OR UPDATE OR DELETE ON unit_inspections
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER audit_onboarding AFTER INSERT OR UPDATE OR DELETE ON onboarding_workflows
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER audit_user_profiles AFTER INSERT OR UPDATE OR DELETE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();
