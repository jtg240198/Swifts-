const { createClient } = require('@supabase/supabase-js');
const { verifyToken, tokenFromEvent } = require('./lib/auth');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
  if (!verifyToken(tokenFromEvent(event))) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Not signed in' }) };
  }

  const [{ data: numbers, error: numErr }, { data: draws, error: drawErr }] = await Promise.all([
    supabase.from('bonus_numbers').select('*').order('number', { ascending: true }),
    supabase.from('bonus_draws').select('*').order('draw_date', { ascending: false }).limit(20)
  ]);

  if (numErr || drawErr) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Could not load data' }) };
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify({ numbers, draws })
  };
};
