import jwt from 'jsonwebtoken';

const COOKIE_NAME = 'session_token';

export function getCookieName() {
  return COOKIE_NAME;
}

export function signSessionToken(sessionId) {
  return jwt.sign({ sessionId }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

export function verifySessionToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

export function getCookieOptions() {
  const isProduction = process.env.NODE_ENV === 'production';

  // Cross-origin frontend (e.g. Vercel) → API (e.g. Render) requires SameSite=None + Secure.
  // Strict blocks the cookie on fetch from a different site, so /api/connections returns 401.
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: '/',
  };
}
