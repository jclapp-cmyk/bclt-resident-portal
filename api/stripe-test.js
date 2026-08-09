import Stripe from 'stripe';

export default async function handler(req, res) {
  const stripeKey = (process.env.STRIPE_SECRET_KEY || '').trim();
  if (!stripeKey) return res.status(200).json({ error: 'No key' });

  const stripe = new Stripe(stripeKey);

  try {
    const account = await stripe.accounts.retrieve();
    const balance = await stripe.balance.retrieve();
    const transfers = await stripe.transfers.list({ limit: 10 });
    const payouts = await stripe.payouts.list({ limit: 10 });
    const connected = await stripe.accounts.list({ limit: 10 });

    const connectedDetails = [];
    for (const acct of connected.data) {
      try {
        const bal = await stripe.balance.retrieve({ stripeAccount: acct.id });
        const ap = await stripe.payouts.list({ limit: 5 }, { stripeAccount: acct.id });
        connectedDetails.push({
          id: acct.id,
          name: acct.business_profile?.name || acct.company?.name,
          chargesEnabled: acct.charges_enabled,
          payoutsEnabled: acct.payouts_enabled,
          balance: bal.available,
          pending: bal.pending,
          payouts: ap.data.map(p => ({
            amount: p.amount / 100,
            status: p.status,
            arrival: new Date(p.arrival_date * 1000).toISOString().slice(0, 10),
          })),
        });
      } catch (e) {
        connectedDetails.push({ id: acct.id, error: e.message });
      }
    }

    return res.status(200).json({
      platform: {
        id: account.id,
        name: account.settings?.dashboard?.display_name,
        balance: balance.available,
        pending: balance.pending,
      },
      transfers: transfers.data.map(t => ({
        amount: t.amount / 100,
        destination: t.destination,
        created: new Date(t.created * 1000).toISOString().slice(0, 10),
      })),
      platformPayouts: payouts.data.map(p => ({
        amount: p.amount / 100,
        status: p.status,
        arrival: new Date(p.arrival_date * 1000).toISOString().slice(0, 10),
      })),
      connectedAccounts: connectedDetails,
    });
  } catch (err) {
    return res.status(200).json({ error: err.message });
  }
}
