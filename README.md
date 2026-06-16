# Whisper Web

Vite-based front-end for the Whisper anonymous random chat application. Connects to [whisper-server](../whisper-backend) via Socket.IO for an Omegle-style chat experience with glassmorphism design.

## Quick Start

```bash
npm install
npm run dev        # → http://localhost:5173
npm run build      # production build to dist/
npm run preview    # preview production build
```

The dev server proxies `/socket.io` to the back-end at `http://localhost:3000`. Make sure [whisper-server](../whisper-backend) is running.

## Architecture

```
src/
├── main.js       # Entry: import CSS, init socket, bootstrap app
├── app.js        # UI logic: view switching, messages, theme, modals
├── socket.js     # Socket.IO client creation & connection config
├── style.css     # Glassmorphism design system (dark/light)
├── state.js      # Singleton state object
├── constants.js  # EMOJIS, TOPICS, timer values
└── utils.js      # escapeHtml, showToast, playSound, scrollToBottom
```

- **Framework:** Vanilla JS with ES modules (no React/Vue/Svelte)
- **Build:** Vite with dev proxy to `whisper-server`
- **Design:** Glassmorphism — frosted glass, backdrop blur, dark-first
- **Typography:** Inter (Google Fonts)

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_SERVER_URL` | `http://localhost:3000` | Back-end URL (only needed in production; dev uses Vite proxy) |

## Features

- Anonymous random chat with interest-based matching
- Dark/light theme toggle (persisted in localStorage)
- Rules modal (shown once per session via sessionStorage)
- Interest chips — add with Enter/comma, remove with × or Backspace
- Emoji picker
- Typing & seen indicators
- Report, copy chat, reconnect prompts
- Topic prompts for conversation starters
- Stranger counter across rematches
- Idle warning & auto-disconnect
- Real-time online count

## Testing

```bash
npm run test:ui          # 31 real E2E tests (auto-starts both servers)
npm run test:ui:headed   # Run with browser visible for debugging
```

Tests use Playwright with two browser contexts simulating real strangers chatting through the actual back-end. No mocks. See `playwright.config.cjs` for server auto-start config.

### Test Coverage

| Area | Tests |
|------|-------|
| Landing page & rules modal | 7 |
| Two-stranger chat flow | 11 |
| Theme persistence | 2 |
| Emoji picker | 2 |
| Topic prompt | 1 |
| Edge cases | 8 |