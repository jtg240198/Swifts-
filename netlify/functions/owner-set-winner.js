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

  const winningNumber = parseInt(body.winning_number, 10);
  const drawDate = body.draw_date; // "YYYY-MM-DD" — the Saturday of the draw

  if (!Number.isInteger(winningNumber) || winningNumber < 1 || winningNumber > 59) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Winning number must be 1–59' }) };
  }
  if (!drawDate) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Draw date is required' }) };
  }

  // Is that number currently held by one of our subscribers?
  const { data: holder } = await supabase
    .from('bonus_numbers')
    .select('number, status, owner_name')
    .eq('number', winningNumber)
    .single();

  const hasWinner = holder && holder.status === 'taken';

  const { data: draw, error } = await supabase
    .from('bonus_draws')
    .upsert({
      draw_date: drawDate,
      winning_number: winningNumber,
      winner_number: hasWinner ? winningNumber : null,
      winner_name: hasWinner ? holder.owner_name : null,
      paid_out: false
    }, { onConflict: 'draw_date' })
    .select()
    .single();

  if (error) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Could not save the draw' }) };
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ draw })
  };
};
