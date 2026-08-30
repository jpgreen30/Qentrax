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

CONF_DIR="$(cd "$(dirname "$CONF_PATH")" && pwd)"
CONF_FILE="$(basename "$CONF_PATH")"
IMAGE="${PGRST_DOCKER_IMAGE:-postgrest/postgrest:v16.2}"

exec docker run --rm --network host -v "$CONF_DIR:/config:ro" "$IMAGE" postgrest "/config/$CONF_FILE"
