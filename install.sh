#!/bin/bash
set -e

BOLD="\033[1m"
RED="\033[31m"
GREEN="\033[32m"
YELLOW="\033[33m"
CYAN="\033[36m"
RESET="\033[0m"

BINARY_NAME="cli-browser-bridge"
NATIVE_HOST_NAME="com.orellius.browser_bridge"
INSTALL_DIR="$HOME/.local/bin"
CONFIG_DIR="$HOME/.config/orellius-browser-bridge"
TERMS_FILE="$CONFIG_DIR/.terms-accepted"

echo -e "${CYAN}${BOLD}"
echo "  ┌──────────────────────────────────────┐"
echo "  │      CLI Browser Bridge Installer     │"
echo "  │           by orellius.ai              │"
echo "  └──────────────────────────────────────┘"
echo -e "${RESET}"

# ── Step 1: Terms of Use (ALWAYS first) ──
if [ ! -f "$TERMS_FILE" ]; then
  echo -e "${YELLOW}${BOLD}⚖️  TERMS OF USE${RESET}"
  echo ""
  echo "  CLI Browser Bridge gives Claude Code unrestricted access to your"
  echo "  real, signed-in browser. By installing, you accept that:"
  echo ""
  echo "  • YOU are solely responsible for all actions performed through it."
  echo "  • There is NO domain blocklist. Claude can visit any URL."
  echo "  • Your cookies, sessions, and logged-in accounts are accessible."
  echo "  • Most websites prohibit automated access in their ToS."
  echo "  • This software is provided AS-IS with no warranty."
  echo ""
  echo "  Full terms: TERMS_OF_USE.md | README.md"
  echo ""
  echo -e "${BOLD}Type exactly 'I AGREE' to accept and continue:${RESET}"
  read -r consent
  if [ "$consent" != "I AGREE" ]; then
    echo -e "${RED}Installation cancelled. Terms must be accepted.${RESET}"
    exit 1
  fi
  mkdir -p "$CONFIG_DIR"
  date > "$TERMS_FILE"
  echo -e "${GREEN}✓ Terms accepted.${RESET}"
  echo ""
else
  echo -e "${GREEN}✓ Terms previously accepted.${RESET}"
  echo ""
fi

# ── Step 2: Extension ID ──
if [ -z "$1" ]; then
  echo -e "${BOLD}Enter your extension ID (from chrome://extensions):${RESET}"
  echo -e "  Load the extension first: extensions page → Developer mode → Load unpacked → extension/"
  echo ""
  read -rp "  Extension ID: " EXT_ID
else
  EXT_ID="$1"
fi

if [ -z "$EXT_ID" ] || [ ${#EXT_ID} -ne 32 ]; then
  echo -e "${RED}Invalid extension ID. Must be exactly 32 characters.${RESET}"
  exit 1
fi

EXTRA_IDS=("${@:2}")
echo -e "${GREEN}✓ Extension ID: ${EXT_ID}${RESET}"
echo ""

# ── Step 3: Build Rust binary ──
echo -e "${CYAN}Building Rust binary (release)...${RESET}"
if ! command -v cargo &>/dev/null; then
  echo -e "${RED}Rust toolchain not found. Install: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh${RESET}"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"
cargo build --release 2>&1 | tail -3
echo ""

# ── Step 4: Install binary ──
mkdir -p "$INSTALL_DIR"
cp "target/release/$BINARY_NAME" "$INSTALL_DIR/$BINARY_NAME"
chmod +x "$INSTALL_DIR/$BINARY_NAME"
BINARY_PATH="$INSTALL_DIR/$BINARY_NAME"
echo -e "${GREEN}✓ Binary installed: $BINARY_PATH${RESET}"

# ── Step 5: Native messaging manifests ──
ORIGINS="\"chrome-extension://${EXT_ID}/\""
for extra in "${EXTRA_IDS[@]}"; do
  ORIGINS="$ORIGINS, \"chrome-extension://${extra}/\""
done

generate_manifest() {
  cat <<MANIFEST
{
  "name": "$NATIVE_HOST_NAME",
  "description": "CLI Browser Bridge Native Messaging Host by orellius.ai",
  "path": "$BINARY_PATH",
  "type": "stdio",
  "allowed_origins": [$ORIGINS]
}
MANIFEST
}

install_manifest() {
  local dir="$1"
  local browser="$2"
  if [ -d "$(dirname "$dir")" ]; then
    mkdir -p "$dir"
    generate_manifest > "$dir/$NATIVE_HOST_NAME.json"
    echo -e "  ${GREEN}✓${RESET} $browser"
  fi
}

echo ""
echo -e "${CYAN}Installing native messaging manifests...${RESET}"

if [ "$(uname)" = "Darwin" ]; then
  install_manifest "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts" "Chrome"
  install_manifest "$HOME/Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts" "Brave"
  install_manifest "$HOME/Library/Application Support/Microsoft Edge/NativeMessagingHosts" "Edge"
  install_manifest "$HOME/Library/Application Support/Arc/User Data/NativeMessagingHosts" "Arc"
else
  install_manifest "$HOME/.config/google-chrome/NativeMessagingHosts" "Chrome"
  install_manifest "$HOME/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts" "Brave"
  install_manifest "$HOME/.config/microsoft-edge/NativeMessagingHosts" "Edge"
fi

# ── Step 6: Register MCP server with Claude Code ──
echo ""
echo -e "${CYAN}Registering MCP server with Claude Code...${RESET}"

if command -v claude &>/dev/null; then
  # Remove existing registration if present (idempotent reinstall)
  claude mcp remove cli-browser-bridge 2>/dev/null || true
  claude mcp add --scope user cli-browser-bridge -- "$BINARY_PATH" serve 2>&1
  echo -e "  ${GREEN}✓${RESET} MCP server registered"
else
  echo -e "  ${YELLOW}⚠${RESET} Claude Code CLI not found. Register manually:"
  echo -e "     ${CYAN}claude mcp add cli-browser-bridge -- $BINARY_PATH serve${RESET}"
fi

# ── Step 7: Verify ──
echo ""
echo -e "${CYAN}Verifying...${RESET}"

if "$BINARY_PATH" version &>/dev/null; then
  VER=$("$BINARY_PATH" version 2>/dev/null || echo "unknown")
  echo -e "  ${GREEN}✓${RESET} Binary: $VER"
else
  echo -e "  ${RED}✗${RESET} Binary failed to run"
  exit 1
fi

for f in "$HOME/Library/Application Support/"*/NativeMessagingHosts/$NATIVE_HOST_NAME.json \
         "$HOME/.config/"*/NativeMessagingHosts/$NATIVE_HOST_NAME.json; do
  [ -f "$f" ] || continue
  if python3 -c "import json; json.load(open('$f'))" 2>/dev/null; then
    echo -e "  ${GREEN}✓${RESET} Manifest: $(basename "$(dirname "$(dirname "$f")")")"
  else
    echo -e "  ${RED}✗${RESET} Invalid: $f"
  fi
done

# ── Done ──
echo ""
echo -e "${BOLD}${GREEN}Installation complete!${RESET}"
echo ""
echo "  1. Restart your browser (close all windows, reopen)"
echo "  2. Start a new Claude Code session"
echo "  3. Test: \"Navigate to news.ycombinator.com and take a screenshot\""
echo ""
echo -e "  ${CYAN}Popup:${RESET} click the extension icon to check connectivity status."
