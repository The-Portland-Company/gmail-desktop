# Gmail Desktop

A lightweight macOS Electron wrapper for Gmail, built for The Portland Company.

## Download

**[⬇️ Gmail-1.0.1.dmg](https://github.com/The-Portland-Company/gmail-desktop/releases/download/v1.0.1/Gmail-1.0.1.dmg)** — latest build (see [all releases](https://github.com/The-Portland-Company/gmail-desktop/releases)).

Open the DMG, drag **Gmail** into **Applications**. On first launch, right-click the app → **Open** (it's ad-hoc signed, so Gatekeeper asks once).

## Features

- Dark **email bodies** (via Dark Reader) — not just Gmail's dark chrome.
- Dock unread badge and native notifications.
- External links open in your **default browser** (Gmail's redirector links included).
- Message grouping by **Sender / Label / Label → Sender**, inline in the toolbar.
- **Bartok** chat widget (bottom-right) wired to your local Claude Code session, with persisted, switchable chat sessions.

## Build

See `main.js`, `preload.js`, and `plugins/`. Rebuild the installed bundle by copying the app files into `/Applications/Gmail.app/Contents/Resources/app/` and re-signing with `codesign --force --deep --sign -`.
