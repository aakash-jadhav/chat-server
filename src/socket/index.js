import Connection from '../models/Connection.js';
import Message from '../models/Message.js';
import RequestLog from '../models/RequestLog.js';
import Session from '../models/Session.js';
import { resolveSessionFromCookie } from '../middleware/auth.js';

const onlineSockets = new Map();

function getSocketIdForUser(userId) {
  return onlineSockets.get(userId.toString()) ?? null;
}

function emitToUser(userId, event, payload) {
  const socketId = getSocketIdForUser(userId);
  if (socketId) {
    const io = global.io;
    io.to(socketId).emit(event, payload);
  }
}

async function isBlocked(senderId, receiverId) {
  const rejected = await RequestLog.findOne({
    senderId,
    receiverId,
    status: 'rejected',
  });
  return Boolean(rejected);
}

async function getAcceptedConnections(userId) {
  const connections = await Connection.find({
    $or: [{ userA: userId }, { userB: userId }],
  }).populate('userA userB', 'name sixDigitCode');

  return connections.map((conn) => {
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
}

export function registerSocketHandlers(io) {
  global.io = io;

  io.use(async (socket, next) => {
    try {
      const cookieHeader = socket.handshake.headers.cookie;
      const session = await resolveSessionFromCookie(cookieHeader);

      if (!session) {
        return next(new Error('Unauthorized'));
      }

      socket.session = session;
      return next();
    } catch {
      return next(new Error('Unauthorized'));
    }
  });

  io.on('connection', async (socket) => {
    const session = socket.session;
    const userId = session._id.toString();

    session.socketId = socket.id;
    await session.save();
    onlineSockets.set(userId, socket.id);

    socket.emit('session-ready', {
      id: userId,
      sixDigitCode: session.sixDigitCode,
      name: session.name,
    });

    const connections = await getAcceptedConnections(session._id);
    socket.emit('connections-sync', { connections });

    const pendingRequests = await RequestLog.find({
      receiverId: session._id,
      status: 'pending',
    })
      .sort({ createdAt: 1 })
      .populate('senderId', 'name sixDigitCode');

    for (const pendingRequest of pendingRequests) {
      if (!pendingRequest.senderId) continue;
      socket.emit('incoming-request', {
        requestId: pendingRequest._id.toString(),
        senderId: pendingRequest.senderId._id.toString(),
        senderName: pendingRequest.senderId.name,
        senderCode: pendingRequest.senderId.sixDigitCode,
      });
    }

    socket.on('connect-request', async ({ targetCode }, callback) => {
      try {
        if (!targetCode || !/^\d{6}$/.test(targetCode)) {
          return callback?.({ ok: false, error: 'Enter a valid 6-digit code' });
        }

        if (targetCode === session.sixDigitCode) {
          return callback?.({ ok: false, error: 'You cannot connect to yourself' });
        }

        const receiver = await Session.findOne({ sixDigitCode: targetCode });
        if (!receiver) {
          return callback?.({ ok: false, error: 'No user found with that code' });
        }

        if (receiver._id.toString() === userId) {
          return callback?.({ ok: false, error: 'You cannot connect to yourself' });
        }

        const existingConnection = await Connection.findOne({
          $or: [
            { userA: session._id, userB: receiver._id },
            { userA: receiver._id, userB: session._id },
          ],
        });

        if (existingConnection) {
          return callback?.({ ok: false, error: 'You are already connected to this user' });
        }

        const blocked = await isBlocked(session._id, receiver._id);
        if (blocked) {
          return callback?.({
            ok: false,
            error: 'You are blocked from connecting to this user for 3 hours.',
          });
        }

        const pendingDuplicate = await RequestLog.findOne({
          senderId: session._id,
          receiverId: receiver._id,
          status: 'pending',
        });

        if (pendingDuplicate) {
          return callback?.({ ok: false, error: 'A connection request is already pending' });
        }

        await RequestLog.deleteMany({
          senderId: session._id,
          receiverId: receiver._id,
          status: 'pending',
        });

        const requestLog = await RequestLog.create({
          senderId: session._id,
          receiverId: receiver._id,
          status: 'pending',
        });

        emitToUser(receiver._id, 'incoming-request', {
          requestId: requestLog._id.toString(),
          senderId: userId,
          senderName: session.name,
          senderCode: session.sixDigitCode,
        });

        return callback?.({ ok: true, message: 'Connection request sent' });
      } catch (error) {
        console.error('connect-request error:', error);
        return callback?.({ ok: false, error: 'Failed to send connection request' });
      }
    });

    socket.on('respond-request', async ({ requestId, status }, callback) => {
      try {
        if (!['accepted', 'rejected'].includes(status)) {
          return callback?.({ ok: false, error: 'Invalid response status' });
        }

        const requestLog = await RequestLog.findById(requestId);
        if (!requestLog) {
          return callback?.({ ok: false, error: 'Request not found' });
        }

        if (requestLog.receiverId.toString() !== userId) {
          return callback?.({ ok: false, error: 'Not authorized to respond to this request' });
        }

        if (requestLog.status !== 'pending') {
          return callback?.({ ok: false, error: 'Request is no longer pending' });
        }

        const sender = await Session.findById(requestLog.senderId);
        if (!sender) {
          return callback?.({ ok: false, error: 'Sender no longer exists' });
        }

        if (status === 'rejected') {
          requestLog.status = 'rejected';
          await requestLog.save();

          emitToUser(sender._id, 'request-rejected', {
            receiverId: userId,
            receiverName: session.name,
          });

          return callback?.({ ok: true });
        }

        await RequestLog.findByIdAndDelete(requestLog._id);

        const [userA, userB] =
          session._id.toString() < sender._id.toString()
            ? [session._id, sender._id]
            : [sender._id, session._id];

        let connection = await Connection.findOne({ userA, userB });
        if (!connection) {
          connection = await Connection.create({
            userA,
            userB,
            establishedAt: new Date(),
          });
        }

        const receiverPeer = {
          connectionId: connection._id.toString(),
          peerId: sender._id.toString(),
          name: sender.name,
          sixDigitCode: sender.sixDigitCode,
          establishedAt: connection.establishedAt,
        };

        const senderPeer = {
          connectionId: connection._id.toString(),
          peerId: userId,
          name: session.name,
          sixDigitCode: session.sixDigitCode,
          establishedAt: connection.establishedAt,
        };

        const [senderConnections, receiverConnections] = await Promise.all([
          getAcceptedConnections(sender._id),
          getAcceptedConnections(session._id),
        ]);

        emitToUser(sender._id, 'connection-success', { peer: senderPeer });
        emitToUser(session._id, 'connection-success', { peer: receiverPeer });
        emitToUser(sender._id, 'connections-updated', { connections: senderConnections });
        emitToUser(session._id, 'connections-updated', { connections: receiverConnections });

        return callback?.({ ok: true, peer: receiverPeer, connections: receiverConnections });
      } catch (error) {
        console.error('respond-request error:', error);
        return callback?.({ ok: false, error: 'Failed to respond to request' });
      }
    });

    socket.on('send-message', async ({ receiverId, messageText }, callback) => {
      try {
        const text = messageText?.trim();
        if (!text) {
          return callback?.({ ok: false, error: 'Message cannot be empty' });
        }

        const connection = await Connection.findOne({
          $or: [
            { userA: session._id, userB: receiverId },
            { userA: receiverId, userB: session._id },
          ],
        });

        if (!connection) {
          return callback?.({ ok: false, error: 'No active connection with this user' });
        }

        const message = await Message.create({
          senderId: session._id,
          receiverId,
          messageText: text,
        });

        const payload = {
          id: message._id.toString(),
          senderId: userId,
          receiverId: receiverId.toString(),
          messageText: text,
          timestamp: message.timestamp,
        };

        socket.emit('message-sent', payload);
        emitToUser(receiverId, 'message-received', payload);

        return callback?.({ ok: true, message: payload });
      } catch (error) {
        console.error('send-message error:', error);
        return callback?.({ ok: false, error: 'Failed to send message' });
      }
    });

    socket.on('update-name', async ({ name }, callback) => {
      try {
        const trimmed = name?.trim();
        if (!trimmed) {
          return callback?.({ ok: false, error: 'Name cannot be empty' });
        }

        session.name = trimmed.slice(0, 64);
        await session.save();

        const connections = await Connection.find({
          $or: [{ userA: session._id }, { userB: session._id }],
        });

        for (const conn of connections) {
          const peerId =
            conn.userA.toString() === userId ? conn.userB.toString() : conn.userA.toString();
          emitToUser(peerId, 'peer-name-updated', {
            peerId: userId,
            name: session.name,
          });
        }

        return callback?.({ ok: true, name: session.name });
      } catch (error) {
        console.error('update-name error:', error);
        return callback?.({ ok: false, error: 'Failed to update name' });
      }
    });

    socket.on('disconnect', async () => {
      onlineSockets.delete(userId);
      await Session.findByIdAndUpdate(session._id, { socketId: null });
    });
  });
}
