import Stripe from 'stripe';

export default async function handler(req, res) {
  const stripeKey = (process.env.STRIPE_SECRET_KEY || '').trim();
  if (!stripeKey) {
    return res.status(200).json({ error: 'No key' });
  }

  const stripe = new Stripe(stripeKey);
  const portalUrl = (process.env.PORTAL_URL || 'https://bclt-resident-portal.vercel.app').trim();

  try {
    // Check for existing webhooks first
    const existing = await stripe.webhookEndpoints.list({ limit: 10 });
    const alreadyExists = existing.data.find(w => w.url.includes('stripe-webhook'));
    if (alreadyExists) {
      return res.status(200).json({
        status: 'ALREADY_EXISTS',
        id: alreadyExists.id,
        url: alreadyExists.url,
        message: 'Webhook already exists. Secret was only shown at creation time. If you need a new secret, delete this webhook and run again.',
      });
    }

    const endpoint = await stripe.webhookEndpoints.create({
      url: `${portalUrl}/api/stripe-webhook`,
      enabled_events: ['checkout.session.completed', 'account.updated'],
    });

    return res.status(200).json({
      status: 'CREATED',
      id: endpoint.id,
      url: endpoint.url,
      secret: endpoint.secret,
      message: 'Webhook created! Copy the secret below and add it as STRIPE_WEBHOOK_SECRET in Vercel, then redeploy.',
    });
  } catch (err) {
    return res.status(200).json({ status: 'ERROR', error: err.message });
  }
}
