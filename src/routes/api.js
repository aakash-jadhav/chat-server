import { Router } from 'express';
import Connection from '../models/Connection.js';
import Message from '../models/Message.js';
import RequestLog from '../models/RequestLog.js';
import Session from '../models/Session.js';
import { formatSessionProfile, requireSession } from '../middleware/auth.js';
import { generateUniqueSixDigitCode } from '../utils/generateCode.js';
import {
  getCookieName,
  getCookieOptions,
  signSessionToken,
  verifySessionToken,
} from '../utils/jwt.js';

const router = Router();

async function createFreshSession(res) {
  const sixDigitCode = await generateUniqueSixDigitCode();
  const session = await Session.create({ sixDigitCode });
  const token = signSessionToken(session._id.toString());

  res.cookie(getCookieName(), token, getCookieOptions());
  return session;
}

router.get('/init', async (req, res) => {
  try {
    const token = req.cookies?.[getCookieName()];

    if (!token) {
      const session = await createFreshSession(res);
      return res.json({ session: formatSessionProfile(session), isNew: true });
    }

    try {
      const payload = verifySessionToken(token);
      const session = await Session.findById(payload.sessionId);

      if (!session) {
        res.clearCookie(getCookieName(), getCookieOptions());
        const freshSession = await createFreshSession(res);
        return res.json({ session: formatSessionProfile(freshSession), isNew: true });
      }

      return res.json({ session: formatSessionProfile(session), isNew: false });
    } catch {
      res.clearCookie(getCookieName(), getCookieOptions());
      const freshSession = await createFreshSession(res);
      return res.json({ session: formatSessionProfile(freshSession), isNew: true });
    }
  } catch (error) {
    console.error('Init error:', error);
    return res.status(500).json({ error: 'Failed to initialize session' });
  }
});

router.post('/logout', async (req, res) => {
  try {
    const token = req.cookies?.[getCookieName()];

    if (token) {
      try {
        const payload = verifySessionToken(token);
        await Session.findByIdAndDelete(payload.sessionId);
      } catch {
        // Token invalid — still clear cookie below
      }
    }

    res.clearCookie(getCookieName(), getCookieOptions());
    return res.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    return res.status(500).json({ error: 'Failed to logout' });
  }
});

router.post('/clear-session', async (req, res) => {
  try {
    const token = req.cookies?.[getCookieName()];

    if (token) {
      try {
        const payload = verifySessionToken(token);
        const sessionId = payload.sessionId;

        await Promise.all([
          Session.findByIdAndDelete(sessionId),
          Connection.deleteMany({ $or: [{ userA: sessionId }, { userB: sessionId }] }),
          RequestLog.deleteMany({ $or: [{ senderId: sessionId }, { receiverId: sessionId }] }),
          Message.deleteMany({ $or: [{ senderId: sessionId }, { receiverId: sessionId }] }),
        ]);
      } catch {
        // Continue to regenerate session
      }
    }

    res.clearCookie(getCookieName(), getCookieOptions());
    const session = await createFreshSession(res);
    return res.json({ session: formatSessionProfile(session), isNew: true });
  } catch (error) {
    console.error('Clear session error:', error);
    return res.status(500).json({ error: 'Failed to clear session' });
  }
});

router.get('/connections', requireSession, async (req, res) => {
  try {
    const userId = req.session._id;
    const connections = await Connection.find({
      $or: [{ userA: userId }, { userB: userId }],
    }).populate('userA userB', 'name sixDigitCode');

    const peers = connections.map((conn) => {
      const peer =
        conn.userA._id.toString() === userId.toString() ? conn.userB : conn.userA;
      return {
        connectionId: conn._id.toString(),
        peerId: peer._id.toString(),
        name: peer.name,
        sixDigitCode: peer.sixDigitCode,
        establishedAt: conn.establishedAt,
      };
    });

    return res.json({ connections: peers });
  } catch (error) {
    console.error('Connections error:', error);
    return res.status(500).json({ error: 'Failed to fetch connections' });
  }
});

router.get('/messages/:peerId', requireSession, async (req, res) => {
  try {
    const userId = req.session._id;
    const { peerId } = req.params;

    const messages = await Message.find({
      $or: [
        { senderId: userId, receiverId: peerId },
        { senderId: peerId, receiverId: userId },
      ],
    })
      .sort({ timestamp: 1 })
      .limit(200);

    return res.json({
      messages: messages.map((m) => ({
        id: m._id.toString(),
        senderId: m.senderId.toString(),
        receiverId: m.receiverId.toString(),
        messageText: m.messageText,
        timestamp: m.timestamp,
      })),
    });
  } catch (error) {
    console.error('Messages error:', error);
    return res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

export default router;
