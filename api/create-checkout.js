import Stripe from 'stripe';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const stripeKey = (process.env.STRIPE_SECRET_KEY || '').trim();
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.Supabase_service_row_key || '').trim();

  if (!stripeKey) {
    return res.status(500).json({ error: 'STRIPE_SECRET_KEY not configured' });
  }

  const stripe = new Stripe(stripeKey);
  const portalUrl = (process.env.PORTAL_URL || 'https://bclt-resident-portal.vercel.app').trim();

  const { amount, fee, method, payType, residentId, residentName, unit, propertyId } = req.body || {};
  if (!amount || !residentId) {
    return res.status(400).json({ error: 'Missing amount or residentId' });
  }

  const totalCents = Math.round((parseFloat(amount) + parseFloat(fee || 0)) * 100);
  if (totalCents < 50) {
    return res.status(400).json({ error: 'Amount must be at least $0.50' });
  }

  // Look up the property's Stripe connected account
  let stripeAccountId = null;
  if (supabaseUrl && serviceKey && propertyId) {
    try {
      const resp = await fetch(
        `${supabaseUrl}/rest/v1/properties?slug=eq.${encodeURIComponent(propertyId)}&select=stripe_account_id,stripe_onboarded&limit=1`,
        { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
      );
      const props = await resp.json();
      if (props?.[0]?.stripe_account_id && props[0].stripe_onboarded) {
        stripeAccountId = props[0].stripe_account_id;
      }
    } catch (err) {
      console.warn('Failed to look up property Stripe account:', err.message);
    }
  }

  if (!stripeAccountId) {
    return res.status(400).json({ error: 'Online payments are not set up for this property yet. Contact your property manager.' });
  }

  const paymentMethodTypes = method === 'ach' ? ['us_bank_account'] : ['card'];
  const description = `${payType || 'Rent'} payment — ${residentName || 'Resident'} (${unit || 'N/A'})`;
  const feeCents = Math.round(parseFloat(fee || 0) * 100);

  try {
    const sessionParams = {
      mode: 'payment',
      payment_method_types: paymentMethodTypes,
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: totalCents,
          product_data: {
            name: `${payType || 'Rent'} Payment`,
            description,
          },
        },
        quantity: 1,
      }],
      payment_intent_data: {
        application_fee_amount: feeCents,
        transfer_data: {
          destination: stripeAccountId,
        },
      },
      metadata: {
        residentId,
        residentName: residentName || '',
        unit: unit || '',
        payType: payType || 'rent',
        method: method || 'ach',
        baseAmount: String(amount),
        fee: String(fee || 0),
        propertyId: propertyId || '',
      },
      success_url: `${portalUrl}/#/rent?payment=success`,
      cancel_url: `${portalUrl}/#/rent?payment=cancelled`,
    };

    if (method === 'ach') {
      sessionParams.payment_method_options = {
        us_bank_account: {
          financial_connections: { permissions: ['payment_method'] },
        },
      };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err);
    return res.status(500).json({ error: err.message });
  }
}
