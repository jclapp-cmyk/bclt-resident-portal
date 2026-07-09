-- ══════════════════════════════════════════════════════
-- EMAIL TEMPLATES — editable from admin Settings
-- ══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key TEXT UNIQUE NOT NULL,  -- 'resident_welcome', 'staff_welcome'
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by TEXT DEFAULT 'Admin'
);

ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all email_templates" ON email_templates FOR ALL USING (true) WITH CHECK (true);

-- Seed with current templates
INSERT INTO email_templates (template_key, name, subject, body_html, description) VALUES
(
  'resident_welcome',
  'Resident Welcome Email',
  'Welcome to BCLT HomeBase, {{firstName}}! 🏡',
  '<p style="font-size:16px;">Welcome! We''re so glad you''re part of the BCLT community.</p>
<p>We''ve set up <strong>BCLT HomeBase</strong> for you — a simple online portal where you can take care of everything related to your home with us:</p>
<ul style="line-height:1.7;padding-left:20px;">
  <li>💳 <strong>Pay rent</strong> and see your payment history</li>
  <li>🔧 <strong>Submit maintenance requests</strong> — and follow them through to completion</li>
  <li>📋 <strong>Handle annual paperwork</strong> like income certification, all in one place</li>
  <li>💬 <strong>Message us</strong> anytime — by email, text, or in the portal</li>
  <li>📅 <strong>Stay informed</strong> about inspections, deadlines, and community announcements</li>
</ul>
<p style="margin-top:24px;">To get started, click the button below and enter your email address. We''ll send you a sign-in link — no password needed.</p>
{{signInButton}}
<p style="margin-top:24px;">Have questions or run into trouble? Please contact Keith at <a href="mailto:kciampa@bolinaslandtrust.org" style="color:#2E5090;">kciampa@bolinaslandtrust.org</a></p>
<p style="margin-top:20px;">Warmly,<br><strong>The BCLT Team</strong></p>',
  'Sent when a resident is invited to the portal. Available variables: {{firstName}}, {{signInButton}}'
),
(
  'staff_welcome',
  'Staff Invite Email',
  'You''re invited to BCLT HomeBase',
  '<p style="font-size:16px;">Hi {{firstName}},</p>
<p>You''ve been invited to <strong>BCLT HomeBase</strong>, the Bolinas Community Land Trust''s portal for managing properties, residents, and operations.</p>
<p>You''re set up with <strong>{{roleLabel}}</strong> access.</p>
{{signInButton}}
<p style="margin-top:24px;">Reach out to Keith at <a href="mailto:kciampa@bolinaslandtrust.org" style="color:#2E5090;">kciampa@bolinaslandtrust.org</a> if you need help getting set up.</p>
<p style="margin-top:20px;">Welcome aboard,<br><strong>The BCLT Team</strong></p>',
  'Sent when staff/admin is invited. Available variables: {{firstName}}, {{roleLabel}}, {{signInButton}}'
);
