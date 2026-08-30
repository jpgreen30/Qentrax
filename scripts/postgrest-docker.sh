#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "usage: $0 <postgrest.conf>" >&2
  exit 1
fi

CONF_PATH="$1"
if [ ! -f "$CONF_PATH" ]; then
  echo "postgrest config not found: $CONF_PATH" >&2
  exit 1
fi

# Try Docker first, fall back to native binary
if command -v docker &> /dev/null; then
  CONF_DIR="$(cd "$(dirname "$CONF_PATH")" && pwd)"
  CONF_FILE="$(basename "$CONF_PATH")"
  IMAGE="${PGRST_DOCKER_IMAGE:-postgrest/postgrest:v16.2}"
  exec docker run --rm --network host -v "$CONF_DIR:/config:ro" -w /config "$IMAGE" postgrest "/config/$CONF_FILE"
else
  # Fall back to native binary (must be in PATH or downloaded)
  if ! command -v postgrest &> /dev/null; then
    echo "Downloading PostgREST binary..." >&2
    POSTGREST_VERSION="v16.2"
    ARCH=$(uname -m)
    OS=$(uname -s | tr '[:upper:]' '[:lower:]')
    POSTGREST_URL="https://github.com/PostgREST/postgrest/releases/download/${POSTGREST_VERSION}/postgrest-${POSTGREST_VERSION}-${OS}-${ARCH}.tar.gz"
    INSTALL_DIR="/tmp/postgrest-bin"
    mkdir -p "$INSTALL_DIR"
    curl -fsSL "$POSTGREST_URL" | tar -xz -C "$INSTALL_DIR"
    export PATH="$INSTALL_DIR:$PATH"
  fi
  exec postgrest "$CONF_PATH"
fi
