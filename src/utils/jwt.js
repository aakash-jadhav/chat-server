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

  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: '/',
  };
}
