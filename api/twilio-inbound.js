// Vercel Serverless Function — Inbound SMS webhook (Twilio)
// Twilio Console → Phone Numbers → set "A message comes in" to this URL.
// Twilio POSTs application/x-www-form-urlencoded with at least: From, Body, MessageSid.
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  let key = null;
  let keySource = 'none';
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) { key = process.env.SUPABASE_SERVICE_ROLE_KEY.trim(); keySource = 'SUPABASE_SERVICE_ROLE_KEY'; }
  else if (process.env.Supabase_service_row_key) { key = process.env.Supabase_service_row_key.trim(); keySource = 'Supabase_service_row_key (legacy)'; }
  else if (process.env.VITE_SUPABASE_ANON_KEY) { key = process.env.VITE_SUPABASE_ANON_KEY.trim(); keySource = 'VITE_SUPABASE_ANON_KEY (anon — RLS will block!)'; }
  if (!url || !key) return { client: null, keySource };
  return { client: createClient(url, key), keySource };
}

// Strip every non-digit so we can match e.g. "(415) 555-0142" === "+14155550142"
const normalizePhone = (raw) => (raw || '').replace(/\D/g, '');

// Build a TwiML response — Twilio expects 200 with optional XML
const twimlEmpty = '<?xml version="1.0" encoding="UTF-8"?><Response/>';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Twilio sends form-encoded — Vercel parses it into req.body for us
  const fromRaw = req.body?.From || req.body?.from || '';
  const body = (req.body?.Body || req.body?.body || '').trim();
  const messageSid = req.body?.MessageSid || req.body?.messageSid || '';

  if (!fromRaw || !body) {
    res.setHeader('Content-Type', 'text/xml');
    return res.status(200).send(twimlEmpty);
  }

  const { client: supabase, keySource } = getSupabase();
  if (!supabase) {
    console.error('Twilio inbound: supabase not configured', { keySource });
    res.setHeader('Content-Type', 'text/xml');
    return res.status(200).send(twimlEmpty);
  }

  try {
    const fromDigits = normalizePhone(fromRaw);
    const last10 = fromDigits.slice(-10);

    // Pull all residents and match on normalized phone (last 10 digits handles
    // the +1 prefix difference between Twilio and stored numbers).
    const { data: residents, error: resErr } = await supabase
      .from('residents')
      .select('id, slug, name, phone, unit_id');
    if (resErr) throw resErr;

    const resident = (residents || []).find(r => normalizePhone(r.phone).slice(-10) === last10);

    if (!resident) {
      console.warn('Twilio inbound: unknown phone', fromRaw);
      res.setHeader('Content-Type', 'text/xml');
      return res.status(200).send(twimlEmpty);
    }

    // Find the most recent thread for this resident (within ~60 days)
    const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const { data: existingThreads } = await supabase
      .from('message_threads')
      .select('id, code, participants, last_date, subject')
      .gte('last_date', cutoff)
      .order('last_date', { ascending: false })
      .limit(50);

    let thread = (existingThreads || []).find(t => {
      const p = Array.isArray(t.participants) ? t.participants : [];
      return p.includes(resident.slug) || p.includes(resident.id);
    });

    // No recent thread → create a new one
    if (!thread) {
      const code = `THR-${Date.now()}`;
      const { data: created, error: createErr } = await supabase.from('message_threads').insert({
        code,
        participants: [resident.slug],
        subject: `SMS from ${resident.name}`,
        last_message: body.slice(0, 200),
        last_date: new Date().toISOString(),
        unread: 1,
        channel: 'sms',
        type: 'direct',
        priority: 'normal',
      }).select().single();
      if (createErr) throw createErr;
      thread = created;
    }

    // Append the message
    const msgCode = `MSG-${Date.now()}`;
    const sentAt = new Date().toISOString();
    const { error: insertErr } = await supabase.from('messages').insert({
      code: msgCode,
      thread_id: thread.id,
      sender: resident.slug,
      body,
      sent_at: sentAt,
      status: 'delivered',
    });
    if (insertErr) throw insertErr;

    // Update thread's preview + unread
    await supabase.from('message_threads').update({
      last_message: body.slice(0, 200),
      last_date: sentAt,
      unread: (thread.unread || 0) + 1,
    }).eq('id', thread.id);

    console.log('Twilio inbound: stored message', { from: resident.slug, threadCode: thread.code, messageSid });
    res.setHeader('Content-Type', 'text/xml');
    return res.status(200).send(twimlEmpty);
  } catch (err) {
    console.error('Twilio inbound error:', err);
    // Still return 200 to Twilio so it doesn't retry; we logged the error
    res.setHeader('Content-Type', 'text/xml');
    return res.status(200).send(twimlEmpty);
  }
}
