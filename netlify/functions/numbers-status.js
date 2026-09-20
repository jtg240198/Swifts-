const { createClient } = require('@supabase/supabase-js');
const { getTargetMonth, currentCalendarMonthKey } = require('./lib/months');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async () => {
  const { data, error } = await supabase
    .from('bonus_numbers')
    .select('number, status, pending_expires_at, paid_month')
    .order('number', { ascending: true });

  if (error) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Could not load numbers' }) };
  }

  const now = Date.now();
  const currentMonthKey = currentCalendarMonthKey();

  const numbers = data.map(row => {
    let status = row.status;

    if (status === 'pending' && row.pending_expires_at && new Date(row.pending_expires_at).getTime() < now) {
      status = 'free'; // abandoned checkout hold expired
    }
    if (status === 'taken' && row.paid_month && row.paid_month < currentMonthKey) {
      status = 'free'; // paid-for month has fully passed
    }

    return { number: row.number, status };
  });

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify({ numbers, target: getTargetMonth() })
  };
};
