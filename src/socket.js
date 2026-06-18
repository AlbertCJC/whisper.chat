// ── Whisper WebSocket Client ───────────────────────────────────────
// Replaces socket.io-client with a raw WebSocket + JSON protocol.
// Provides the same emit/on interface the app expects.

let socket;

export function initSocket() {
  const serverUrl = import.meta.env.VITE_SERVER_URL || '';

  socket = new WhisperSocket(serverUrl);
  socket.connect();
  return socket;
}

export function getSocket() {
  if (!socket) throw new Error('Socket not initialized. Call initSocket() first.');
  return socket;
}

class WhisperSocket {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.listeners = new Map();       // event → Set<callback>
    this.reconnectAttempts = 0;
    this.reconnectDelay = 1000;
    this.reconnectDelayMax = 10000;
    this.reconnectTimer = null;
    this._isClosing = false;
    this._connectError = null;        // Track last connect error
  }

  // ── Connection ────────────────────────────────────────────────
  connect() {
    this._isClosing = false;
    this._connectError = null;

    // Build WebSocket URL from the server URL
    let wsUrl;
    if (this.url) {
      const parsed = new URL(this.url);
      wsUrl = (parsed.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + parsed.host;
    } else {
      // Default to current origin
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      wsUrl = protocol + '//' + location.host;
    }

    try {
      this.ws = new WebSocket(wsUrl);
    } catch (err) {
      this._connectError = err;
      console.error('[ws] Failed to create WebSocket:', err);
      this._emit('connect_error', { message: err.message });
      this._scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.reconnectDelay = 1000;
      this._connectError = null;
      this._emit('connect');
    };

    this.ws.onmessage = (event) => {
      if (typeof event.data !== 'string') return;
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      // Dispatch by type field
      if (msg.type) {
        this._emit(msg.type, msg);
      }
    };

    this.ws.onclose = () => {
      this._emit('disconnect');
      if (!this._isClosing) {
        this._scheduleReconnect();
      }
    };

    this.ws.onerror = (err) => {
      console.error('[ws] Error:', err);
      // Map websocket error to connect_error for Socket.IO compatibility
      if (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN) {
        this._connectError = err;
        this._emit('connect_error', { message: err.message });
      }
    };
  }

  // ── Public API (matches Socket.IO interface) ───────────────────
  emit(event, data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const msg = { type: event, ...data };
      this.ws.send(JSON.stringify(msg));
    }
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
  }

  off(event, callback) {
    if (!this.listeners.has(event)) return;
    if (callback) {
      this.listeners.get(event).delete(callback);
    } else {
      this.listeners.delete(event);
    }
  }

  get connected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  disconnect() {
    this._isClosing = true;
    clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.close();
    }
  }

  // For compatibility — init() is called by main.js
  init() {
    // no-op, already connected in constructor
  }

  // ── Internal ───────────────────────────────────────────────────
  _emit(event, ...args) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      for (const cb of callbacks) {
        try {
          cb(...args);
        } catch (err) {
          console.error(`[ws] Error in listener for ${event}:`, err);
        }
      }
    }
  }

  _scheduleReconnect() {
    clearTimeout(this.reconnectTimer);
    this.reconnectAttempts++;
    const delay = Math.min(this.reconnectDelay * this.reconnectAttempts, this.reconnectDelayMax);
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }
}
