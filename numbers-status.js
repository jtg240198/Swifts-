const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Public, read-only: returns only { number, status } for all 59 numbers.
// Never exposes names/emails/phones — this is called from the public site.
exports.handler = async () => {
  const { data, error } = await supabase
    .from('bonus_numbers')
    .select('number, status, pending_expires_at')
    .order('number', { ascending: true });

  if (error) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Could not load numbers' }) };
  }

  const now = Date.now();
  const numbers = data.map(row => {
    // A "pending" hold that's expired (abandoned checkout) counts as free
    // to anyone browsing, even though we haven't reset the DB row yet —
    // create-checkout.js does the real reset atomically when re-claimed.
    const expired = row.status === 'pending'
      && row.pending_expires_at
      && new Date(row.pending_expires_at).getTime() < now;
    return { number: row.number, status: expired ? 'free' : row.status };
  });

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify({ numbers })
  };
};
