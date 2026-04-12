# cli-browser-bridge

Rust-powered browser automation bridge for Claude Code. By orellius.ai.

## Stack
- **Binary**: Rust (tokio async, clap CLI, serde JSON)
- **Extension**: Chrome MV3 (vanilla JS, CDP via chrome.debugger)
- **IPC**: Unix domain socket (serve ↔ host)
- **Protocol**: MCP JSON-RPC 2.0 over stdio (serve ↔ Claude Code)

## Architecture
```
Claude Code ──[stdio/MCP]──▶ cli-browser-bridge serve ──[UDS]──▶ cli-browser-bridge (host mode) ──[native messaging]──▶ Chrome Extension
```

Single binary, two modes:
- `serve`: MCP server (Claude Code spawns this). Listens on UDS for native host.
- Auto-host: Chrome launches binary directly. Detects `chrome-extension://` in argv[1] → enters host mode.

## File Rules
- **Max 300 lines per file.** No exceptions.
- No hardcoded paths, ports, or IDs. All config via constants module or CLI args.
- `main.rs` is a thin CLI dispatcher. No logic.
- One concern per module. Name by what it does.

## Build & Test
```bash
cargo build --release    # Binary at target/release/cli-browser-bridge
cargo clippy -- -D warnings
cargo fmt --check
```

## Key Paths
- Socket: `/tmp/cli-browser-bridge-{uid}.sock`
- Pidfile: `/tmp/cli-browser-bridge-{uid}.pid`
- Terms: `~/.config/orellius-browser-bridge/.terms-accepted`
- Native messaging host name: `com.orellius.browser_bridge`

## Extension
- Lives in `extension/` directory
- Manifest V3, service worker architecture
- Popup card shows connectivity status
- No build step — ship raw JS/HTML/CSS
