<h1 align="center">
  <img src="logo.png" alt="CLI Browser Bridge" width="120"><br>
  CLI Browser Bridge
</h1>

<p align="center">
  <b>Rust-powered, unrestricted browser automation for Claude Code.</b><br>
  No domain blocklist. Your real, signed-in Chromium browser. 21 MCP tools.<br>
  By <a href="https://orellius.ai">orellius.ai</a>
</p>

<p align="center">
  <img alt="License" src="https://img.shields.io/badge/license-GPL--3.0-black">
  <img alt="Rust" src="https://img.shields.io/badge/rust-1.70+-orange">
  <img alt="MV3" src="https://img.shields.io/badge/manifest-v3-blue">
  <img alt="MCP" src="https://img.shields.io/badge/MCP-compatible-purple">
</p>

---

## What is this?

CLI Browser Bridge gives [Claude Code](https://claude.ai/code) an MCP-powered bridge into your real, signed-in Chromium browser — with **no domain blocklist**. Navigate, click, type, screenshot, query Shadow DOM, and run JavaScript on any URL. Reddit, X, Discord, paywalled docs, SSO dashboards — all fair game.

**v2.0** is a ground-up Rust rebuild. Single compiled binary, no Node.js dependency, no shell wrappers. Direct native messaging — Chrome launches the binary, it just works.

Works with **Chrome**, **Brave**, **Edge**, and **Arc** on **macOS** and **Linux**.

---

## USE AT YOUR OWN RISK

> **By installing or using CLI Browser Bridge you accept full responsibility for every action performed through it.**

- This tool gives Claude **unrestricted access** to your browser session.
- There is **no domain blocklist**. Claude can visit any URL and perform any action.
- Your **cookies, sessions, and logged-in accounts** are accessible.
- **Most websites prohibit automated access** in their Terms of Service.
- You — not the software, not the developers, not Anthropic — bear sole responsibility.
- This software is provided **"as is"** under GPL-3.0 with no warranty.

**You must type "I AGREE" during installation.** The binary will refuse to start until terms are accepted.

See [TERMS_OF_USE.md](TERMS_OF_USE.md) for full legal terms.

---

## Quick Start

```bash
git clone https://github.com/Orellius/cli-browser-bridge.git
cd cli-browser-bridge

# 1. Load extension: chrome://extensions → Developer mode → Load unpacked → extension/
# 2. Copy the extension ID from the card
./install.sh <extension-id>

# 3. Restart browser, then:
claude mcp add cli-browser-bridge -- ~/.local/bin/cli-browser-bridge serve
```

---

## Architecture

```
Claude Code ──[stdio/MCP]──▶ cli-browser-bridge serve ──[UDS]──▶ cli-browser-bridge (auto) ──[native msg]──▶ Extension
```

**Single Rust binary, two modes:**
- `serve` — MCP server. Claude Code spawns this. Listens on Unix domain socket.
- **Auto-host** — Chrome launches the binary directly (no wrapper script). Detects `chrome-extension://` in argv → enters host mode. Connects to serve via UDS.

**Why Rust?** The v1 Node.js version relied on a shell wrapper that macOS silently refused to execute. A compiled binary has zero runtime dependencies — Chrome launches it directly, it just works.

---

## Tools (21)

| Tool | Description |
|---|---|
| `tabs_context_mcp` | List MCP tab group. **Call first.** |
| `tabs_create_mcp` | New tab in MCP group. |
| `navigate` | Go to URL or forward/back. |
| `computer` | Click, type, scroll, drag, hover, screenshot, zoom, key press. **Supports human-like typing.** |
| `find` | Find elements by natural language. **Pierces Shadow DOM.** |
| `read_page` | Accessibility tree with stable refs. **Shadow DOM aware.** |
| `form_input` | Set form values by ref. |
| `get_page_text` | Extract clean article text. |
| `javascript_tool` | Execute JS in page context. |
| `read_console_messages` | Filtered console output. |
| `read_network_requests` | HTTP request log. |
| `gif_creator` | Record + export as animated GIF. |
| `upload_image` | Upload screenshot to file input / drag target. |
| `resize_window` | Set window dimensions. |
| `shortcuts_list` / `shortcuts_execute` | Extension shortcuts. |
| `switch_browser` | Switch active browser. |
| `update_plan` | Present plan for user approval. |
| **`wait_for`** | Wait for element, text, network idle, or JS predicate. |
| **`storage`** | Read/write localStorage, sessionStorage, cookies. |
| **`dom_query`** | CSS selector query with Shadow DOM piercing + computed styles. |

### New in v2

- **Human-like typing** — `computer` with `humanlike: true` types with variable 40-180ms delays and natural word-boundary pauses.
- **Shadow DOM piercing** — `find`, `read_page`, `dom_query`, and `wait_for` traverse into Shadow DOM roots by default.
- **`wait_for`** — Poll for conditions: element visible/hidden, text match, network idle, custom JS predicate.
- **`storage`** — Read/write localStorage, sessionStorage, and cookies.
- **`dom_query`** — Precise CSS selector queries with optional computed styles.
- **Extension popup** — Real-time connectivity card showing connection status, tab count, and last activity.

---

## Extension Popup

Click the extension icon to see real-time status:
- Connection status (green/red dot)
- MCP tab count
- Last activity timestamp
- Reconnect button

---

## Configuration

### Custom socket path

```bash
cli-browser-bridge serve --socket /path/to/custom.sock
```

Default: `/tmp/cli-browser-bridge-{uid}.sock`

---

## Project Structure

```
cli-browser-bridge/
├── src/                    # Rust source
│   ├── main.rs             # CLI dispatcher
│   ├── serve.rs            # MCP server + UDS listener
│   ├── host.rs             # Native messaging host + UDS client
│   ├── config.rs           # Constants (no hardcodes)
│   ├── error.rs            # Typed errors
│   ├── lifecycle.rs        # PID, socket, signal management
│   ├── native_messaging.rs # Chrome native messaging codec
│   ├── mcp/
│   │   ├── transport.rs    # JSON-RPC 2.0 stdio
│   │   └── tools.rs        # 21 tool definitions
│   └── bridge/
│       └── protocol.rs     # UDS wire protocol
├── extension/              # Chrome MV3 extension
│   ├── manifest.json
│   ├── background.js       # Entry point, native messaging, CDP events
│   ├── cdp.js              # DevTools Protocol helpers
│   ├── tabs.js             # Tab group management
│   ├── tools.js            # Core tool handlers
│   ├── tools-advanced.js   # wait_for, storage, dom_query
│   ├── content.js          # A11y tree, element refs, form input
│   ├── popup.html/js/css   # Status card
│   └── icons/
├── install.sh              # Terms + build + manifest installer
├── Cargo.toml
└── README.md
```

---

## License

[GPL-3.0](LICENSE) — use, modify, redistribute under the same license.

---

<p align="center">
  Built with Rust and Claude Code by <a href="https://orellius.ai">orellius.ai</a>
</p>
