const { createClient } = require('@supabase/supabase-js');
const Stripe = require('stripe');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

async function sendConfirmationEmail(meta, toEmail) {
  if (!process.env.EMAILJS_SERVICE_ID) return; // EmailJS not configured — skip quietly

  try {
    await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: process.env.EMAILJS_SERVICE_ID,
        template_id: process.env.EMAILJS_TEMPLATE_ID,
        user_id: process.env.EMAILJS_PUBLIC_KEY,
        accessToken: process.env.EMAILJS_PRIVATE_KEY,
        template_params: {
          to_email: toEmail,
          to_name: meta.owner_name,
          bonus_number: meta.bonus_number,
          month_name: meta.month_name,
          year: meta.year,
          saturdays: meta.saturdays
        }
      })
    });
  } catch (err) {
    // Don't fail the whole webhook over an email hiccup — the number is
    // already correctly marked as taken either way.
    console.error('EmailJS send failed', err);
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const sig = event.headers['stripe-signature'];
  const rawBody = event.isBase64Encoded ? Buffer.from(event.body, 'base64') : event.body;

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return { statusCode: 400, body: 'Webhook signature verification failed' };
  }

  try {
    if (stripeEvent.type === 'checkout.session.completed') {
      const session = stripeEvent.data.object;
      if (session.mode !== 'payment') {
        return { statusCode: 200, body: JSON.stringify({ received: true }) };
      }

      const meta = session.metadata || {};
      const number = parseInt(meta.bonus_number, 10);
      if (!Number.isInteger(number)) {
        return { statusCode: 200, body: JSON.stringify({ received: true }) };
      }

      await supabase
        .from('bonus_numbers')
        .update({
          status: 'taken',
          pending_expires_at: null,
          paid_month: meta.paid_month,
          stripe_customer_id: session.customer,
          stripe_session_id: session.id,
          claimed_at: new Date().toISOString()
        })
        .eq('number', number);

      await sendConfirmationEmail(meta, session.customer_details?.email || session.customer_email);
    }

    return { statusCode: 200, body: JSON.stringify({ received: true }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Webhook handler failed' }) };
  }
};
