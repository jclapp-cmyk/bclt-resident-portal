// Vercel Serverless Function — Warm onboarding email with magic link
// Generates a Supabase magic link via admin API, then sends a custom
// welcome email through Resend. Replaces Supabase's bare default.
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

  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Supabase admin credentials not configured' });
  }
  if (!resendKey) {
    return res.status(500).json({ error: 'RESEND_API_KEY not configured' });
  }

  const { email, displayName, role } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Missing email' });

  try {
    // 1. Generate a magic link via Supabase admin API
    const linkResp = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
      method: 'POST',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'magiclink',
        email,
        options: { redirect_to: portalUrl },
      }),
    });

    if (!linkResp.ok) {
      const err = await linkResp.text();
      console.error('generate_link failed:', err);
      return res.status(500).json({ error: 'Failed to generate magic link', details: err });
    }

    const linkData = await linkResp.json();
    const actionLink = linkData?.action_link || linkData?.properties?.action_link;
    if (!actionLink) {
      console.error('No action_link in response:', linkData);
      return res.status(500).json({ error: 'No action_link returned from Supabase' });
    }

    // 2. Build the warm welcome email and send via Resend
    const firstName = (displayName || '').split(' ')[0] || 'there';
    const isStaff = role === 'admin' || role === 'maintenance' || role === 'property_manager';
    const subject = isStaff
      ? `You're invited to BCLT HomeBase`
      : `Welcome to BCLT HomeBase, ${firstName}! 🏡`;
    const body = isStaff ? buildStaffInvite({ firstName, actionLink, role }) : buildResidentInvite({ firstName, actionLink });

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

// ── Email Builders ──

function buildResidentInvite({ firstName, actionLink }) {
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
    <p style="margin-top:24px;">To get started, just click the button below — you'll be signed in automatically. No password needed.</p>
    <p style="text-align:center;margin:28px 0;">
      <a href="${actionLink}" style="display:inline-block;padding:14px 28px;background:#2E5090;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;">
        Sign in to BCLT HomeBase &rarr;
      </a>
    </p>
    <p style="font-size:13px;color:#666;">If the button doesn't work, paste this link into your browser:<br><a href="${actionLink}" style="color:#2E5090;word-break:break-all;">${actionLink}</a></p>
    <p style="margin-top:24px;">Have questions or run into trouble? Please contact Keith at <a href="mailto:kciampa@bolinaslandtrust.org" style="color:#2E5090;">kciampa@bolinaslandtrust.org</a></p>
    <p style="margin-top:20px;">Warmly,<br><strong>The BCLT Team</strong></p>
  `;
}

function buildStaffInvite({ firstName, actionLink, role }) {
  const roleLabel = role === 'maintenance' ? 'maintenance' : role === 'property_manager' ? 'property management' : 'administrator';
  return `
    <p style="font-size:16px;">Hi ${firstName},</p>
    <p>You've been invited to <strong>BCLT HomeBase</strong>, the Bolinas Community Land Trust's portal for managing properties, residents, and operations.</p>
    <p>You're set up with <strong>${roleLabel}</strong> access. From here you'll be able to:</p>
    <ul style="line-height:1.7;padding-left:20px;">
      ${role === 'maintenance' ? `
        <li>🔧 See and manage work orders assigned to you</li>
        <li>📋 Run inspections and update checklists</li>
        <li>📇 Look up vendors and contact info</li>
        <li>💬 Message residents directly about repairs</li>
      ` : `
        <li>🏢 Manage properties, units, and residents</li>
        <li>🔧 Triage maintenance requests and assign work</li>
        <li>💰 Track rent, payments, and financials</li>
        <li>📋 Handle inspections and income certification</li>
        <li>💬 Communicate with residents and staff</li>
      `}
    </ul>
    <p style="margin-top:24px;">Click the button to sign in. No password needed — just click and you're in.</p>
    <p style="text-align:center;margin:28px 0;">
      <a href="${actionLink}" style="display:inline-block;padding:14px 28px;background:#2E5090;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;">
        Sign in to BCLT HomeBase &rarr;
      </a>
    </p>
    <p style="font-size:13px;color:#666;">If the button doesn't work, paste this link into your browser:<br><a href="${actionLink}" style="color:#2E5090;word-break:break-all;">${actionLink}</a></p>
    <p style="margin-top:24px;">Reach out to Keith at <a href="mailto:kciampa@bolinaslandtrust.org" style="color:#2E5090;">kciampa@bolinaslandtrust.org</a> if you need help getting set up.</p>
    <p style="margin-top:20px;">Welcome aboard,<br><strong>The BCLT Team</strong></p>
  `;
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
