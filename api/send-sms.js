// Vercel Serverless Function — SMS via Twilio
// Env vars required: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_MESSAGING_SERVICE_SID or TWILIO_PHONE_NUMBER

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { to, body } = req.body;
  if (!to || !body) return res.status(400).json({ error: 'Missing to or body' });

  const accountSid = (process.env.TWILIO_ACCOUNT_SID || '').trim();
  const authToken = (process.env.TWILIO_AUTH_TOKEN || '').trim();
  const messagingServiceSid = (process.env.TWILIO_MESSAGING_SERVICE_SID || '').trim();
  const fromNumber = (process.env.TWILIO_PHONE_NUMBER || '').trim();

  if (!accountSid || !authToken) {
    return res.status(500).json({ error: 'Twilio credentials not configured' });
  }

  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const params = new URLSearchParams({
      To: to.startsWith('+') ? to : `+1${to.replace(/\D/g, '')}`,
      Body: body,
    });
    if (messagingServiceSid) {
      params.set('MessagingServiceSid', messagingServiceSid);
    } else if (fromNumber) {
      params.set('From', fromNumber);
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.message || 'Twilio error', code: data.code });
    }

    return res.status(200).json({ success: true, sid: data.sid });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
