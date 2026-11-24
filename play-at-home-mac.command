#!/bin/bash
# GRAVEWAVE home server: double-click this file on a Mac connected to your Wi-Fi.
# Phones on the same Wi-Fi then open the address it prints (http://192.168.x.x:8080).
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Download the LTS version from https://nodejs.org , install it, then run this file again."
  read -r -p "Press Enter to close"
  exit 1
fi
GW_LAN=1 PORT=8080 node server/server.js
