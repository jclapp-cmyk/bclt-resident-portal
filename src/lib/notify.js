// Send email notification via /api/notify serverless function
export async function sendNotification(type, data) {
  try {
    const res = await fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, data }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.warn('Notification failed:', err);
    }
  } catch (err) {
    // Non-blocking — don't break the UI if notification fails
    console.warn('Notification send error:', err);
  }
}

// Send SMS via /api/send-sms serverless function (Twilio)
export async function sendSMS(to, body) {
  try {
    const res = await fetch('/api/send-sms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, body }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.warn('SMS failed:', data);
      return { success: false, error: data.error };
    }
    return { success: true, sid: data.sid };
  } catch (err) {
    console.warn('SMS send error:', err);
    return { success: false, error: err.message };
  }
}

// Send both email and SMS
export async function sendBoth({ email, phone, subject, emailBody, smsBody }) {
  const results = { email: null, sms: null };
  if (email) {
    await sendNotification('custom', { to: email, subject, body: emailBody });
    results.email = 'sent';
  }
  if (phone) {
    results.sms = await sendSMS(phone, smsBody || emailBody);
  }
  return results;
}
