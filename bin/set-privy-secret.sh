#!/usr/bin/env bash
# Writes the Privy app secret into .env without it appearing on screen,
# in shell history, or in any transcript. Then checks it against the API.
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE=.env

if ! git check-ignore -q "$ENV_FILE" 2>/dev/null; then
  echo "REFUSING: $ENV_FILE is not gitignored." >&2
  exit 1
fi

read -rp "Privy app id [cmtpjae9z00300cjtzu289djw]: " APP_ID
APP_ID=${APP_ID:-cmtpjae9z00300cjtzu289djw}

read -rsp "Privy app secret (hidden, nothing will echo): " SECRET
echo

if [ -z "$SECRET" ]; then
  echo "REFUSING: empty secret." >&2
  exit 1
fi

touch "$ENV_FILE"
chmod 600 "$ENV_FILE"

tmp=$(mktemp)
grep -v -E '^(PRIVY_APP_ID|PRIVY_APP_SECRET)=' "$ENV_FILE" > "$tmp" || true
{
  cat "$tmp"
  echo "PRIVY_APP_ID=$APP_ID"
  echo "PRIVY_APP_SECRET=$SECRET"
} > "$ENV_FILE"
rm -f "$tmp"
chmod 600 "$ENV_FILE"

echo "Written to $ENV_FILE (mode $(stat -c '%a' "$ENV_FILE"))."

code=$(curl -s -o /dev/null -w '%{http_code}' \
  -X POST https://api.privy.io/v1/wallets \
  -u "$APP_ID:$SECRET" \
  -H "privy-app-id: $APP_ID" \
  -H "content-type: application/json" \
  -H "User-Agent: anora-ethonline2026/0.1" \
  -d '{"chain_type":"ethereum"}')

case "$code" in
  200|201) echo "Privy accepted the credentials (http $code). A throwaway wallet was created." ;;
  401|403) echo "Privy REJECTED the credentials (http $code). Wrong secret, or wrong app id." >&2; exit 1 ;;
  *)       echo "Unexpected response from Privy (http $code). Check connectivity." >&2; exit 1 ;;
esac
