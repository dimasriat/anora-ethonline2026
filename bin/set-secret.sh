#!/usr/bin/env bash
# Writes one secret into .env without it appearing on screen, in shell history,
# or in any transcript.  Usage:  bin/set-secret.sh WORLD_RP_SIGNING_KEY
set -euo pipefail
cd "$(dirname "$0")/.."

NAME=${1:-}
ENV_FILE=.env

if [ -z "$NAME" ]; then
  echo "usage: bin/set-secret.sh <VARIABLE_NAME>" >&2
  exit 1
fi

if ! git check-ignore -q "$ENV_FILE" 2>/dev/null; then
  echo "REFUSING: $ENV_FILE is not gitignored." >&2
  exit 1
fi

if [ ! -t 0 ]; then
  echo "REFUSING: no terminal available, so the value cannot be read without echoing it." >&2
  echo "Edit .env directly instead:  \$EDITOR $(pwd)/$ENV_FILE" >&2
  exit 1
fi

read -rsp "Value for $NAME (hidden, nothing will echo): " VALUE
echo

if [ -z "$VALUE" ]; then
  echo "REFUSING: empty value." >&2
  exit 1
fi

touch "$ENV_FILE"
tmp=$(mktemp)
grep -v -E "^${NAME}=" "$ENV_FILE" > "$tmp" || true
{ cat "$tmp"; echo "${NAME}=${VALUE}"; } > "$ENV_FILE"
rm -f "$tmp"
chmod 600 "$ENV_FILE"

echo "$NAME written to $ENV_FILE (${#VALUE} characters, mode $(stat -c '%a' "$ENV_FILE"))."
