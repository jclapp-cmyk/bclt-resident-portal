import Stripe from 'stripe';

export default async function handler(req, res) {
  const stripeKey = (process.env.STRIPE_SECRET_KEY || '').trim();
  if (!stripeKey) return res.status(200).json({ error: 'No key' });

  const stripe = new Stripe(stripeKey);
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.Supabase_service_row_key || '').trim();

  try {
    // Get platform balance
    const balance = await stripe.balance.retrieve();
    const available = balance.available.reduce((sum, b) => sum + b.amount, 0);

    if (req.method !== 'POST') {
      // GET — just show what would happen
      const connected = await stripe.accounts.list({ limit: 10 });
      return res.status(200).json({
        availableBalance: available / 100,
        connectedAccounts: connected.data.map(a => ({
          id: a.id,
          name: a.business_profile?.name || a.company?.name,
          chargesEnabled: a.charges_enabled,
          payoutsEnabled: a.payouts_enabled,
        })),
        message: 'POST to this endpoint with { "accountId": "acct_...", "amount": 1742 } to transfer funds.',
      });
    }

    // POST — do the transfer
    const { accountId, amount } = req.body || {};
    if (!accountId || !amount) {
      return res.status(400).json({ error: 'Missing accountId or amount' });
    }

    const amountCents = Math.round(parseFloat(amount) * 100);
    if (amountCents > available) {
      return res.status(400).json({ error: `Insufficient balance. Available: $${available / 100}, requested: $${amount}` });
    }

    const transfer = await stripe.transfers.create({
      amount: amountCents,
      currency: 'usd',
      destination: accountId,
      description: 'Transfer of payments collected before Connect routing was enabled',
    });

    return res.status(200).json({
      status: 'TRANSFERRED',
      amount: transfer.amount / 100,
      destination: transfer.destination,
      id: transfer.id,
    });
  } catch (err) {
    return res.status(200).json({ error: err.message });
  }
}
