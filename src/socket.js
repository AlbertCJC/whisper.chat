// ── Socket.IO Client ────────────────────────────────────────────

import { io } from 'socket.io-client';

let socket;

export function initSocket() {
  const serverUrl = import.meta.env.VITE_SERVER_URL || undefined;

  socket = io(serverUrl, {
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    timeout: 10000,
  });

  return socket;
}

export function getSocket() {
  if (!socket) throw new Error('Socket not initialized. Call initSocket() first.');
  return socket;
}