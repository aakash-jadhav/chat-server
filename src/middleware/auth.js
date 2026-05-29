import Session from '../models/Session.js';
import { getCookieName, verifySessionToken } from '../utils/jwt.js';

export async function requireSession(req, res, next) {
  try {
    const token = req.cookies?.[getCookieName()];
    if (!token) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const payload = verifySessionToken(token);
    const session = await Session.findById(payload.sessionId);
    if (!session) {
      return res.status(401).json({ error: 'Session not found' });
    }

    req.session = session;
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid session' });
  }
}

export async function resolveSessionFromCookie(cookieHeader) {
  if (!cookieHeader) {
    return null;
  }

  const { parse: parseCookie } = await import('cookie');
  const cookies = parseCookie(cookieHeader);
  const token = cookies[getCookieName()];
  if (!token) {
    return null;
  }

  try {
    const payload = verifySessionToken(token);
    return Session.findById(payload.sessionId);
  } catch {
    return null;
  }
}

export function formatSessionProfile(session) {
  return {
    id: session._id.toString(),
    sixDigitCode: session.sixDigitCode,
    name: session.name,
  };
}
