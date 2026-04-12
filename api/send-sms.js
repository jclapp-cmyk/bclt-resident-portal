import { createClient } from '@supabase/supabase-js';

async function verifyAuth(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return null;
  const supabase = createClient(supabaseUrl, serviceKey);
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Verify the caller is authenticated
  const user = await verifyAuth(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { to, body } = req.body;
  if (!to || !body) return res.status(400).json({ error: 'Missing to or body' });

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken) {
    return res.status(500).json({ error: 'Twilio credentials not configured' });
  }

  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const params = new URLSearchParams({
      To: to.startsWith('+') ? to : `+1${to.replace(/\D/g, '')}`,
      Body: body,
    });
    // Use Messaging Service if available (required for A2P 10DLC), otherwise fall back to From number
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
