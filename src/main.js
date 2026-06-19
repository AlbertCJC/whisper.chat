// ── Application Entry Point ──────────────────────────────────────
// Importing CSS triggers Vite to process it
import './style.css';

import { initSocket } from './socket.js';
import { init } from './app.js';
import { showToast } from './utils.js';

// Initialize socket connection
const socket = initSocket();

// Bootstrap the app once connected
socket.on('connect', async () => {
  await init();
});

// Handle connection errors gracefully
socket.on('connect_error', (err) => {
  console.error('Socket connection failed:', err.message);
  if (err.message.includes('xhr poll error')) {
    console.warn('Server may be offline. Retrying...');
  }
});

// Detect online/offline
window.addEventListener('online', () => {
  if (!socket.connected) {
    socket.connect();
  }
});

window.addEventListener('offline', () => {
  showToast('You are offline. Please check your connection.');
});