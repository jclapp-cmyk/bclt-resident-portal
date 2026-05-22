// Vercel Serverless Function — Inbound email webhook
// Called by Google Apps Script when replies arrive in Gmail
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  // Report which key we chose so failures are debuggable
  let key = null;
  let keySource = 'none';
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) { key = process.env.SUPABASE_SERVICE_ROLE_KEY; keySource = 'SUPABASE_SERVICE_ROLE_KEY'; }
  else if (process.env.Supabase_service_row_key) { key = process.env.Supabase_service_row_key; keySource = 'Supabase_service_row_key (legacy name)'; }
  else if (process.env.VITE_SUPABASE_ANON_KEY) { key = process.env.VITE_SUPABASE_ANON_KEY; keySource = 'VITE_SUPABASE_ANON_KEY (anon — RLS will block!)'; }
  if (!url || !key) return { client: null, keySource };
  return { client: createClient(url, key), keySource };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secret = process.env.INBOUND_WEBHOOK_SECRET;
  if (secret && req.headers['x-webhook-secret'] !== secret) {
    return res.status(401).json({ error: 'Invalid webhook secret' });
  }

  const { from, subject, body, threadCode, date } = req.body;
  if (!from || !body) {
    return res.status(400).json({ error: 'Missing from or body' });
  }

  const { client: supabase, keySource } = getSupabase();
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase not configured', keySource });
  }

  try {
    // Find the thread by code (e.g. THR-1234567890)
    let threadId = threadCode;
    if (!threadId) {
      // Match THR- followed by digits OR base36 chars (timestamp.toString(36))
      const match = subject?.match(/\[?(THR-[A-Za-z0-9]+)\]?/);
      threadId = match ? match[1] : null;
    }

    if (!threadId) {
      return res.status(400).json({ error: 'Could not determine thread from subject' });
    }

    // Look up the thread UUID
    const { data: thread, error: threadErr } = await supabase
      .from('message_threads')
      .select('id, code, participants')
      .eq('code', threadId)
      .maybeSingle();

    if (threadErr) {
      return res.status(500).json({ error: 'Thread lookup failed', details: threadErr.message, keySource });
    }
    if (!thread) {
      // Diagnostic: count threads + sample to confirm we're connected to the right project
      const { count } = await supabase.from('message_threads').select('*', { count: 'exact', head: true });
      const { data: sample } = await supabase.from('message_threads').select('code').order('created_at', { ascending: false }).limit(3);
      const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
      return res.status(404).json({
        error: `Thread ${threadId} not found`,
        keySource,
        supabaseUrl: url,
        threadCountInDb: count,
        recentCodes: (sample || []).map(s => s.code),
      });
    }

    // Determine sender slug from email
    const { data: residents } = await supabase
      .from('residents')
      .select('slug, email')
      .eq('email', from.toLowerCase());

    const senderSlug = residents?.[0]?.slug || from;

    // Insert the reply message
    const msgCode = `MSG-${Date.now()}`;
    const sentAt = date || new Date().toISOString();

    const { error: insertErr } = await supabase.from('messages').insert({
      code: msgCode,
      thread_id: thread.id,
      sender: senderSlug,
      body: body.trim(),
      sent_at: sentAt,
      status: 'delivered',
    });

    if (insertErr) {
      console.error('Message insert failed:', insertErr);
      return res.status(500).json({ error: 'Failed to insert message', details: insertErr.message });
    }

    // Update thread's last message
    await supabase.from('message_threads').update({
      last_message: body.trim().slice(0, 200),
      last_date: sentAt,
      unread: (thread.unread || 0) + 1,
    }).eq('code', threadId);

    return res.status(200).json({ success: true, messageCode: msgCode, threadCode: threadId });
  } catch (err) {
    console.error('Inbound webhook error:', err);
    return res.status(500).json({ error: err.message });
  }
}
