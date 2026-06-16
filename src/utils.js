// ── Utilities ───────────────────────────────────────────────────

import { TOAST_DURATION_MS } from './constants.js';
import DOMPurify from 'dompurify';

// ── DOM helper ────────────────────────────────────────────────
export function $(sel) {
  return document.querySelector(sel);
}

// ── XSS Sanitization ────────────────────────────────────────────
export function sanitize(str) {
  if (!str || typeof str !== 'string') return '';
  return DOMPurify.sanitize(str, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}

// Keep escapeHtml as alias for backward compatibility
export function escapeHtml(str) {
  return sanitize(str);
}

// ── Toast Notifications ───────────────────────────────────────
let toastTimer;

export function showToast(msg) {
  const toast = document.querySelector('#toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toast.style.animation = 'none';
  void toast.offsetHeight;
  toast.style.animation = '';
  toastTimer = setTimeout(() => toast.classList.add('hidden'), TOAST_DURATION_MS);
}

// ── Scroll Helper ─────────────────────────────────────────────
export function scrollToBottom(container) {
  requestAnimationFrame(() => {
    container.scrollTop = container.scrollHeight;
  });
}

// ── Screen Reader Announcements ────────────────────────────────
export function announceToScreenReader(message) {
  const el = document.querySelector('#srAnnouncer');
  if (!el) return;
  el.textContent = ''; // clear first to re-trigger announcement
  requestAnimationFrame(() => { el.textContent = message; });
}

// ── Sound Notifications (Web Audio API) ───────────────────────
// Only plays sounds when tab is not focused (background tab notification)

const Sound = {
  ctx: null,

  getContext() {
    if (this.ctx) return this.ctx;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (_) {
      return null;
    }
    return this.ctx;
  },

  async play(type) {
    // Only play sound when the tab is in the background
    if (document.visibilityState === 'visible') return;

    const ctx = this.getContext();
    if (!ctx) return;

    // Resume context if suspended (autoplay policy)
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    switch (type) {
      case 'connect':
        // Two-tone ascending "ding-ding" — match found
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523, now);       // C5
        osc.frequency.setValueAtTime(659, now + 0.12); // E5
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
        break;

      case 'message':
      case 'message_sfx':
        // Short blip — new message
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now); // A5
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.12);
        break;

      case 'disconnect':
        // Two-tone descending — stranger left
        osc.type = 'sine';
        osc.frequency.setValueAtTime(659, now);       // E5
        osc.frequency.setValueAtTime(523, now + 0.12); // C5
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
        break;

      case 'sent':
        // Subtle rising tick — message sent confirmation
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, now); // D6
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.06);
        osc.start(now);
        osc.stop(now + 0.07);
        break;
    }
  }
};

export function playSound(type) {
  Sound.play(type);
}
