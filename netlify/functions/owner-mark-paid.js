const { createClient } = require('@supabase/supabase-js');
const { verifyToken, tokenFromEvent } = require('./lib/auth');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }
  if (!verifyToken(tokenFromEvent(event))) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Not signed in' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Bad request' }) };
  }

  if (!body.draw_id) {
    return { statusCode: 400, body: JSON.stringify({ error: 'draw_id is required' }) };
  }

  const { error } = await supabase
    .from('bonus_draws')
    .update({ paid_out: true })
    .eq('id', body.draw_id);

  if (error) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Could not update the draw' }) };
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};
