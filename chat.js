import WebSocket, { WebSocketServer } from 'ws';
import { randomUUID } from 'node:crypto';

const MAX_MESSAGE = 2000;
const MAX_PAYLOAD = 250000;
const MAX_HISTORY = 50;
const MAX_PER_ROOM = 50;
const MAX_MUTE_MINUTES = 60;

const rooms = new Map();

function room(code) {
  if (!rooms.has(code)) rooms.set(code, { clients: new Set(), history: [], members: new Map(), bans: new Map(), ownerId: null });
  return rooms.get(code);
}

function nickKey(value) {
  return String(value).trim().toLowerCase();
}

function send(socket, payload) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
}

function broadcast(code, payload) {
  const current = rooms.get(code);
  if (!current) return;
  if (payload.type === 'message') {
    current.history.push(payload);
    if (current.history.length > MAX_HISTORY) current.history.shift();
  }
  current.clients.forEach(client => send(client, payload));
}

function users(code) {
  const current = rooms.get(code);
  return [...(current?.clients ?? [])].map(client => {
    const member = current.members.get(client.peerId);
    return {
      id: client.peerId,
      name: client.nick,
      role: member?.role || (client.peerId === current.ownerId ? 'owner' : 'member'),
      mutedUntil: member?.mutedUntil || 0
    };
  });
}

function presence(code, text) {
  const current = rooms.get(code);
  if (!current) return;
  broadcast(code, { type: 'presence', text, users: users(code), ownerId: current.ownerId });
}

export const chat = new WebSocketServer({ noServer: true, maxPayload: 250000 });

chat.on('connection', socket => {
  socket.code = null;
  socket.nick = null;
  socket.peerId = randomUUID();
  socket.on('error', () => {});

  socket.on('message', raw => {
    let data;
    try {
      data = JSON.parse(raw.toString().slice(0, MAX_PAYLOAD));
    } catch {
      return;
    }

    if (data.type === 'join') {
      const code = String(data.room ?? '').trim().toLowerCase().slice(0, 32);
      const nick = String(data.name ?? '').trim().slice(0, 24) || 'anon';
      if (!code) return send(socket, { type: 'error', text: 'Room name required.' });

      const target = room(code);
      if (target.clients.size >= MAX_PER_ROOM) {
        return send(socket, { type: 'error', text: 'That room is full.' });
      }
      if (target.bans.has(nickKey(nick))) {
        send(socket, { type: 'error', text: 'You are banned from that room.' });
        return socket.close(4003, 'Banned');
      }

      socket.code = code;
      socket.nick = nick;
      if (!target.ownerId) target.ownerId = socket.peerId;
      target.members.set(socket.peerId, {
        id: socket.peerId,
        name: nick,
        role: target.ownerId === socket.peerId ? 'owner' : 'member',
        mutedUntil: 0
      });
      target.clients.add(socket);

      send(socket, { type: 'joined', room: code, name: nick, peerId: socket.peerId, role: target.members.get(socket.peerId).role, ownerId: target.ownerId, history: target.history, users: users(code) });
      presence(code, `${nick} joined`);
      return;
    }

    if (data.type === 'message' && socket.code) {
      const current = rooms.get(socket.code);
      const member = current?.members.get(socket.peerId);
      if (member?.mutedUntil > Date.now()) {
        return send(socket, { type: 'error', text: `You are muted for ${Math.ceil((member.mutedUntil - Date.now()) / 60000)} more minute(s).` });
      }
      const text = String(data.text ?? '').trim().slice(0, MAX_MESSAGE);
      if (!text) return;
      broadcast(socket.code, { type: 'message', name: socket.nick, text, at: Date.now() });
      return;
    }

    if (data.type === 'moderation' && socket.code) {
      const current = rooms.get(socket.code);
      const actor = current?.members.get(socket.peerId);
      const canModerate = actor?.role === 'owner' || actor?.role === 'moderator';
      if (!current || !canModerate) return send(socket, { type: 'error', text: 'Only the owner or a moderator can moderate members.' });

      const targetId = String(data.targetId ?? '').slice(0, 64);
      const targetSocket = [...current.clients].find(client => client.peerId === targetId);
      const targetMember = targetSocket && current.members.get(targetSocket.peerId);
      if (!targetSocket || !targetMember || targetSocket === socket) return send(socket, { type: 'error', text: 'Choose another member first.' });

      const action = String(data.action ?? '').toLowerCase();
      if (action === 'promote') {
        if (actor.role !== 'owner' || targetMember.role !== 'member') {
          return send(socket, { type: 'error', text: 'Only the owner can promote a member to moderator.' });
        }
        targetMember.role = 'moderator';
        send(socket, { type: 'moderation-result', text: `${targetSocket.nick} is now a moderator.` });
        presence(socket.code, `${targetSocket.nick} was promoted to moderator`);
      } else if (actor.role === 'moderator' && targetMember.role !== 'member') {
        return send(socket, { type: 'error', text: 'Moderators can only manage regular members.' });
      } else if (action === 'mute') {
        const minutes = Math.min(Math.max(Number(data.minutes) || 5, 1), MAX_MUTE_MINUTES);
        targetMember.mutedUntil = Date.now() + minutes * 60000;
        send(targetSocket, { type: 'muted', until: targetMember.mutedUntil });
        send(socket, { type: 'moderation-result', text: `${targetSocket.nick} muted for ${minutes} minute(s).` });
        presence(socket.code, `${targetSocket.nick} was muted`);
      } else if (action === 'kick' || action === 'ban') {
        if (action === 'ban') current.bans.set(nickKey(targetSocket.nick), Date.now());
        const actorLabel = actor.role === 'owner' ? 'room owner' : 'moderator';
        send(targetSocket, { type: 'kicked', reason: action === 'ban' ? `You were banned by the ${actorLabel}.` : `You were kicked by the ${actorLabel}.` });
        send(socket, { type: 'moderation-result', text: `${targetSocket.nick} ${action === 'ban' ? 'banned' : 'kicked'}.` });
        targetSocket.close(action === 'ban' ? 4003 : 4004, action === 'ban' ? 'Banned' : 'Kicked');
      }
      return;
    }
  });

  socket.on('close', () => {
    const current = rooms.get(socket.code);
    if (!current) return;
    current.clients.delete(socket);
    current.members.delete(socket.peerId);
    if (!current.clients.size) return rooms.delete(socket.code);
    if (current.ownerId === socket.peerId) {
      const nextOwner = [...current.clients][0];
      current.ownerId = nextOwner?.peerId || null;
      if (nextOwner) current.members.get(nextOwner.peerId).role = 'owner';
    }
    presence(socket.code, `${socket.nick} left`);
  });
});
