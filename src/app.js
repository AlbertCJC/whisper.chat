/* ═════════════════════════════════════════════════════════════════
   WHISPER — Glassmorphism Chat Client (v2.1.0, ES Modules)
   ═════════════════════════════════════════════════════════════════ */

import { getSocket } from './socket.js';
import { state } from './state.js';
import {
  EMOJIS, TOPICS,
  IDLE_WARN_MS, IDLE_CHECK_MS, MAX_MESSAGE_LENGTH, MAX_INTERESTS,
  TYPING_TIMEOUT_MS,
} from './constants.js';
import {
  $, escapeHtml, showToast, playSound, scrollToBottom, announceToScreenReader,
} from './utils.js';

// Fetch message config from Supabase
async function fetchMessageConfig() {
  try {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/app_config?id=eq.1&select=*`;
    const response = await fetch(url, {
      headers: {
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
      }
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch config: ${response.status}`);
    }
    const data = await response.json();
    if (data && Array.isArray(data) && data.length > 0) {
      const config = data[0];
      state.message = config.message ?? '';
      state.displayStart = config.display_start ?? '';
      state.displayEnd = config.display_end ?? '';
      state.adsenseClientId = config.adsense_client_id ?? '';
      state.adsenseSlot = config.adsense_slot ?? '';
    } else {
      // No config found, set defaults
      state.message = 'Display your message here';
      state.displayStart = '1970-01-01T00:00:00Z'; // past
      state.displayEnd = '9999-12-31T23:59:59Z'; // far future
      state.adsenseClientId = '';
      state.adsenseSlot = '';
    }
  } catch (err) {
    console.error('[Supabase] Error fetching message config:', err);
    // Set defaults on error
    state.message = 'Display your message here';
    state.displayStart = '1970-01-01T00:00:00Z';
    state.displayEnd = '9999-12-31T23:59:59Z';
    state.adsenseClientId = '';
    state.adsenseSlot = '';
  }
}

// Function to determine if we should show the message based on time
function shouldShowMessage() {
  if (!state.message || state.message === 'Display your message here') {
    return false;
  }
  const now = new Date();
  const start = new Date(state.displayStart);
  const end = new Date(state.displayEnd);
  return now >= start && now <= end;
}

// Render the message banner (always visible)
function renderMessageBanner() {
  const banner = document.getElementById('messageBanner');
  if (!banner) return;
  // Escape the message to prevent XSS
  banner.textContent = state.message;
  banner.classList.remove('hidden');
}

// SetUp chat view layout for sidebars (handled in CSS)
function setupChatLayout() {
  // Layout is handled via CSS in #chatView
  // This function kept for compatibility but does nothing
}

// Render ads in sidebar based on state
function renderAdsSidebar() {
  const sidebar = document.getElementById('adsSidebar');
  if (!sidebar) return;
  // Clear existing content
  sidebar.innerHTML = '';
  if (state.adsenseClientId && state.adsenseSlot) {
    const ins = document.createElement('ins');
    ins.className = 'adsbygoogle';
    ins.style.display = 'block';
    ins.setAttribute('data-ad-client', state.adsenseClientId);
    ins.setAttribute('data-ad-slot', state.adsenseSlot);
    ins.setAttribute('data-ad-format', 'auto');
    ins.setAttribute('data-full-width-responsive', 'true');
    sidebar.appendChild(ins);
    // Trigger AdSense to load the ad
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  }
}

// Render sponsored content in right sidebar
function renderRightSidebar() {
  const sidebar = document.getElementById('rightSidebar');
  if (!sidebar) return;

  // Clear existing content
  sidebar.innerHTML = '';

  // Placeholder for sponsored content
  // In a real implementation, this would fetch sponsored content from an API
  const sponsoredHTML = `
    <div class="sponsored-header">
      <h3>Sponsored</h3>
    </div>
    <div class="sponsored-content">
      <p>This space is reserved for sponsored content</p>
      <p>Check back soon for featured messages from our partners!</p>
    </div>
  `;

  sidebar.innerHTML = sponsoredHTML;
}

// ── DOM Refs (queried on init) ──────────────────────────────────
let landingView, searchingView, chatView;
let onlineCount, themeToggle;
let languageSelect, interestsInput, interestsWrap, interestsChips;
let startBtn, cancelBtn;
let rulesModal, rulesAcceptBtn;
let searchingInterests, sharedInterests, chatMessages;
let typingIndicator;
let strangerCounter, seenIndicator;
let topicPrompt, topicText, topicDismiss;
let reconnectPrompt, reconnectBtn, reconnectHomeBtn;
let messageInput, sendBtn, emojiBtn, emojiPicker;
let nextBtn, reportBtn, copyChatBtn, toast;
let nicknameInput, offlineOverlay, connectionDot;

// ── Error Boundary ──────────────────────────────────────────────
function safeHandler(fn, context) {
  return (...args) => {
    try {
      fn(...args);
    } catch (err) {
      console.error(`[Error:${context}]`, err);
      showToast('Something went wrong. Please refresh the page.');
    }
  };
}

// ── View Switching ─────────────────────────────────────────────
function setView(view) {
  state.view = view;
  landingView.classList.add('hidden');
  searchingView.classList.add('hidden');
  chatView.classList.add('hidden');

  if (view !== 'chatting') {
    stopIdleMonitor();
    chatView.classList.remove('partner-typing');
  }

  switch (view) {
    case 'landing':
      landingView.classList.remove('hidden');
      startBtn?.focus();
      break;
    case 'searching':
      searchingView.classList.remove('hidden');
      restartRings();
      break;
    case 'chatting':
      chatView.classList.remove('hidden');
      break;
  }
}

// Force CSS animations to restart after display:none removes them
/*
function restartRings() {
  const container = searchingView.querySelector('.searching-rings');
  if (container) {
    container.classList.remove('animating');
    void container.offsetHeight; // force reflow
    container.classList.add('animating');
  }
}
*/
function restartRings() {
  const container = searchingView.querySelector('.searching-rings');
  if (container) {
    container.style.animationPlayState = 'paused';
    void container.offsetHeight; // force reflow
    container.style.animationPlayState = 'running';
  }
}

// ── Connection Status ──────────────────────────────────────────
function setConnectionStatus(status) {
  if (!connectionDot) return;
  connectionDot.className = 'connection-dot ' + status;
  connectionDot.setAttribute('aria-label', status === 'connected' ? 'Connected' : 'Disconnected');
}

// ── Render Message ─────────────────────────────────────────────
function renderMessage(text, sender) {
  const emptyEl = chatMessages.querySelector('.chat-empty');
  if (emptyEl) emptyEl.remove();

  const msgDiv = document.createElement('div');
  msgDiv.className = `message message-${sender}`;

  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  msgDiv.innerHTML = `
    <span class="message-text">${escapeHtml(text)}</span>
    <div class="message-time">${time}</div>
  `;

  chatMessages.appendChild(msgDiv);
  scrollToBottom(chatMessages);
}

// ── Typing ─────────────────────────────────────────────────────
function clearTyping() {
  typingIndicator.classList.add('hidden');
  chatView.classList.remove('partner-typing');
  clearTimeout(state.strangerTypingTimeout);
}

// ── Idle Monitor ──────────────────────────────────────────────
let idleInterval = null;

function startIdleMonitor() {
  stopIdleMonitor();
  state.lastActivityTime = Date.now();
  state.idleWarningShown = false;
  idleInterval = setInterval(safeHandler(() => {
    if (state.view !== 'chatting') return;
    const elapsed = Date.now() - state.lastActivityTime;
    if (elapsed >= IDLE_WARN_MS && !state.idleWarningShown) {
      state.idleWarningShown = true;
      showToast('Still there? Your stranger is waiting...');
    }
    if (elapsed >= IDLE_WARN_MS + 60_000) {
      showToast('Idle too long — disconnecting.');
      getSocket().emit('next');
      stopIdleMonitor();
    }
  }, 'idle-monitor'), IDLE_CHECK_MS);
}

function stopIdleMonitor() {
  if (idleInterval) {
    clearInterval(idleInterval);
    idleInterval = null;
  }
}

// ── Send Message ───────────────────────────────────────────────
function sendMessage() {
  const socket = getSocket();
  const text = messageInput.value.trim();
  if (!text) return;
  if (state.view !== 'chatting') {
    showToast('You\'re not connected to anyone.');
    return;
  }

  renderMessage(text, 'self');
  socket.emit('chat-message', { text });

  messageInput.value = '';
  messageInput.style.height = 'auto';
  sessionStorage.removeItem('messageDraft');
  state.messageCount++;
  state.lastActivityTime = Date.now();
  state.idleWarningShown = false;
  dismissTopicPrompt();
  playSound('sent');
}

// ── Seen Indicator ─────────────────────────────────────────────
function emitSeen() {
  if (state.view !== 'chatting') return;
  getSocket().emit('seen');
}

function hideSeenIndicator() {
  seenIndicator.classList.add('hidden');
}

// ── Stranger Counter ───────────────────────────────────────────
function updateStrangerCounter() {
  const name = state.strangerNickname || 'Stranger';
  strangerCounter.textContent = state.strangerCount > 1
    ? `${name} #${state.strangerCount}`
    : name;
  strangerCounter.classList.remove('hidden');
}

// ── Interest Tags ──────────────────────────────────────────────
function addInterest(tag) {
  const normalized = tag.toLowerCase().trim();
  if (!normalized || state.interests.includes(normalized) || state.interests.length >= MAX_INTERESTS) return;

  state.interests.push(normalized);
  renderChips();
}

function removeInterest(tag) {
  state.interests = state.interests.filter(t => t !== tag);
  renderChips();
}

function renderChips() {
  interestsChips.innerHTML = state.interests
    .map(tag => `
      <span class="interest-chip">
        ${escapeHtml(tag)}
        <button class="interest-chip-remove" data-tag="${escapeHtml(tag)}" aria-label="Remove ${escapeHtml(tag)}">×</button>
      </span>`)
    .join('');

  interestsChips.querySelectorAll('.interest-chip-remove').forEach(btn => {
    btn.addEventListener('click', safeHandler((e) => {
      e.stopPropagation();
      removeInterest(btn.dataset.tag);
    }, 'remove-interest'));
  });
}

// ── Emoji Picker ───────────────────────────────────────────────
function buildEmojiPicker() {
  EMOJIS.forEach(emoji => {
    const btn = document.createElement('button');
    btn.className = 'emoji-item';
    btn.textContent = emoji;
    btn.addEventListener('click', safeHandler(() => {
      messageInput.value += emoji;
      messageInput.focus();
      emojiPicker.classList.add('hidden');
    }, 'emoji-pick'));
    emojiPicker.appendChild(btn);
  });
}

// ── Topic Prompts ──────────────────────────────────────────────
function showNewTopic() {
  if (state.messageCount > 0) return;
  const topic = TOPICS[Math.floor(Math.random() * TOPICS.length)];
  topicText.textContent = topic;
  topicPrompt.classList.remove('hidden');
}

function dismissTopicPrompt() {
  topicPrompt.classList.add('hidden');
}

// ── Reconnect Prompt ───────────────────────────────────────────
function showReconnectPrompt() {
  if (state.view === 'searching') return;
  reconnectPrompt.classList.remove('hidden');
}

// ── Theme Toggle ───────────────────────────────────────────────
function applyTheme(theme) {
  document.body.classList.remove('light', 'dark');
  document.body.classList.add(theme);
  localStorage.setItem('whisper-theme', theme);
  themeToggle.setAttribute('aria-label', theme === 'dark' ? 'Toggle light mode' : 'Toggle dark mode');
}

// ── Rules Modal ────────────────────────────────────────────────
function showRulesModal() {
  const accepted = sessionStorage.getItem('whisper-rules-accepted');
  if (accepted) return;
  rulesModal.classList.remove('hidden');
}

// ── Wire Socket Events ─────────────────────────────────────────
function wireSocketEvents(socket) {
  socket.on('connect', safeHandler(() => {
    setConnectionStatus('connected');
    offlineOverlay?.classList.add('hidden');
  }, 'socket-connect'));

  socket.on('disconnect', safeHandler(() => {
    setConnectionStatus('disconnected');
    offlineOverlay?.classList.remove('hidden');
    showToast('Connection lost. Reconnecting...');
    announceToScreenReader('Connection lost. Reconnecting...');
  }, 'socket-disconnect'));

  socket.on('stranger-count', safeHandler((data) => {
    onlineCount.textContent = data.count;
  }, 'stranger-count'));

  socket.on('searching', safeHandler(() => {
    setView('searching');
    searchingInterests.textContent = state.interests.length > 0
      ? `Looking for someone who likes: ${state.interests.join(', ')}`
      : 'Looking for anyone...';
    announceToScreenReader('Searching for a chat partner');
  }, 'searching'));

  socket.on('stranger-found', safeHandler(({ interests, nickname }) => {
    setView('chatting');

    state.strangerCount++;
    state.messageCount = 0;
    state.lastActivityTime = Date.now();
    state.idleWarningShown = false;
    state.strangerNickname = nickname || 'Stranger';
    updateStrangerCounter();
    hideSeenIndicator();
    startIdleMonitor();

    if (interests && interests.length > 0) {
      sharedInterests.innerHTML = interests
        .map(i => `<span class="shared-interest">${escapeHtml(i)}</span>`)
        .join('');
    } else {
      sharedInterests.innerHTML = '';
    }

    chatMessages.innerHTML = `
      <div class="chat-empty">
        <svg class="chat-empty-icon" viewBox="0 0 48 48" fill="none" aria-hidden="true">
          <circle cx="24" cy="24" r="20" stroke="currentColor" stroke-width="1" opacity="0.12"/>
          <circle cx="24" cy="24" r="14" stroke="currentColor" stroke-width="1" opacity="0.2"/>
          <circle cx="24" cy="24" r="8" fill="currentColor" opacity="0.3"/>
        </svg>
        <p>You're connected. Say hello!</p>
      </div>`;

    reconnectPrompt.classList.add('hidden');
    dismissTopicPrompt();
    showNewTopic();

    // Restore draft message if any
    const draft = sessionStorage.getItem('messageDraft');
    if (draft) {
      messageInput.value = draft;
      sessionStorage.removeItem('messageDraft');
    }

    messageInput.focus();
    playSound('connect');
    showToast(`You're now chatting with ${state.strangerNickname}!`);
    announceToScreenReader(`Connected with ${state.strangerNickname}`);
  }, 'stranger-found'));

  socket.on('chat-message', safeHandler(({ text }) => {
    renderMessage(text, 'stranger');
    clearTyping();
    state.messageCount++;
    playSound('message');
    announceToScreenReader('New message received');
  }, 'chat-message'));

  socket.on('stranger-typing', safeHandler(() => {
    typingIndicator.classList.remove('hidden');
    chatView.classList.add('partner-typing');
    clearTimeout(state.strangerTypingTimeout);
    state.strangerTypingTimeout = setTimeout(safeHandler(() => {
      typingIndicator.classList.add('hidden');
      chatView.classList.remove('partner-typing');
    }, 'typing-timeout'), TYPING_TIMEOUT_MS);
  }, 'stranger-typing'));

  socket.on('stranger-disconnected', safeHandler(() => {
    stopIdleMonitor();
    showToast('Stranger disconnected. Find someone new!');
    playSound('disconnect');
    showReconnectPrompt();
    announceToScreenReader(`${state.strangerNickname} disconnected`);
  }, 'stranger-disconnected'));

  socket.on('stranger-seen', safeHandler(() => {
    seenIndicator.classList.remove('hidden');
  }, 'stranger-seen'));

  socket.on('report-confirmed', safeHandler(() => {
    showToast('Thank you. Your report has been submitted.');
  }, 'report-confirmed'));

  socket.on('error', safeHandler(({ message }) => {
    showToast(message || 'An error occurred.');
  }, 'socket-error'));
}

// ── Wire DOM Event Listeners ──────────────────────────────────
function wireDomEvents(socket) {
  // Message input
  messageInput.addEventListener('input', safeHandler(() => {
    messageInput.style.height = 'auto';
    messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
    socket.emit('typing');
    // Save draft
    sessionStorage.setItem('messageDraft', messageInput.value);
  }, 'message-input'));

  messageInput.addEventListener('keydown', safeHandler((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }, 'message-keydown'));

  // Seen events
  chatMessages.addEventListener('scroll', emitSeen, { once: false });
  messageInput.addEventListener('focus', emitSeen);
  chatMessages.addEventListener('click', emitSeen);

  // Send button
  sendBtn.addEventListener('click', safeHandler(() => {
    sendMessage();
  }, 'send-btn'));

  // Interest input
  interestsInput.addEventListener('keydown', safeHandler((e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = interestsInput.value.replace(/,/g, '').trim();
      if (val) addInterest(val);
      interestsInput.value = '';
    }
    if (e.key === 'Backspace' && interestsInput.value === '' && state.interests.length > 0) {
      removeInterest(state.interests[state.interests.length - 1]);
    }
  }, 'interest-input'));

  interestsWrap.addEventListener('click', safeHandler(() => interestsInput.focus(), 'interest-wrap'));

  // Nickname input
  nicknameInput?.addEventListener('input', safeHandler(() => {
    state.myNickname = nicknameInput.value.trim();
  }, 'nickname-input'));

  // Start / Cancel / Next buttons
  startBtn.addEventListener('click', safeHandler(() => {
    const language = languageSelect.value || '';
    socket.emit('find-stranger', {
      interests: [...state.interests],
      language,
      nickname: state.myNickname,
    });
  }, 'start-btn'));

  cancelBtn.addEventListener('click', safeHandler(() => {
    socket.emit('cancel-search');
    setView('landing');
    reconnectPrompt.classList.add('hidden');
  }, 'cancel-btn'));

  nextBtn.addEventListener('click', safeHandler(() => {
    hideSeenIndicator();
    reconnectPrompt.classList.add('hidden');
    dismissTopicPrompt();
    // Send any unsent text as a goodbye message before leaving
    const draft = messageInput.value.trim();
    if (draft) {
      renderMessage(draft, 'self');
      socket.emit('chat-message', { text: draft });
      messageInput.value = '';
      messageInput.style.height = 'auto';
      sessionStorage.removeItem('messageDraft');
    }
    stopIdleMonitor();
    socket.emit('next');
  }, 'next-btn'));

  // Reconnect buttons
  reconnectBtn.addEventListener('click', safeHandler(() => {
    hideSeenIndicator();
    reconnectPrompt.classList.add('hidden');
    dismissTopicPrompt();

    const language = languageSelect.value || '';
    socket.emit('find-stranger', {
      interests: [...state.interests],
      language,
      nickname: state.myNickname,
    });
  }, 'reconnect-btn'));

  reconnectHomeBtn.addEventListener('click', safeHandler(() => {
    hideSeenIndicator();
    reconnectPrompt.classList.add('hidden');
    dismissTopicPrompt();
    socket.emit('cancel-search');
    setView('landing');
  }, 'reconnect-home-btn'));

  // Report button
  reportBtn.addEventListener('click', safeHandler(() => {
    if (state.view !== 'chatting') {
      showToast('You\'re not chatting with anyone.');
      return;
    }
    if (!socket.connected) {
      showToast('Connection lost. Please refresh.');
      return;
    }
    if (!reconnectPrompt.classList.contains('hidden')) {
      showToast('You\'re no longer connected to this person.');
      return;
    }
    socket.emit('report');
  }, 'report-btn'));

  // Copy chat button
  copyChatBtn.addEventListener('click', safeHandler(() => {
    if (state.view !== 'chatting') {
      showToast('No chat to copy.');
      return;
    }

    const messages = chatMessages.querySelectorAll('.message');
    if (messages.length === 0) {
      showToast('No messages to copy.');
      return;
    }

    let transcript = '';
    messages.forEach(msg => {
      const sender = msg.classList.contains('message-self') ? 'You' : (state.strangerNickname || 'Stranger');
      const text = msg.querySelector('.message-text')?.textContent || '';
      const time = msg.querySelector('.message-time')?.textContent || '';
      transcript += `[${time}] ${sender}: ${text}\n`;
    });

    navigator.clipboard.writeText(transcript).then(() => {
      showToast('Chat copied to clipboard!');
    }).catch(() => {
      showToast('Failed to copy chat.');
    });
  }, 'copy-chat-btn'));

  // Emoji toggle
  emojiBtn.addEventListener('click', safeHandler(() => {
    emojiPicker.classList.toggle('hidden');
  }, 'emoji-toggle'));

  document.addEventListener('click', safeHandler((e) => {
    if (!emojiPicker.contains(e.target) && e.target !== emojiBtn && !emojiBtn.contains(e.target)) {
      emojiPicker.classList.add('hidden');
    }
  }, 'emoji-close'));

  // Theme toggle
  themeToggle.addEventListener('click', safeHandler(() => {
    const next = document.body.classList.contains('dark') ? 'light' : 'dark';
    applyTheme(next);
  }, 'theme-toggle'));

  // Rules modal
  rulesAcceptBtn.addEventListener('click', safeHandler(() => {
    sessionStorage.setItem('whisper-rules-accepted', 'true');
    rulesModal.classList.add('hidden');
    startBtn?.focus();
  }, 'rules-accept'));

  // Topic dismiss
  topicDismiss.addEventListener('click', safeHandler(() => dismissTopicPrompt(), 'topic-dismiss'));
}

// ── Init ───────────────────────────────────────────────────────
export async function init() {
  // Query all DOM refs
  landingView = $('#landingView');
  searchingView = $('#searchingView');
  chatView = $('#chatView');
  onlineCount = $('#onlineCount');
  themeToggle = $('#themeToggle');
  languageSelect = $('#languageSelect');
  interestsInput = $('#interestsInput');
  interestsWrap = $('#interestsWrap');
  interestsChips = $('#interestsChips');
  startBtn = $('#startBtn');
  cancelBtn = $('#cancelSearchBtn');
  rulesModal = $('#rulesModal');
  rulesAcceptBtn = $('#rulesAcceptBtn');
  searchingInterests = $('#searchingInterests');
  sharedInterests = $('#sharedInterests');
  chatMessages = $('#chatMessages');
  typingIndicator = $('#typingIndicator');
  strangerCounter = $('#strangerCounter');
  seenIndicator = $('#seenIndicator');
  topicPrompt = $('#topicPrompt');
  topicText = $('#topicText');
  topicDismiss = $('#topicDismiss');
  reconnectPrompt = $('#reconnectPrompt');
  reconnectBtn = $('#reconnectBtn');
  reconnectHomeBtn = $('#reconnectHomeBtn');
  messageInput = $('#messageInput');
  sendBtn = $('#sendBtn');
  emojiBtn = $('#emojiBtn');
  emojiPicker = $('#emojiPicker');
  nextBtn = $('#nextBtn');
  reportBtn = $('#reportBtn');
  copyChatBtn = $('#copyChatBtn');
  toast = $('#toast');
  nicknameInput = $('#nicknameInput');
  offlineOverlay = $('#offlineOverlay');
  connectionDot = $('#connectionDot');

  // Set up chat layout for ads sidebar
  setupChatLayout();

// Fetch and render message config
  await fetchMessageConfig();
  renderMessageBanner();
  renderAdsSidebar();
  renderRightSidebar();

  // Theme
  const saved = localStorage.getItem('whisper-theme') || 'dark';
  applyTheme(saved);

  // Build UI
  buildEmojiPicker();
  showRulesModal();

  // Wire everything
  const socket = getSocket();
  wireSocketEvents(socket);
  wireDomEvents(socket);
}
