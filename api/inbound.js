// Vercel Serverless Function — Inbound email webhook
// Called by Google Apps Script when replies arrive in Gmail
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.Supabase_service_row_key || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
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

  const supabase = getSupabase();
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  try {
    // Find the thread by code (e.g. THR-1234567890)
    let threadId = threadCode;
    if (!threadId) {
      // Try to extract thread code from subject line (Re: [THR-123] Subject)
      const match = subject?.match(/\[?(THR-\d+)\]?/);
      threadId = match ? match[1] : null;
    }

    if (!threadId) {
      return res.status(400).json({ error: 'Could not determine thread from subject' });
    }

    // Look up the thread UUID
    const { data: thread } = await supabase
      .from('message_threads')
      .select('id, code, participants')
      .eq('code', threadId)
      .single();

    if (!thread) {
      return res.status(404).json({ error: `Thread ${threadId} not found` });
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
