const { createClient } = require('@supabase/supabase-js');
const Stripe = require('stripe');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const sig = event.headers['stripe-signature'];
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64')
    : event.body;

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return { statusCode: 400, body: `Webhook signature verification failed` };
  }

  try {
    switch (stripeEvent.type) {
      case 'checkout.session.completed': {
        const session = stripeEvent.data.object;
        if (session.mode !== 'subscription') break;
        const number = parseInt(session.metadata?.bonus_number, 10);
        if (!Number.isInteger(number)) break;

        await supabase
          .from('bonus_numbers')
          .update({
            status: 'taken',
            pending_expires_at: null,
            stripe_customer_id: session.customer,
            stripe_subscription_id: session.subscription,
            claimed_at: new Date().toISOString()
          })
          .eq('number', number);
        break;
      }

      // Safety net: if a subscription ends up cancelled or unpaid by any
      // route (owner cancels in Stripe dashboard, card fails permanently,
      // customer cancels), free the number back up automatically.
      case 'customer.subscription.deleted': {
        const sub = stripeEvent.data.object;
        await supabase
          .from('bonus_numbers')
          .update({
            status: 'free',
            owner_name: null,
            owner_email: null,
            owner_phone: null,
            stripe_customer_id: null,
            stripe_subscription_id: null,
            pending_expires_at: null,
            claimed_at: null
          })
          .eq('stripe_subscription_id', sub.id);
        break;
      }

      case 'customer.subscription.updated': {
        const sub = stripeEvent.data.object;
        if (sub.status === 'canceled' || sub.status === 'unpaid') {
          await supabase
            .from('bonus_numbers')
            .update({
              status: 'free',
              owner_name: null,
              owner_email: null,
              owner_phone: null,
              stripe_customer_id: null,
              stripe_subscription_id: null,
              pending_expires_at: null,
              claimed_at: null
            })
            .eq('stripe_subscription_id', sub.id);
        }
        break;
      }

      default:
        break; // ignore everything else
    }

    return { statusCode: 200, body: JSON.stringify({ received: true }) };
  } catch (err) {
    // Returning 500 makes Stripe retry the webhook later.
    return { statusCode: 500, body: JSON.stringify({ error: 'Webhook handler failed' }) };
  }
};
