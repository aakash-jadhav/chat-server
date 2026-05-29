import Session from '../models/Session.js';
import { getCookieName, getTokenFromRequest, verifySessionToken } from '../utils/jwt.js';

export async function resolveSessionFromToken(token) {
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

export async function requireSession(req, res, next) {
  try {
    const token = getTokenFromRequest(req);
    if (!token) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const session = await resolveSessionFromToken(token);
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
  return resolveSessionFromToken(cookies[getCookieName()]);
}

export async function resolveSessionFromHandshake(handshake) {
  const fromCookie = await resolveSessionFromCookie(handshake.headers.cookie);
  if (fromCookie) {
    return fromCookie;
  }

  return resolveSessionFromToken(handshake.auth?.token);
}

export function formatSessionProfile(session) {
  return {
    id: session._id.toString(),
    sixDigitCode: session.sixDigitCode,
    name: session.name,
  };
}
