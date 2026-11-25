#!/usr/bin/env bash
set -u

cd "$(dirname "$0")"

# Ensure Homebrew / nvm / standard Node paths are available when double-clicked from Finder
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.volta/bin:$HOME/.asdf/shims:$PATH"
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1 || true
fi

echo ""
echo "============================================================"
echo "  Du Kich Studio - Local Launcher"
echo "============================================================"
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "[!] Node.js was not found on this Mac."
  echo ""
  echo "Please install Node.js LTS (v18 or newer) once, then double-click"
  echo "Start-Mac.command again:"
  echo "  https://nodejs.org/"
  echo ""
  open "https://nodejs.org/"
  read -r -p "Press Enter to close..."
  exit 1
fi

if ! node -e "process.exit(parseInt(process.versions.node,10)>=18?0:1)" >/dev/null 2>&1; then
  echo "[!] Your Node.js version is too old. Du Kich Studio requires Node.js 18+."
  echo "Please update from https://nodejs.org/ and run this file again."
  echo ""
  open "https://nodejs.org/"
  read -r -p "Press Enter to close..."
  exit 1
fi

if [ ! -x "node_modules/.bin/vite" ]; then
  echo "[1/2] First-time setup: installing packages (usually 15-30 seconds)..."
  echo ""
  if ! npm install; then
    echo ""
    echo "[ERROR] Package installation failed. Check your internet connection and try again."
    read -r -p "Press Enter to close..."
    exit 1
  fi
  echo ""
fi

if node -e "fetch('http://localhost:5288/').then(()=>process.exit(0)).catch(()=>process.exit(1))" >/dev/null 2>&1; then
  echo "Du Kich Studio is already running at http://localhost:5288/"
  echo "Opening it in your browser..."
  open "http://localhost:5288/"
  exit 0
fi

echo "[2/2] Starting Du Kich Studio on http://localhost:5288/ ..."
echo ""
echo "Keep this window open while presenting. Press Ctrl+C or close it to stop."
echo ""
if ! npm run dev -- --open; then
  echo ""
  echo "[ERROR] Du Kich Studio stopped unexpectedly."
  echo "If port 5288 is used by another app, close that app and try again."
  read -r -p "Press Enter to close..."
  exit 1
fi
