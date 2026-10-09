#!/usr/bin/env bash
# One-time setup of Shiftly on an Ubuntu 24.04 VM that already runs Docker and Caddy (see README → Deploy).
# Safe to re-run: generated secrets are kept.
#
# Usage (on the VM):
#   sudo DOMAIN=shiftly.softilo.co.uk bash setup-server.sh
# Add WITH_CADDY=1 once DNS points at this server (DOMAIN and *.DOMAIN), to serve the platform admin on DOMAIN
# and each business on its own subdomain over HTTPS through the host's Caddy.
set -euo pipefail

: "${DOMAIN:?Set DOMAIN, e.g. DOMAIN=shiftly.softilo.co.uk}"
APP_DIR=/opt/shiftly
ETC=/etc/shiftly
ENV_FILE=$ETC/shiftly.env

command -v docker >/dev/null || { echo "Docker is not installed" >&2; exit 1; }
mkdir -p "$APP_DIR" "$ETC"
chmod 750 "$ETC"

# Generated secrets, created once and never printed. The anon key is public (it ships in the browser bundle);
# the service role key and everything else stay in this file.
if [ ! -f "$ENV_FILE" ]; then
  b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
  jwt_secret=$(openssl rand -hex 32)
  jwt() {
    local iat exp header payload sig
    iat=$(date +%s) exp=$(( $(date +%s) + 10 * 365 * 24 * 3600 ))
    header=$(printf '{"alg":"HS256","typ":"JWT"}' | b64url)
    payload=$(printf '{"role":"%s","iss":"supabase","iat":%s,"exp":%s}' "$1" "$iat" "$exp" | b64url)
    sig=$(printf '%s.%s' "$header" "$payload" | openssl dgst -sha256 -hmac "$jwt_secret" -binary | b64url)
    printf '%s.%s.%s' "$header" "$payload" "$sig"
  }
  umask 077
  cat > "$ENV_FILE" <<EOF
DOMAIN=$DOMAIN
POSTGRES_PASSWORD=$(openssl rand -hex 24)
JWT_SECRET=$jwt_secret
ANON_KEY=$(jwt anon)
SERVICE_ROLE_KEY=$(jwt service_role)
SECRET_KEY_BASE=$(openssl rand -hex 32)
# Realtime encrypts tenant settings with AES-128, so exactly 16 characters.
REALTIME_DB_ENC_KEY=$(openssl rand -hex 8)
EOF
fi
# The domain can change on a re-run; the secrets never do.
sed -i "s/^DOMAIN=.*/DOMAIN=$DOMAIN/" "$ENV_FILE"
chmod 600 "$ENV_FILE"
# Docker Compose reads .env from the project directory.
ln -sf "$ENV_FILE" "$APP_DIR/.env"

if [ "${WITH_CADDY:-0}" = "1" ]; then
  # Business subdomains get certificates on demand, but only for businesses that exist: Caddy asks Shiftly first.
  # That is a global option, so it lives in its own file that sorts before the sites (it changes nothing for
  # sites that don't use on-demand certificates).
  cat > /etc/caddy/sites/00-on-demand-tls.caddy <<CADDY
# Written by shiftly/deploy/setup-server.sh. Global options: must be the first block Caddy reads.
{
	on_demand_tls {
		ask http://127.0.0.1:3600/tls-check
	}
}
CADDY
  cat > /etc/caddy/sites/shiftly.caddy <<CADDY
# Shiftly: written by shiftly/deploy/setup-server.sh. The stack's own gateway is on 127.0.0.1:3600.
# The bare domain is the platform admin; each business is a subdomain (parkway.$DOMAIN).
$DOMAIN {
	encode zstd gzip
	reverse_proxy 127.0.0.1:3600
}

*.$DOMAIN {
	tls {
		on_demand
	}
	encode zstd gzip
	reverse_proxy 127.0.0.1:3600
}

# Fingerprint terminals often only speak plain HTTP, so their push endpoints also answer on port 80.
http://$DOMAIN, http://*.$DOMAIN {
	handle /iclock/* {
		reverse_proxy 127.0.0.1:3600
	}
	handle {
		redir https://{host}{uri} permanent
	}
}
CADDY
  # Other sites share this Caddy: only reload a configuration that validates.
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
  systemctl reload caddy
fi

echo "Server ready. Now run deploy/deploy.sh from your machine."
