const crypto = require('crypto');
const { issueToken } = require('./lib/auth');

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

  const supplied = Buffer.from(body.password || '');
  const expected = Buffer.from(process.env.OWNER_PASSWORD || '');

  const ok = supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
  if (!ok) {
    // Same message either way — don't hint at whether the password was close.
    return { statusCode: 401, body: JSON.stringify({ error: 'Incorrect password' }) };
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: issueToken() })
  };
};
