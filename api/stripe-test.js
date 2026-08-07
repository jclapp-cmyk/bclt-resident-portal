import Stripe from 'stripe';

export default async function handler(req, res) {
  const stripeKey = (process.env.STRIPE_SECRET_KEY || '').trim();
  if (!stripeKey) return res.status(200).json({ error: 'No key' });

  const stripe = new Stripe(stripeKey);

  try {
    // Get account info
    const account = await stripe.accounts.retrieve();

    // Get recent payments
    const payments = await stripe.paymentIntents.list({ limit: 10 });

    // Get recent checkout sessions
    const sessions = await stripe.checkout.sessions.list({ limit: 10 });

    return res.status(200).json({
      account: { id: account.id, name: account.settings?.dashboard?.display_name || account.business_profile?.name },
      payments: payments.data.map(p => ({
        id: p.id,
        amount: p.amount / 100,
        status: p.status,
        created: new Date(p.created * 1000).toISOString(),
        description: p.description,
        metadata: p.metadata,
      })),
      sessions: sessions.data.map(s => ({
        id: s.id,
        amount: s.amount_total / 100,
        status: s.status,
        paymentStatus: s.payment_status,
        created: new Date(s.created * 1000).toISOString(),
        metadata: s.metadata,
      })),
    });
  } catch (err) {
    return res.status(200).json({ error: err.message });
  }
}
