# Gmail + AI Chatbot (Desktop)

A lightweight macOS Electron wrapper for Gmail with a built-in **Bartok** AI chat
widget wired to your own local [Claude Code](https://claude.com/claude-code)
session — so you can tell it to triage, clean up, and act on your inbox in plain
language. Open source, MIT licensed, built by The Portland Company.

## Download

**[⬇️ Gmail-1.0.1.dmg](https://github.com/The-Portland-Company/gmail-desktop/releases/download/v1.0.1/Gmail-1.0.1.dmg)** — latest build (see [all releases](https://github.com/The-Portland-Company/gmail-desktop/releases)).

Open the DMG, drag **Gmail** into **Applications**. On first launch, right-click
the app → **Open** (it's ad-hoc signed, so Gatekeeper asks once).

## Features

- Dark **email bodies** (via Dark Reader) — not just Gmail's dark chrome.
- Dock unread badge and native notifications.
- External links open in your **default browser** (Gmail's redirector links included).
- Message grouping by **Sender / Label / Label → Sender**, inline in the toolbar.
- **Bartok** AI chat widget (bottom-right) wired to your local Claude Code
  session, with persisted, switchable chat sessions, a live task list with
  checkboxes, and red/green/orange status indicators.

## Using the AI chatbot

The widget drives the `claude` CLI already installed on your Mac, using **your
own logged-in Claude subscription** — no API key, nothing stored in this app.
Click the Bartok circle in the bottom-right, type a request, and watch it work.

Install prerequisites first:

1. Install Claude Code and sign in once in a terminal:
   ```sh
   npm install -g @anthropic-ai/claude-code   # or: curl -fsSL https://claude.com/install.sh | sh
   claude            # sign in with your Claude account, then quit
   ```
2. Launch Gmail, open the Bartok widget, and give it a prompt. For example:

   > Go through my inbox, archive every newsletter and promotional email from
   > the last week, star anything from a real person that mentions an invoice or
   > a deadline, and give me a one-line summary of what's left that needs a reply.

   Other prompts to try:
   - "Draft replies to the three oldest unread threads and leave them in Drafts."
   - "Find every email about the Q4 budget and summarize the decisions."
   - "Unsubscribe me from anything I haven't opened in 90 days."

The chatbot asks for nothing beyond the Claude session already on your machine.

## Build from source

```sh
git clone https://github.com/The-Portland-Company/gmail-desktop.git
cd gmail-desktop
npm install
npm start
```

See `main.js` (Electron main + Claude bridge), `preload.js` (injection), and
`plugins/` (chat widget + Gmail tweaks). Rebuild the installed bundle by copying
the app files into `/Applications/Gmail.app/Contents/Resources/app/` and
re-signing with `codesign --force --deep --sign -`.

> **Note:** You sign into Gmail inside the app window on first launch, exactly
> like any browser. No credentials ship with this repo.

## License

MIT
