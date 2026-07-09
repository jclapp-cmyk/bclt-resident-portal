import Stripe from 'stripe';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const stripeKey = (process.env.STRIPE_SECRET_KEY || '').trim();
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.Supabase_service_row_key || '').trim();
  const portalUrl = (process.env.PORTAL_URL || 'https://bclt-resident-portal.vercel.app').trim();

  if (!stripeKey) return res.status(500).json({ error: 'STRIPE_SECRET_KEY not configured' });

  const stripe = new Stripe(stripeKey);
  const { action, propertyId, propertyName, accountId } = req.body || {};

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

      // Save the account ID to the property
      if (supabaseUrl && serviceKey) {
        await fetch(`${supabaseUrl}/rest/v1/properties?slug=eq.${encodeURIComponent(propertyId)}`, {
          method: 'PATCH',
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({ stripe_account_id: account.id, stripe_onboarded: false }),
        });
      }

      // Generate onboarding link
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
      console.error('Stripe onboarding link error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  // Check account status
  if (action === 'status') {
    if (!accountId) return res.status(400).json({ error: 'Missing accountId' });

    try {
      const account = await stripe.accounts.retrieve(accountId);

      // Update onboarded status in DB
      if (supabaseUrl && serviceKey && propertyId) {
        const onboarded = account.charges_enabled && account.payouts_enabled;
        await fetch(`${supabaseUrl}/rest/v1/properties?slug=eq.${encodeURIComponent(propertyId)}`, {
          method: 'PATCH',
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
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
      console.error('Stripe status check error:', err);
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
      console.error('Stripe dashboard link error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(400).json({ error: 'Unknown action' });
}
