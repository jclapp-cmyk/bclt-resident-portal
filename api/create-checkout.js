import Stripe from 'stripe';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const stripeKey = (process.env.STRIPE_SECRET_KEY || '').trim();
  if (!stripeKey) {
    return res.status(500).json({ error: 'STRIPE_SECRET_KEY not configured' });
  }

  const stripe = new Stripe(stripeKey);
  const portalUrl = (process.env.PORTAL_URL || 'https://bclt-resident-portal.vercel.app').trim();

  const { amount, fee, method, payType, residentId, residentName, unit, propertyId, propertyName } = req.body || {};
  if (!amount || !residentId) {
    return res.status(400).json({ error: 'Missing amount or residentId' });
  }

  const totalCents = Math.round((parseFloat(amount) + parseFloat(fee || 0)) * 100);
  if (totalCents < 50) {
    return res.status(400).json({ error: 'Amount must be at least $0.50' });
  }

  const paymentMethodTypes = method === 'ach' ? ['us_bank_account'] : ['card'];
  const description = `${payType || 'Rent'} payment — ${residentName || 'Resident'} (${unit || 'N/A'}) — ${propertyName || propertyId || 'Unknown property'}`;

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
      metadata: {
        residentId,
        residentName: residentName || '',
        unit: unit || '',
        payType: payType || 'rent',
        method: method || 'ach',
        baseAmount: String(amount),
        fee: String(fee || 0),
        propertyId: propertyId || '',
        propertyName: propertyName || '',
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
