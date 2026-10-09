#!/usr/bin/env bash
# Creates a platform admin: the account that signs in on the bare domain to set up businesses. Prints a one-off
# password; change it after signing in.
#   On the server:  sudo bash /opt/shiftly/src/deploy/create-admin.sh you@example.com "Your Name"
#   Locally:        SUPABASE_URL=http://127.0.0.1:55321 SERVICE_KEY=<secret key> bash deploy/create-admin.sh you@example.com
set -euo pipefail

EMAIL=${1:?Usage: create-admin.sh EMAIL [NAME]}
NAME=${2:-$EMAIL}
case "$EMAIL$NAME" in *'"'* | *'\'*) echo "Quotes and backslashes aren't allowed in the email or name" >&2; exit 1 ;; esac

if [ -z "${SERVICE_KEY:-}" ] && [ -f /etc/shiftly/shiftly.env ]; then
  # shellcheck disable=SC1091
  set -a; . /etc/shiftly/shiftly.env; set +a
  SERVICE_KEY=$SERVICE_ROLE_KEY
  SUPABASE_URL=${SUPABASE_URL:-http://127.0.0.1:3600}
fi
: "${SERVICE_KEY:?Set SERVICE_KEY (and SUPABASE_URL), or run this on the server}"
: "${SUPABASE_URL:?Set SUPABASE_URL}"

PASSWORD=$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-16)
# New-style secret keys (sb_secret_...) only go in the apikey header; legacy JWT keys also as the bearer token.
AUTH=(-H "apikey: $SERVICE_KEY")
case "$SERVICE_KEY" in sb_*) ;; *) AUTH+=(-H "Authorization: Bearer $SERVICE_KEY") ;; esac

curl -fsS -o /dev/null "$SUPABASE_URL/auth/v1/admin/users" "${AUTH[@]}" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"email_confirm\":true,\"app_metadata\":{\"platform_admin\":true},\"user_metadata\":{\"full_name\":\"$NAME\"}}"

echo "Platform admin $EMAIL created. One-off password: $PASSWORD"
