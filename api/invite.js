// Vercel Serverless Function — Welcome/invite email
// Sends a branded welcome email via Resend with a link to the portal login page.
// The recipient signs in with their email (magic link flow) — same as every future visit.
// Env vars required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.Supabase_service_row_key || '').trim();
  const resendKey = (process.env.RESEND_API_KEY || '').trim();
  const fromEmail = process.env.FROM_EMAIL || 'BCLT HomeBase <residentportal@bolinaslandtrust.org>';
  const portalUrl = (process.env.PORTAL_URL || 'https://bclt-resident-portal.vercel.app').trim();

  if (!resendKey) {
    return res.status(500).json({ error: 'RESEND_API_KEY not configured' });
  }

  const { email, displayName, role } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Missing email' });

  try {
    // Ensure the user exists in Supabase Auth so they can sign in
    if (supabaseUrl && serviceKey) {
      try {
        await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
          method: 'POST',
          headers: {
            'apikey': serviceKey,
            'Authorization': `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ type: 'magiclink', email, options: { redirect_to: portalUrl } }),
        });
      } catch (err) {
        console.warn('generate_link call failed (user may already exist):', err.message);
      }
    }

    // Build the welcome email — try database template first, fall back to hardcoded
    const firstName = (displayName || '').split(' ')[0] || 'there';
    const isStaff = role === 'admin' || role === 'maintenance' || role === 'property_manager';
    const templateKey = isStaff ? 'staff_welcome' : 'resident_welcome';
    const roleLabel = role === 'maintenance' ? 'maintenance' : role === 'property_manager' ? 'property management' : 'administrator';
    const signInButton = `<p style="text-align:center;margin:28px 0;"><a href="${portalUrl}" style="display:inline-block;padding:14px 28px;background:#2E5090;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;">Go to BCLT HomeBase &rarr;</a></p>`;

    let subject, body;
    const dbTemplate = (supabaseUrl && serviceKey) ? await fetchTemplate(supabaseUrl, serviceKey, templateKey) : null;
    if (dbTemplate) {
      subject = dbTemplate.subject.replace(/\{\{firstName\}\}/g, firstName).replace(/\{\{roleLabel\}\}/g, roleLabel);
      body = dbTemplate.body_html.replace(/\{\{firstName\}\}/g, firstName).replace(/\{\{signInButton\}\}/g, signInButton).replace(/\{\{roleLabel\}\}/g, roleLabel);
    } else {
      subject = isStaff ? `You're invited to BCLT HomeBase` : `Welcome to BCLT HomeBase, ${firstName}! 🏡`;
      body = isStaff ? buildStaffInvite({ firstName, portalUrl, role }) : buildResidentInvite({ firstName, portalUrl });
    }

    const sendResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        reply_to: 'residentportal@bolinaslandtrust.org',
        to: email,
        subject,
        html: wrapHtml(body),
      }),
    });

    if (!sendResp.ok) {
      const err = await sendResp.text();
      console.error('Resend error:', err);
      return res.status(500).json({ error: 'Email send failed', details: err });
    }

    const result = await sendResp.json();
    return res.status(200).json({ success: true, id: result.id });
  } catch (err) {
    console.error('Invite error:', err);
    return res.status(500).json({ error: err.message });
  }
}

// ── Email Builders (fallback if no DB template) ──

function buildResidentInvite({ firstName, portalUrl }) {
  return `
    <p style="font-size:16px;">Welcome! We're so glad you're part of the BCLT community.</p>
    <p>We've set up <strong>BCLT HomeBase</strong> for you — a simple online portal where you can take care of everything related to your home with us:</p>
    <ul style="line-height:1.7;padding-left:20px;">
      <li>💳 <strong>Pay rent</strong> and see your payment history</li>
      <li>🔧 <strong>Submit maintenance requests</strong> — and follow them through to completion</li>
      <li>📋 <strong>Handle annual paperwork</strong> like income certification, all in one place</li>
      <li>💬 <strong>Message us</strong> anytime — by email, text, or in the portal</li>
      <li>📅 <strong>Stay informed</strong> about inspections, deadlines, and community announcements</li>
    </ul>
    <p style="margin-top:24px;">To get started, click the button below and enter your email address. We'll send you a sign-in link — no password needed.</p>
    <p style="text-align:center;margin:28px 0;">
      <a href="${portalUrl}" style="display:inline-block;padding:14px 28px;background:#2E5090;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;">
        Go to BCLT HomeBase &rarr;
      </a>
    </p>
    <p style="margin-top:24px;">Have questions or run into trouble? Please contact Keith at <a href="mailto:kciampa@bolinaslandtrust.org" style="color:#2E5090;">kciampa@bolinaslandtrust.org</a></p>
    <p style="margin-top:20px;">Warmly,<br><strong>The BCLT Team</strong></p>
  `;
}

function buildStaffInvite({ firstName, portalUrl, role }) {
  const roleLabel = role === 'maintenance' ? 'maintenance' : role === 'property_manager' ? 'property management' : 'administrator';
  return `
    <p style="font-size:16px;">Hi ${firstName},</p>
    <p>You've been invited to <strong>BCLT HomeBase</strong>, the Bolinas Community Land Trust's portal for managing properties, residents, and operations.</p>
    <p>You're set up with <strong>${roleLabel}</strong> access.</p>
    <p style="margin-top:24px;">To get started, click the button below and enter your email address. We'll send you a sign-in link — no password needed.</p>
    <p style="text-align:center;margin:28px 0;">
      <a href="${portalUrl}" style="display:inline-block;padding:14px 28px;background:#2E5090;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;">
        Go to BCLT HomeBase &rarr;
      </a>
    </p>
    <p style="margin-top:24px;">Reach out to Keith at <a href="mailto:kciampa@bolinaslandtrust.org" style="color:#2E5090;">kciampa@bolinaslandtrust.org</a> if you need help getting set up.</p>
    <p style="margin-top:20px;">Welcome aboard,<br><strong>The BCLT Team</strong></p>
  `;
}

// ── Fetch template from Supabase ──

async function fetchTemplate(supabaseUrl, serviceKey, templateKey) {
  try {
    const resp = await fetch(
      `${supabaseUrl}/rest/v1/email_templates?template_key=eq.${templateKey}&select=subject,body_html&limit=1`,
      { headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` } }
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    return data?.[0] || null;
  } catch (err) {
    console.warn('Failed to fetch email template from DB, using hardcoded:', err.message);
    return null;
  }
}

// ── HTML Wrapper ──

function wrapHtml(body) {
  return `
    <!DOCTYPE html>
    <html>
    <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#333;max-width:600px;margin:0 auto;padding:20px;background:#f8f9fa;">
      <div style="background:#fff;padding:32px;border-radius:8px;border:1px solid #e5e7eb;">
        <div style="border-bottom:3px solid #2E5090;padding-bottom:12px;margin-bottom:20px;">
          <h1 style="color:#2E5090;margin:0;font-size:22px;">BCLT HomeBase</h1>
          <p style="color:#888;margin:4px 0 0;font-size:13px;">Bolinas Community Land Trust</p>
        </div>
        ${body}
      </div>
    </body>
    </html>
  `;
}
