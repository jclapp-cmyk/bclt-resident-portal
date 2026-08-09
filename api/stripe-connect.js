import Stripe from 'stripe';

export default async function handler(req, res) {
  const stripeKey = (process.env.STRIPE_SECRET_KEY || '').trim();
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.Supabase_service_row_key || '').trim();
  const portalUrl = (process.env.PORTAL_URL || 'https://bclt-resident-portal.vercel.app').trim();

  if (!stripeKey) return res.status(500).json({ error: 'STRIPE_SECRET_KEY not configured' });

  const stripe = new Stripe(stripeKey);

  // GET — diagnostics (balance, connected accounts, recent payments)
  if (req.method === 'GET') {
    try {
      const account = await stripe.accounts.retrieve();
      const balance = await stripe.balance.retrieve();
      const payments = await stripe.paymentIntents.list({ limit: 10 });
      const transfers = await stripe.transfers.list({ limit: 10 });
      const connected = await stripe.accounts.list({ limit: 10 });

      return res.status(200).json({
        platform: { id: account.id, name: account.settings?.dashboard?.display_name, balance: balance.available, pending: balance.pending },
        payments: payments.data.map(p => ({ id: p.id, amount: p.amount / 100, status: p.status, created: new Date(p.created * 1000).toISOString() })),
        transfers: transfers.data.map(t => ({ amount: t.amount / 100, destination: t.destination, created: new Date(t.created * 1000).toISOString().slice(0, 10) })),
        connectedAccounts: connected.data.map(a => ({ id: a.id, name: a.business_profile?.name || a.company?.name, chargesEnabled: a.charges_enabled, payoutsEnabled: a.payouts_enabled })),
      });
    } catch (err) {
      return res.status(200).json({ error: err.message });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action, propertyId, propertyName, accountId, amount } = req.body || {};

  // Create a new Express connected account for a property
  if (action === 'create') {
    if (!propertyId || !propertyName) {
      return res.status(400).json({ error: 'Missing propertyId or propertyName' });
    }

    try {
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'US',
        business_type: 'company',
        company: { name: `BCLT — ${propertyName}` },
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
          us_bank_account_ach_payments: { requested: true },
        },
        metadata: { property_id: propertyId, property_name: propertyName },
      });

      if (supabaseUrl && serviceKey) {
        await fetch(`${supabaseUrl}/rest/v1/properties?slug=eq.${encodeURIComponent(propertyId)}`, {
          method: 'PATCH',
          headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ stripe_account_id: account.id, stripe_onboarded: false }),
        });
      }

      const accountLink = await stripe.accountLinks.create({
        account: account.id,
        refresh_url: `${portalUrl}/#/settings?stripe_refresh=${propertyId}`,
        return_url: `${portalUrl}/#/settings?stripe_return=${propertyId}`,
        type: 'account_onboarding',
      });

      return res.status(200).json({ accountId: account.id, url: accountLink.url });
    } catch (err) {
      console.error('Stripe Connect create error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  // Generate a new onboarding link for an existing account
  if (action === 'onboarding-link') {
    if (!accountId) return res.status(400).json({ error: 'Missing accountId' });
    try {
      const accountLink = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: `${portalUrl}/#/settings?stripe_refresh=${propertyId || ''}`,
        return_url: `${portalUrl}/#/settings?stripe_return=${propertyId || ''}`,
        type: 'account_onboarding',
      });
      return res.status(200).json({ url: accountLink.url });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // Check account status
  if (action === 'status') {
    if (!accountId) return res.status(400).json({ error: 'Missing accountId' });
    try {
      const account = await stripe.accounts.retrieve(accountId);
      if (supabaseUrl && serviceKey && propertyId) {
        const onboarded = account.charges_enabled && account.payouts_enabled;
        await fetch(`${supabaseUrl}/rest/v1/properties?slug=eq.${encodeURIComponent(propertyId)}`, {
          method: 'PATCH',
          headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ stripe_onboarded: onboarded }),
        });
      }
      return res.status(200).json({
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
        detailsSubmitted: account.details_submitted,
        requiresAction: (account.requirements?.currently_due?.length || 0) > 0,
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // Generate a Stripe Express dashboard login link
  if (action === 'dashboard-link') {
    if (!accountId) return res.status(400).json({ error: 'Missing accountId' });
    try {
      const loginLink = await stripe.accounts.createLoginLink(accountId);
      return res.status(200).json({ url: loginLink.url });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // Transfer funds from platform to a connected account
  if (action === 'transfer') {
    if (!accountId || !amount) return res.status(400).json({ error: 'Missing accountId or amount' });
    try {
      const amountCents = Math.round(parseFloat(amount) * 100);
      const balance = await stripe.balance.retrieve();
      const available = balance.available.reduce((sum, b) => sum + b.amount, 0);
      if (amountCents > available) {
        return res.status(400).json({ error: `Insufficient balance. Available: $${available / 100}, requested: $${amount}` });
      }
      const transfer = await stripe.transfers.create({
        amount: amountCents,
        currency: 'usd',
        destination: accountId,
        description: 'Transfer of payments collected before Connect routing was enabled',
      });
      return res.status(200).json({ status: 'TRANSFERRED', amount: transfer.amount / 100, destination: transfer.destination, id: transfer.id });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // Set up webhook endpoint
  if (action === 'setup-webhook') {
    try {
      const existing = await stripe.webhookEndpoints.list({ limit: 10 });
      const alreadyExists = existing.data.find(w => w.url.includes('stripe-webhook'));
      if (alreadyExists) {
        return res.status(200).json({ status: 'ALREADY_EXISTS', id: alreadyExists.id, url: alreadyExists.url, message: 'Webhook exists. Delete and re-run to get a new secret.' });
      }
      const endpoint = await stripe.webhookEndpoints.create({
        url: `${portalUrl}/api/stripe-webhook`,
        enabled_events: ['checkout.session.completed', 'account.updated'],
      });
      return res.status(200).json({ status: 'CREATED', id: endpoint.id, url: endpoint.url, secret: endpoint.secret, message: 'Add this secret as STRIPE_WEBHOOK_SECRET in Vercel.' });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(400).json({ error: 'Unknown action' });
}
