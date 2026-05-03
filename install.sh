#!/bin/bash

set -e

REPO="corvyn-ai/corvyn"
BINARY="corvyn"

# Detect OS and arch
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

if [ "$OS" = "darwin" ]; then
  if [ "$ARCH" = "arm64" ]; then
    FILE="corvyn-macos-arm64"
  else
    FILE="corvyn-macos-x64"
  fi
elif [ "$OS" = "linux" ]; then
  FILE="corvyn-linux-x64"
else
  echo "Windows: download from github.com/$REPO/releases"
  exit 1
fi

echo "Installing CORVYN..."

URL="https://github.com/$REPO/releases/latest/download/$FILE"
curl -fsSL "$URL" -o /tmp/corvyn
chmod +x /tmp/corvyn
sudo mv /tmp/corvyn /usr/local/bin/corvyn

echo "CORVYN installed successfully"
echo "Run: corvyn init"