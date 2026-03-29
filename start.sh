#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

if [ -f "$SCRIPT_DIR/package.json" ]; then
  PROJECT_DIR="$SCRIPT_DIR"
elif [ -f "$SCRIPT_DIR/../package.json" ]; then
  PROJECT_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
else
  echo "Error: could not locate package.json relative to $0"
  exit 1
fi

APP_NAME="${APP_NAME:-pixel-websale}"
PORT="${PORT:-3000}"
PM2_BIN="${PM2_BIN:-pm2}"
YARN_BIN="${YARN_BIN:-yarn}"
SKIP_INSTALL="${SKIP_INSTALL:-0}"

if ! command -v "$PM2_BIN" >/dev/null 2>&1; then
  echo "Error: pm2 is not installed."
  echo "Install it with: npm install -g pm2"
  exit 1
fi

if ! command -v "$YARN_BIN" >/dev/null 2>&1; then
  echo "Error: yarn is not installed."
  echo "Enable it with: corepack enable && corepack prepare yarn@1.22.22 --activate"
  exit 1
fi

cd "$PROJECT_DIR"

export NODE_ENV=production
export PORT

echo "==> Project: $PROJECT_DIR"
echo "==> App name: $APP_NAME"
echo "==> Port: $PORT"

if [ "$SKIP_INSTALL" != "1" ]; then
  echo "==> Installing dependencies"
  "$YARN_BIN" install --frozen-lockfile
fi

echo "==> Building project"
"$YARN_BIN" build

if "$PM2_BIN" describe "$APP_NAME" >/dev/null 2>&1; then
  echo "==> Restarting existing PM2 app"
  "$PM2_BIN" restart "$APP_NAME" --update-env
else
  echo "==> Starting new PM2 app"
  "$PM2_BIN" start ./node_modules/.bin/next \
    --name "$APP_NAME" \
    --cwd "$PROJECT_DIR" \
    --time \
    -- start --hostname 0.0.0.0
fi

echo "==> Saving PM2 process list"
"$PM2_BIN" save

echo "==> Current PM2 status"
"$PM2_BIN" status "$APP_NAME"

echo "==> Done"
echo "Logs: pm2 logs $APP_NAME"
