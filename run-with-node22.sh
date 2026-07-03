#!/bin/bash
set -e

echo "=== Activating Node 22 ==="
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use 22

echo "=== Current versions ==="
node --version
pnpm --version

echo "=== Checking .env ==="
if grep -q "DISCORD_BOT_TOKEN=$" .env; then
  echo "WARNING: .env has blank DISCORD_BOT_TOKEN. Bot will fail to login."
  echo "Populate from Keybase (team gitfitcode > discord bot secrets > autobot > .env)"
fi

echo "=== Launching with pm2 ==="
pm2 start ecosystem.config.js --interpreter $(which node)
echo ""
echo "Use these commands:"
echo "  pm2 logs gitfitbot"
echo "  pm2 restart gitfitbot"
echo "  pm2 stop gitfitbot"
