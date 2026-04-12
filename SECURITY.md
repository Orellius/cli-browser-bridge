# Security Policy

## Supported Versions

| Version | Supported |
|---|---|
| 2.x (Rust) | ✅ Active |
| 1.x (Node.js) | ❌ EOL — use [v2](https://github.com/Orellius/cli-browser-bridge) |

## Reporting a Vulnerability

If you discover a security vulnerability in CLI Browser Bridge, **do not open a public issue.**

Email: **orel@orellius.ai**

Include:
- Description of the vulnerability
- Steps to reproduce
- Impact assessment
- Suggested fix (if any)

You'll receive an acknowledgment within 48 hours. Critical vulnerabilities will be patched and released within 7 days of confirmation.

## Scope

### In scope
- The Rust binary (`cli-browser-bridge serve` / host mode)
- IPC communication (Unix domain socket / TCP localhost)
- Native messaging protocol handling
- Extension service worker and CDP interactions
- Installer script (`install.sh`)

### Out of scope
- Chromium browser vulnerabilities
- Chrome DevTools Protocol design
- Websites visited through the bridge
- Actions performed by Claude Code through the bridge (user responsibility)

## Security Model

CLI Browser Bridge is an **intentionally powerful** tool. By design:

- The extension has `<all_urls>` and `debugger` permissions
- There is no domain blocklist
- The binary has full access to the browser session via CDP
- Communication is **localhost-only** (UDS on Unix, TCP `127.0.0.1` on Windows)

These are features, not vulnerabilities. The security boundary is:
1. **No network exposure** — IPC never leaves localhost
2. **User-scoped** — socket paths include UID, pidfiles prevent cross-user access
3. **Terms-gated** — binary refuses to run until explicit "I AGREE" consent
4. **Single connection** — only one browser profile connects at a time

Vulnerabilities we care about: privilege escalation, unauthorized remote access to the IPC channel, code execution outside the intended CDP scope, or bypasses of the terms acceptance gate.
