import Stripe from 'stripe';

export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const stripeKey = (process.env.STRIPE_SECRET_KEY || '').trim();
  const webhookSecret = (process.env.STRIPE_WEBHOOK_SECRET || '').trim();
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.Supabase_service_row_key || '').trim();

  if (!stripeKey || !webhookSecret) {
    return res.status(500).json({ error: 'Stripe keys not configured' });
  }

  const stripe = new Stripe(stripeKey);
  const rawBody = await getRawBody(req);
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const meta = session.metadata || {};

    if (session.payment_status === 'paid' || session.payment_status === 'no_payment_required') {
      try {
        const residentSlug = meta.residentId;
        const baseAmount = parseFloat(meta.baseAmount) || 0;
        const fee = parseFloat(meta.fee) || 0;
        const method = meta.method || 'ach';
        const payType = meta.payType || 'rent';
        const now = new Date().toISOString();

        const resResp = await fetch(
          `${supabaseUrl}/rest/v1/residents?slug=eq.${encodeURIComponent(residentSlug)}&select=id,property_id&limit=1`,
          { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
        );
        const residents = await resResp.json();
        if (!residents?.[0]) {
          console.error('Resident not found for slug:', residentSlug);
          return res.status(200).json({ received: true, warning: 'resident not found' });
        }

        const resident = residents[0];
        const feeNote = fee > 0 ? ` (fee: $${fee.toFixed(2)})` : '';
        const payTypeLabels = { rent: 'Rent', late_fee: 'Late Fee', deposit: 'Deposit', utility: 'Utility', other: 'Other' };

        const paymentRow = {
          resident_id: resident.id,
          property_id: resident.property_id,
          amount: baseAmount,
          method,
          payment_date: now.slice(0, 10),
          month: now.slice(0, 7),
          note: `${payTypeLabels[payType] || payType} — online payment${feeNote}`,
          recorded_by: 'Stripe',
          stripe_session_id: session.id,
        };

        const insertResp = await fetch(`${supabaseUrl}/rest/v1/rent_payments`, {
          method: 'POST',
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify(paymentRow),
        });

        if (!insertResp.ok) {
          const errText = await insertResp.text();
          console.error('Failed to record payment:', errText);
        } else {
          console.log(`Payment recorded: $${baseAmount} for ${residentSlug} via ${method}`);
        }
      } catch (err) {
        console.error('Error processing payment webhook:', err);
      }
    }
  }

  if (event.type === 'account.updated') {
    const account = event.data.object;
    const onboarded = account.charges_enabled && account.payouts_enabled;
    try {
      await fetch(
        `${supabaseUrl}/rest/v1/properties?stripe_account_id=eq.${encodeURIComponent(account.id)}`,
        {
          method: 'PATCH',
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({ stripe_onboarded: onboarded }),
        }
      );
      console.log(`Account ${account.id} onboarded: ${onboarded}`);
    } catch (err) {
      console.error('Error updating account status:', err);
    }
  }

  return res.status(200).json({ received: true });
}
