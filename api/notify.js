// Vercel Serverless Function — Email Notifications via Resend
// Env vars required: RESEND_API_KEY

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = (process.env.RESEND_API_KEY || '').trim();
  if (!apiKey) {
    return res.status(500).json({ error: 'RESEND_API_KEY not configured' });
  }

  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.Supabase_service_role_key || '').trim();

  const { type, data } = req.body;
  if (!type || !data) {
    return res.status(400).json({ error: 'Missing type or data' });
  }

  const fromEmail = process.env.FROM_EMAIL || 'BCLT HomeBase <residentportal@bolinaslandtrust.org>';

  // ── maintenance_new: look up staff contacts and send email + SMS to each ──
  if (type === 'maintenance_new') {
    return handleMaintenanceNew(req, res, data, apiKey, fromEmail, supabaseUrl, serviceKey);
  }

  // ── message_new: resident sent a message, notify staff ──
  if (type === 'message_new') {
    return handleMessageNew(req, res, data, apiKey, fromEmail, supabaseUrl, serviceKey);
  }

  let email;
  try {
    switch (type) {
      case 'maintenance_update':
        email = buildMaintenanceEmail(data);
        break;
      case 'payment_receipt':
        email = buildPaymentReceiptEmail(data);
        break;
      case 'rent_reminder':
        email = buildRentReminderEmail(data);
        break;
      case 'inspection_notice':
        email = buildInspectionNoticeEmail(data);
        break;
      case 'custom':
        email = { to: data.to, subject: data.subject || 'BCLT HomeBase Message', body: data.body || '' };
        break;
      default:
        return res.status(400).json({ error: `Unknown notification type: ${type}` });
    }

    // Encode the thread code in the reply-to address via Gmail plus-addressing.
    // Replies go to "residentportal+THR-xxx@bolinaslandtrust.org" which Gmail routes
    // to the base inbox while preserving the +tag in the To: header — the Apps Script
    // reads it back to match the thread. Keeps the visible subject clean.
    const threadCode = data.threadCode;
    const replyTo = threadCode
      ? `residentportal+${threadCode}@bolinaslandtrust.org`
      : 'residentportal@bolinaslandtrust.org';

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        reply_to: replyTo,
        to: email.to,
        subject: email.subject,
        html: wrapHtml(email.body),
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Resend error:', err);
      return res.status(500).json({ error: 'Email send failed', details: err });
    }

    const result = await response.json();
    return res.status(200).json({ success: true, id: result.id });
  } catch (err) {
    console.error('Notification error:', err);
    return res.status(500).json({ error: err.message });
  }
}

// ── HTML Escaping ──
function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Email Builders ──

function buildMaintenanceEmail({ residentEmail, residentName, requestId, description, status, assignedTo, note }) {
  const statusLabels = { submitted: 'Submitted', 'in-progress': 'In Progress', completed: 'Completed' };
  return {
    to: residentEmail,
    subject: `BCLT — Maintenance ${esc(requestId)} ${statusLabels[status] || esc(status)}`,
    body: `
      <h2>Maintenance Request Update</h2>
      <p>Hi ${esc(residentName?.split(' ')[0]) || 'Resident'},</p>
      <p>Your maintenance request <strong>${esc(requestId)}</strong> has been updated:</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr><td style="padding:8px;border:1px solid #ddd;font-weight:600;">Status</td><td style="padding:8px;border:1px solid #ddd;">${statusLabels[status] || esc(status)}</td></tr>
        <tr><td style="padding:8px;border:1px solid #ddd;font-weight:600;">Description</td><td style="padding:8px;border:1px solid #ddd;">${esc(description) || '—'}</td></tr>
        ${assignedTo ? `<tr><td style="padding:8px;border:1px solid #ddd;font-weight:600;">Assigned To</td><td style="padding:8px;border:1px solid #ddd;">${esc(assignedTo)}</td></tr>` : ''}
        ${note ? `<tr><td style="padding:8px;border:1px solid #ddd;font-weight:600;">Note</td><td style="padding:8px;border:1px solid #ddd;">${esc(note)}</td></tr>` : ''}
      </table>
      <p>Log in to your <a href="https://bclt-resident-portal.vercel.app">BCLT HomeBase</a> to view details.</p>
    `,
  };
}

function buildPaymentReceiptEmail({ residentEmail, residentName, amount, method, date, balance }) {
  return {
    to: residentEmail,
    subject: `BCLT — Payment Receipt $${Number(amount).toFixed(2)}`,
    body: `
      <h2>Payment Received</h2>
      <p>Hi ${esc(residentName?.split(' ')[0]) || 'Resident'},</p>
      <p>We've received your payment. Here are the details:</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr><td style="padding:8px;border:1px solid #ddd;font-weight:600;">Amount</td><td style="padding:8px;border:1px solid #ddd;">$${Number(amount).toFixed(2)}</td></tr>
        <tr><td style="padding:8px;border:1px solid #ddd;font-weight:600;">Method</td><td style="padding:8px;border:1px solid #ddd;">${esc(method)}</td></tr>
        <tr><td style="padding:8px;border:1px solid #ddd;font-weight:600;">Date</td><td style="padding:8px;border:1px solid #ddd;">${esc(date)}</td></tr>
        ${balance !== undefined ? `<tr><td style="padding:8px;border:1px solid #ddd;font-weight:600;">Remaining Balance</td><td style="padding:8px;border:1px solid #ddd;">$${Number(balance).toFixed(2)}</td></tr>` : ''}
      </table>
      <p>View your full payment history in your <a href="https://bclt-resident-portal.vercel.app">BCLT HomeBase</a>.</p>
    `,
  };
}

function buildRentReminderEmail({ residentEmail, residentName, amount, dueDate }) {
  return {
    to: residentEmail,
    subject: 'BCLT — Rent Payment Reminder',
    body: `
      <h2>Rent Payment Reminder</h2>
      <p>Hi ${esc(residentName?.split(' ')[0]) || 'Resident'},</p>
      <p>This is a friendly reminder that your rent payment of <strong>$${Number(amount).toFixed(2)}</strong> is due on <strong>${esc(dueDate)}</strong>.</p>
      <p>You can pay online through your <a href="https://bclt-resident-portal.vercel.app">BCLT HomeBase</a>, or contact the office to arrange payment by cash or check.</p>
      <p>If you've already paid, please disregard this notice.</p>
    `,
  };
}

function buildInspectionNoticeEmail({ residentEmail, residentName, inspectionType, date, unit }) {
  return {
    to: residentEmail,
    subject: `BCLT — ${esc(inspectionType)} Inspection Scheduled`,
    body: `
      <h2>Inspection Notice</h2>
      <p>Hi ${esc(residentName?.split(' ')[0]) || 'Resident'},</p>
      <p>A <strong>${esc(inspectionType)}</strong> inspection has been scheduled for your unit <strong>${esc(unit)}</strong> on <strong>${esc(date)}</strong>.</p>
      <p>Please ensure access to all rooms and review the preparation checklist on your <a href="https://bclt-resident-portal.vercel.app">BCLT HomeBase</a>.</p>
      <p>If you need to reschedule, please contact the office at (415) 555-0100.</p>
    `,
  };
}

// ── Shared Helpers ──

// Look up staff members who should receive notifications
async function getStaffRecipients(supabaseUrl, serviceKey, { roles, propertySlug } = {}) {
  const recipients = [];
  const allowedRoles = roles || ['admin', 'manager', 'property_manager', 'maintenance'];

  if (supabaseUrl && serviceKey) {
    try {
      const staffResp = await fetch(
        `${supabaseUrl}/rest/v1/staff_members?active=eq.true&select=name,email,phone,role,notify_email,notify_sms`,
        { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
      );
      const staff = await staffResp.json();
      if (Array.isArray(staff)) {
        for (const s of staff) {
          if (allowedRoles.includes(s.role)) {
            recipients.push({
              email: (s.notify_email !== false) ? s.email : null,
              phone: (s.notify_sms !== false) ? s.phone : null,
              name: s.name,
            });
          }
        }
      }

      // Also check the property's manager_email
      if (propertySlug) {
        const propResp = await fetch(
          `${supabaseUrl}/rest/v1/properties?slug=eq.${encodeURIComponent(propertySlug)}&select=manager_email`,
          { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
        );
        const props = await propResp.json();
        const mgrEmail = props?.[0]?.manager_email;
        if (mgrEmail && !recipients.some(r => r.email === mgrEmail)) {
          recipients.push({ email: mgrEmail, phone: null, name: 'Property Manager' });
        }
      }
    } catch (err) {
      console.warn('Failed to look up staff:', err.message);
    }
  }

  // Fallback to env vars
  if (recipients.length === 0) {
    const fallbackEmail = (process.env.ADMIN_NOTIFY_EMAIL || '').trim();
    const fallbackPhone = (process.env.ADMIN_NOTIFY_PHONE || '').trim();
    if (fallbackEmail || fallbackPhone) {
      recipients.push({ email: fallbackEmail || null, phone: fallbackPhone || null, name: 'Admin' });
    }
  }

  return recipients;
}

// Send emails to a list of recipients
async function sendEmails(recipients, { apiKey, fromEmail, subject, htmlBody }) {
  const results = { sent: [], errors: [] };
  for (const r of recipients.filter(r => r.email)) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: fromEmail, to: r.email, subject, html: wrapHtml(htmlBody) }),
      });
      if (response.ok) {
        const result = await response.json();
        results.sent.push({ to: r.email, id: result.id });
      } else {
        results.errors.push({ type: 'email', to: r.email, error: await response.text() });
      }
    } catch (err) {
      results.errors.push({ type: 'email', to: r.email, error: err.message });
    }
  }
  return results;
}

// Send SMS to a list of recipients
async function sendSmsMessages(recipients, smsBody) {
  const results = { sent: [], errors: [] };
  const twilioSid = (process.env.TWILIO_ACCOUNT_SID || '').trim();
  const twilioToken = (process.env.TWILIO_AUTH_TOKEN || '').trim();
  const twilioMsgSvc = (process.env.TWILIO_MESSAGING_SERVICE_SID || '').trim();
  const twilioFrom = (process.env.TWILIO_PHONE_NUMBER || '').trim();

  if (!twilioSid || !twilioToken) return results;
  if (!twilioMsgSvc && !twilioFrom) {
    console.warn('Twilio: neither TWILIO_MESSAGING_SERVICE_SID nor TWILIO_PHONE_NUMBER is set — skipping SMS');
    return results;
  }

  for (const r of recipients.filter(r => r.phone)) {
    try {
      const phone = r.phone.startsWith('+') ? r.phone : `+1${r.phone.replace(/\D/g, '')}`;
      const params = new URLSearchParams({ To: phone, Body: smsBody });
      if (twilioMsgSvc) params.set('MessagingServiceSid', twilioMsgSvc);
      else params.set('From', twilioFrom);

      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: params.toString(),
        }
      );
      const smsData = await response.json();
      if (response.ok) results.sent.push({ to: phone, sid: smsData.sid });
      else results.errors.push({ type: 'sms', to: phone, error: smsData.message });
    } catch (err) {
      results.errors.push({ type: 'sms', to: r.phone, error: err.message });
    }
  }
  return results;
}

// ── Maintenance New Request Handler ──

async function handleMaintenanceNew(req, res, data, apiKey, fromEmail, supabaseUrl, serviceKey) {
  const { requestId, unit, category, priority, description, propertyName, propertySlug, residentName, source } = data;

  const priorityEmoji = { emergency: '🚨', high: '🔴', medium: '🟡', low: '🟢' }[priority] || '🔧';
  const subject = `${priorityEmoji} New Maintenance Request — ${esc(unit) || 'Unknown Unit'}`;
  const smsBody = `${priorityEmoji} BCLT Maintenance: New ${priority || ''} request for ${unit || 'unit'}${propertyName ? ` at ${propertyName}` : ''} — ${(description || '').slice(0, 100)}${description?.length > 100 ? '…' : ''}. Check HomeBase for details.`;

  const emailBody = `
    <h2>${priorityEmoji} New Maintenance Request</h2>
    <p>A new maintenance request has been submitted${source === 'qr_code' ? ' via QR code' : ''}.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      <tr><td style="padding:8px;border:1px solid #ddd;font-weight:600;">Request ID</td><td style="padding:8px;border:1px solid #ddd;">${esc(requestId) || '—'}</td></tr>
      <tr><td style="padding:8px;border:1px solid #ddd;font-weight:600;">Unit</td><td style="padding:8px;border:1px solid #ddd;">${esc(unit) || '—'}</td></tr>
      ${propertyName ? `<tr><td style="padding:8px;border:1px solid #ddd;font-weight:600;">Property</td><td style="padding:8px;border:1px solid #ddd;">${esc(propertyName)}</td></tr>` : ''}
      <tr><td style="padding:8px;border:1px solid #ddd;font-weight:600;">Category</td><td style="padding:8px;border:1px solid #ddd;">${esc(category) || '—'}</td></tr>
      <tr><td style="padding:8px;border:1px solid #ddd;font-weight:600;">Priority</td><td style="padding:8px;border:1px solid #ddd;">${esc(priority) || 'normal'}</td></tr>
      <tr><td style="padding:8px;border:1px solid #ddd;font-weight:600;">Submitted By</td><td style="padding:8px;border:1px solid #ddd;">${esc(residentName) || 'Resident'}</td></tr>
      <tr><td style="padding:8px;border:1px solid #ddd;font-weight:600;">Description</td><td style="padding:8px;border:1px solid #ddd;">${esc(description) || '—'}</td></tr>
    </table>
    <p><a href="https://bclt-resident-portal.vercel.app" style="display:inline-block;background:#2E5090;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;">Open HomeBase</a></p>
  `;

  const recipients = await getStaffRecipients(supabaseUrl, serviceKey, { propertySlug });
  if (recipients.length === 0) {
    return res.status(200).json({ success: true, warning: 'No recipients found — no notifications sent' });
  }

  const emails = await sendEmails(recipients, { apiKey, fromEmail, subject, htmlBody: emailBody });
  const sms = await sendSmsMessages(recipients, smsBody);

  return res.status(200).json({
    success: true,
    sent: { emails: emails.sent, sms: sms.sent, errors: [...emails.errors, ...sms.errors] },
  });
}

// ── Message New Handler ──

async function handleMessageNew(req, res, data, apiKey, fromEmail, supabaseUrl, serviceKey) {
  const { subject, body, senderName } = data;

  const emailSubject = `💬 New Message from ${esc(senderName) || 'Resident'}: ${esc(subject) || '(no subject)'}`;
  const smsBody = `💬 BCLT: New message from ${senderName || 'Resident'} — "${(subject || body || '').slice(0, 80)}${(subject || body || '').length > 80 ? '…' : ''}". Check HomeBase.`;

  const emailBody = `
    <h2>💬 New Message</h2>
    <p><strong>${esc(senderName) || 'A resident'}</strong> sent a message in HomeBase.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      <tr><td style="padding:8px;border:1px solid #ddd;font-weight:600;">Subject</td><td style="padding:8px;border:1px solid #ddd;">${esc(subject) || '—'}</td></tr>
      <tr><td style="padding:8px;border:1px solid #ddd;font-weight:600;">From</td><td style="padding:8px;border:1px solid #ddd;">${esc(senderName) || 'Resident'}</td></tr>
      ${body ? `<tr><td style="padding:8px;border:1px solid #ddd;font-weight:600;">Message</td><td style="padding:8px;border:1px solid #ddd;">${esc(body.length > 500 ? body.slice(0, 500) + '…' : body)}</td></tr>` : ''}
    </table>
    <p><a href="https://bclt-resident-portal.vercel.app/#/communications" style="display:inline-block;background:#2E5090;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;">Open HomeBase</a></p>
  `;

  const recipients = await getStaffRecipients(supabaseUrl, serviceKey, { roles: ['admin', 'property_manager', 'manager'] });
  if (recipients.length === 0) {
    return res.status(200).json({ success: true, warning: 'No recipients found' });
  }

  const emails = await sendEmails(recipients, { apiKey, fromEmail, subject: emailSubject, htmlBody: emailBody });
  const sms = await sendSmsMessages(recipients, smsBody);

  return res.status(200).json({
    success: true,
    sent: { emails: emails.sent, sms: sms.sent, errors: [...emails.errors, ...sms.errors] },
  });
}

// ── HTML Wrapper ──

function wrapHtml(body) {
  return `
    <!DOCTYPE html>
    <html>
    <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#333;max-width:600px;margin:0 auto;padding:20px;">
      <div style="border-bottom:3px solid #2E5090;padding-bottom:12px;margin-bottom:20px;">
        <h1 style="color:#2E5090;margin:0;font-size:20px;">BCLT HomeBase</h1>
        <p style="color:#888;margin:4px 0 0;font-size:13px;">Bolinas Community Land Trust</p>
      </div>
      ${body}
      <div style="border-top:1px solid #ddd;margin-top:24px;padding-top:12px;font-size:11px;color:#999;">
        <p>This is an automated message from the BCLT HomeBase. Please do not reply to this email.</p>
        <p>Bolinas Community Land Trust · 123 Wharf Rd, Bolinas, CA 94924 · (415) 555-0100</p>
      </div>
    </body>
    </html>
  `;
}
