const { createClient } = require('@supabase/supabase-js');
const Stripe = require('stripe');
const { getTargetMonth, currentCalendarMonthKey } = require('./lib/months');

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

  const target = getTargetMonth();
  const currentMonthKey = currentCalendarMonthKey();
  const now = new Date();
  const pendingExpires = new Date(now.getTime() + PENDING_HOLD_MINUTES * 60 * 1000);

  // Claimable if: free, OR an abandoned pending hold has expired,
  // OR it was "taken" for a month that has now fully passed.
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
    .or(`status.eq.free,and(status.eq.pending,pending_expires_at.lt.${now.toISOString()}),and(status.eq.taken,paid_month.lt.${currentMonthKey})`)
    .select();

  if (claimErr) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Could not reach the database' }) };
  }
  if (!claimed || claimed.length === 0) {
    return { statusCode: 409, body: JSON.stringify({ error: 'That number has just been taken — pick another.' }) };
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: email,
      customer_creation: 'always',
      line_items: [{
        price_data: {
          currency: 'gbp',
          unit_amount: target.pricePence,
          product_data: {
            name: `Bonus Ball — Number ${number} — ${target.monthName} ${target.year}`,
            description: `${target.saturdays} Saturday draws at £5 each`
          }
        },
        quantity: 1
      }],
      metadata: {
        bonus_number: String(number),
        owner_name: name,
        owner_phone: phone || '',
        paid_month: target.monthKey,
        month_name: target.monthName,
        year: String(target.year),
        saturdays: String(target.saturdays)
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
    // Release the hold so the number isn't stuck "pending" over nothing.
    await supabase
      .from('bonus_numbers')
      .update({ status: 'free', pending_expires_at: null, owner_name: null, owner_email: null, owner_phone: null })
      .eq('number', number);

    return { statusCode: 500, body: JSON.stringify({ error: 'Could not start checkout — please try again.' }) };
  }
};
