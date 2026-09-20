// Small self-contained "token" for the owner admin page — no extra auth
// library needed. Not a full JWT, just an HMAC-signed payload with an
// expiry, which is all a single-owner login needs.
const crypto = require('crypto');

const SECRET = process.env.OWNER_TOKEN_SECRET;
const TOKEN_LIFETIME_MS = 12 * 60 * 60 * 1000; // 12 hours

function sign(payloadObj) {
  const payload = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function issueToken() {
  return sign({ exp: Date.now() + TOKEN_LIFETIME_MS });
}

function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return false;
  const [payload, sig] = token.split('.');
  const expectedSig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length) return false;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data.exp && data.exp > Date.now();
  } catch {
    return false;
  }
}

// Pull the bearer token out of a Netlify function event's headers.
function tokenFromEvent(event) {
  const header = event.headers.authorization || event.headers.Authorization || '';
  const [, token] = header.split(' ');
  return token;
}

module.exports = { issueToken, verifyToken, tokenFromEvent };
