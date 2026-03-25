// Vercel Serverless Function — Email Notifications via Resend
// Env var required: RESEND_API_KEY

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'RESEND_API_KEY not configured' });
  }

  const { type, data } = req.body;
  if (!type || !data) {
    return res.status(400).json({ error: 'Missing type or data' });
  }

  // Use verified Resend domain, or fallback to Resend's shared domain
  const fromEmail = process.env.FROM_EMAIL || 'BCLT Portal <onboarding@resend.dev>';

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
        email = { to: data.to, subject: data.subject || 'BCLT Portal Message', body: data.body || '' };
        break;
      default:
        return res.status(400).json({ error: `Unknown notification type: ${type}` });
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
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

// ── Email Builders ──

function buildMaintenanceEmail({ residentEmail, residentName, requestId, description, status, assignedTo, note }) {
  const statusLabels = { submitted: 'Submitted', 'in-progress': 'In Progress', completed: 'Completed' };
  return {
    to: residentEmail,
    subject: `BCLT — Maintenance ${requestId} ${statusLabels[status] || status}`,
    body: `
      <h2>Maintenance Request Update</h2>
      <p>Hi ${residentName?.split(' ')[0] || 'Resident'},</p>
      <p>Your maintenance request <strong>${requestId}</strong> has been updated:</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr><td style="padding:8px;border:1px solid #ddd;font-weight:600;">Status</td><td style="padding:8px;border:1px solid #ddd;">${statusLabels[status] || status}</td></tr>
        <tr><td style="padding:8px;border:1px solid #ddd;font-weight:600;">Description</td><td style="padding:8px;border:1px solid #ddd;">${description || '—'}</td></tr>
        ${assignedTo ? `<tr><td style="padding:8px;border:1px solid #ddd;font-weight:600;">Assigned To</td><td style="padding:8px;border:1px solid #ddd;">${assignedTo}</td></tr>` : ''}
        ${note ? `<tr><td style="padding:8px;border:1px solid #ddd;font-weight:600;">Note</td><td style="padding:8px;border:1px solid #ddd;">${note}</td></tr>` : ''}
      </table>
      <p>Log in to your <a href="https://bclt-resident-portal.vercel.app">BCLT Portal</a> to view details.</p>
    `,
  };
}

function buildPaymentReceiptEmail({ residentEmail, residentName, amount, method, date, balance }) {
  return {
    to: residentEmail,
    subject: `BCLT — Payment Receipt $${Number(amount).toFixed(2)}`,
    body: `
      <h2>Payment Received</h2>
      <p>Hi ${residentName?.split(' ')[0] || 'Resident'},</p>
      <p>We've received your payment. Here are the details:</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr><td style="padding:8px;border:1px solid #ddd;font-weight:600;">Amount</td><td style="padding:8px;border:1px solid #ddd;">$${Number(amount).toFixed(2)}</td></tr>
        <tr><td style="padding:8px;border:1px solid #ddd;font-weight:600;">Method</td><td style="padding:8px;border:1px solid #ddd;">${method}</td></tr>
        <tr><td style="padding:8px;border:1px solid #ddd;font-weight:600;">Date</td><td style="padding:8px;border:1px solid #ddd;">${date}</td></tr>
        ${balance !== undefined ? `<tr><td style="padding:8px;border:1px solid #ddd;font-weight:600;">Remaining Balance</td><td style="padding:8px;border:1px solid #ddd;">$${Number(balance).toFixed(2)}</td></tr>` : ''}
      </table>
      <p>View your full payment history in your <a href="https://bclt-resident-portal.vercel.app">BCLT Portal</a>.</p>
    `,
  };
}

function buildRentReminderEmail({ residentEmail, residentName, amount, dueDate }) {
  return {
    to: residentEmail,
    subject: 'BCLT — Rent Payment Reminder',
    body: `
      <h2>Rent Payment Reminder</h2>
      <p>Hi ${residentName?.split(' ')[0] || 'Resident'},</p>
      <p>This is a friendly reminder that your rent payment of <strong>$${Number(amount).toFixed(2)}</strong> is due on <strong>${dueDate}</strong>.</p>
      <p>You can pay online through your <a href="https://bclt-resident-portal.vercel.app">BCLT Portal</a>, or contact the office to arrange payment by cash or check.</p>
      <p>If you've already paid, please disregard this notice.</p>
    `,
  };
}

function buildInspectionNoticeEmail({ residentEmail, residentName, inspectionType, date, unit }) {
  return {
    to: residentEmail,
    subject: `BCLT — ${inspectionType} Inspection Scheduled`,
    body: `
      <h2>Inspection Notice</h2>
      <p>Hi ${residentName?.split(' ')[0] || 'Resident'},</p>
      <p>A <strong>${inspectionType}</strong> inspection has been scheduled for your unit <strong>${unit}</strong> on <strong>${date}</strong>.</p>
      <p>Please ensure access to all rooms and review the preparation checklist on your <a href="https://bclt-resident-portal.vercel.app">BCLT Portal</a>.</p>
      <p>If you need to reschedule, please contact the office at (415) 555-0100.</p>
    `,
  };
}

// ── HTML Wrapper ──

function wrapHtml(body) {
  return `
    <!DOCTYPE html>
    <html>
    <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#333;max-width:600px;margin:0 auto;padding:20px;">
      <div style="border-bottom:3px solid #2E5090;padding-bottom:12px;margin-bottom:20px;">
        <h1 style="color:#2E5090;margin:0;font-size:20px;">BCLT Portal</h1>
        <p style="color:#888;margin:4px 0 0;font-size:13px;">Bolinas Community Land Trust</p>
      </div>
      ${body}
      <div style="border-top:1px solid #ddd;margin-top:24px;padding-top:12px;font-size:11px;color:#999;">
        <p>This is an automated message from the BCLT Resident Portal. Please do not reply to this email.</p>
        <p>Bolinas Community Land Trust · 123 Wharf Rd, Bolinas, CA 94924 · (415) 555-0100</p>
      </div>
    </body>
    </html>
  `;
}
