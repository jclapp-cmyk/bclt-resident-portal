import Stripe from 'stripe';

export default async function handler(req, res) {
  const stripeKey = (process.env.STRIPE_SECRET_KEY || '').trim();

  if (!stripeKey) {
    return res.status(200).json({ status: 'NO_KEY', message: 'STRIPE_SECRET_KEY is not set' });
  }

  const prefix = stripeKey.substring(0, 12);
  const suffix = stripeKey.substring(stripeKey.length - 4);

  try {
    const stripe = new Stripe(stripeKey);
    const balance = await stripe.balance.retrieve();
    return res.status(200).json({
      status: 'OK',
      keyPrefix: prefix,
      keySuffix: suffix,
      balance: balance.available,
    });
  } catch (err) {
    return res.status(200).json({
      status: 'ERROR',
      keyPrefix: prefix,
      keySuffix: suffix,
      error: err.message,
    });
  }
}
