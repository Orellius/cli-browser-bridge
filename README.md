<h1 align="center">
  <img src="logo.png" alt="CLI Browser Bridge" width="120"><br>
  CLI Browser Bridge
</h1>

<p align="center">
  <b>Rust-powered browser automation bridge for Claude Code.</b><br>
  Single binary. No Node.js. 21 MCP tools. Your real browser, no domain blocklist.<br>
  By <a href="https://orellius.ai">orellius.ai</a>
</p>

<p align="center">
  <img alt="Status" src="https://img.shields.io/badge/status-archived-lightgrey">
  <img alt="Rust" src="https://img.shields.io/badge/rust-1.70+-orange">
  <img alt="MCP" src="https://img.shields.io/badge/MCP-compatible-purple">
</p>

---

> **This project is archived.** Google's Chrome DevTools team released an official MCP server ([chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp)) covering similar ground. This project was built independently before that release and remains here as a reference.

---

## What it was

An MCP server that gave Claude Code full control of your real, signed-in Chromium browser — Chrome, Brave, Edge, Arc — through a Chrome extension and native messaging. No headless instance, no debug flags, no domain blocklist.

Built as a single Rust binary with two modes: `serve` (MCP server over stdio) and auto-host (native messaging host launched by Chrome). Communication between them over Unix domain sockets.

```
Claude Code ──[stdio/MCP]──▶ cli-browser-bridge serve ──[UDS]──▶ cli-browser-bridge (auto) ──[native msg]──▶ Extension
```

---

## What I built

- **21 MCP tools**: navigation, screenshots, form input, JS execution, accessibility tree with stable element refs, Shadow DOM piercing, network/console capture, animated GIF recording, cookie/storage access, CSS selector queries, natural language element finding
- **Single Rust binary**, zero runtime dependencies — v1 was Node.js and macOS silently refused to execute the shell wrapper, which motivated the rewrite
- **Chrome MV3 extension** with CDP via `chrome.debugger`, service worker reconnection handling, tab group management
- **Cross-platform**: macOS (ARM64/x64), Linux (x64), Windows (x64) with GitHub Actions CI/CD
- **Human-like typing** with variable keystroke delays and word-boundary pauses

## What I learned

- Rust async (tokio) for concurrent IPC + stdio multiplexing
- Chrome DevTools Protocol internals — debugger API, accessibility tree traversal, Shadow DOM
- Native messaging binary protocol (length-prefixed JSON over stdin/stdout)
- MCP JSON-RPC 2.0 server implementation from scratch
- Cross-platform IPC: Unix domain sockets on macOS/Linux, TCP fallback on Windows

---

## Tech stack

| Layer | Tech |
|---|---|
| Binary | Rust, tokio, clap, serde |
| Extension | Chrome MV3, vanilla JS, CDP |
| IPC | Unix domain socket / TCP |
| Protocol | MCP JSON-RPC 2.0 over stdio |

---

## License

[GPL-3.0](LICENSE)

<p align="center">
  Built with Rust and Claude Code by <a href="https://orellius.ai">orellius.ai</a>
</p>
