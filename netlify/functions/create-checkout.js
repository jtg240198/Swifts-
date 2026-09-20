const { createClient } = require('@supabase/supabase-js');
const Stripe = require('stripe');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const PENDING_HOLD_MINUTES = 15;
const SITE_URL = process.env.SITE_URL || 'https://st-james-swifts-fc.netlify.app';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Bad request' }) };
  }

  const number = parseInt(body.number, 10);
  const name = (body.name || '').trim();
  const email = (body.email || '').trim();
  const phone = (body.phone || '').trim();

  if (!Number.isInteger(number) || number < 1 || number > 59) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid number' }) };
  }
  if (!name || !email) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Name and email are required' }) };
  }

  const now = new Date();
  const pendingExpires = new Date(now.getTime() + PENDING_HOLD_MINUTES * 60 * 1000);

  // Atomic-ish claim: only succeeds if the number is currently free, OR it's
  // "pending" from an abandoned checkout that's expired. If two people click
  // the same number at once, only one of these updates matches a row.
  const { data: claimed, error: claimErr } = await supabase
    .from('bonus_numbers')
    .update({
      status: 'pending',
      pending_expires_at: pendingExpires.toISOString(),
      owner_name: name,
      owner_email: email,
      owner_phone: phone || null
    })
    .eq('number', number)
    .or(`status.eq.free,and(status.eq.pending,pending_expires_at.lt.${now.toISOString()})`)
    .select();

  if (claimErr) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Could not reach the database' }) };
  }
  if (!claimed || claimed.length === 0) {
    return { statusCode: 409, body: JSON.stringify({ error: 'That number has just been taken — pick another.' }) };
  }

  // Now create the Stripe Checkout session for a £5/week subscription.
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: email,
      line_items: [{ price: process.env.STRIPE_BONUS_BALL_PRICE_ID, quantity: 1 }],
      metadata: { bonus_number: String(number), owner_name: name, owner_phone: phone || '' },
      subscription_data: {
        metadata: { bonus_number: String(number), owner_name: name, owner_phone: phone || '' }
      },
      success_url: `${SITE_URL}/#events?bonusball=success`,
      cancel_url: `${SITE_URL}/#events?bonusball=cancelled`
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: session.url })
    };
  } catch (stripeErr) {
    // Stripe failed — release the hold so the number doesn't get stuck as
    // "pending" for 15 minutes over nothing.
    await supabase
      .from('bonus_numbers')
      .update({ status: 'free', pending_expires_at: null, owner_name: null, owner_email: null, owner_phone: null })
      .eq('number', number);

    return { statusCode: 500, body: JSON.stringify({ error: 'Could not start checkout — please try again.' }) };
  }
};
