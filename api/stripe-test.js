import Stripe from 'stripe';

export default async function handler(req, res) {
  const stripeKey = (process.env.STRIPE_SECRET_KEY || '').trim();
  if (!stripeKey) {
    return res.status(200).json({ error: 'No key' });
  }

  const stripe = new Stripe(stripeKey);

  try {
    const account = await stripe.accounts.create({
      type: 'express',
      country: 'US',
      business_type: 'company',
      company: { name: 'Test Property' },
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    });
    // If it worked, delete it immediately
    await stripe.accounts.del(account.id);
    return res.status(200).json({ status: 'CONNECT_WORKS', message: 'Successfully created and deleted a test account' });
  } catch (err) {
    return res.status(200).json({ status: 'CONNECT_FAILED', error: err.message, code: err.code, type: err.type });
  }
}
