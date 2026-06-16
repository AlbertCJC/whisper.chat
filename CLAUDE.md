# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

**Whisper Web** is the Vite-based front-end for the Whisper anonymous random chat application. It connects to the `whisper-server` Socket.IO back-end to provide an Omegle-style chat experience with glassmorphism design.

## Architecture

```
whisper-web/
├── index.html          # Vite entry point (SPA shell)
├── vite.config.js      # Dev proxy & build config
├── package.json        # Dependencies (socket.io-client, vite)
└── src/
    ├── main.js         # Entry: import CSS, init socket, bootstrap app
    ├── app.js          # UI logic: view switching, idle monitor, theme, etc.
    ├── socket.js       # Socket.IO client creation & connection config
    ├── style.css       # Glassmorphism design system (dark/light)
    ├── state.js        # Singleton state object
    ├── constants.js    # EMOJIS, TOPICS, timer values
    └── utils.js        # escapeHtml, showToast, playSound, scrollToBottom
```

- **Framework**: Vanilla JS with ES modules (no React/Vue/Svelte)
- **Build**: Vite with dev proxy to `whisper-server`
- **Design**: Glassmorphism — frosted glass, backdrop blur, dark-first
- **Typography**: Inter (Google Fonts, linked in index.html)

## How to Run

```bash
npm install            # Install dependencies (socket.io-client, vite)
npm run dev            # Start Vite dev server at http://localhost:5173
npm run build          # Production build to dist/
npm run preview        # Preview production build
```

The Vite dev server proxies `/socket.io` WebSocket connections to the back-end at `http://localhost:3000` (configured via `VITE_SERVER_URL` env var).

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_SERVER_URL` | `http://localhost:3000` | Back-end Socket.IO server URL |

In dev mode, leave `VITE_SERVER_URL` unset — the Vite proxy handles WebSocket connections to avoid CORS issues. In production, set it to the deployed back-end URL at build time.

## Socket.IO Events

See `whisper-server/CLAUDE.md` for the full event protocol.
The client in `src/socket.js` creates the connection and `src/app.js` wires all event handlers to the UI.