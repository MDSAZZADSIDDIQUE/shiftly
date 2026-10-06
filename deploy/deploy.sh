#!/usr/bin/env bash
# Upload the working tree, build the app on the server, apply new database migrations, then start or update the stack.
# Usage (from the repo root, in Git Bash), after deploy/setup-server.sh has run on the server:
#   SERVER=ubuntu@1.2.3.4 SSH_KEY=~/.ssh/key bash deploy/deploy.sh
# SEED=1 loads supabase/seed.sql into an empty database; RESEED=1 wipes all data and accounts first (demos only).
set -euo pipefail

: "${SERVER:?Set SERVER, e.g. SERVER=ubuntu@1.2.3.4}"
SSH=(ssh -o StrictHostKeyChecking=accept-new ${SSH_KEY:+-i "$SSH_KEY"})
RELEASE=$(date +%Y%m%d%H%M%S)
ARCHIVE=$(mktemp -t shiftly-XXXX.tgz)

tar -czf "$ARCHIVE" \
  --exclude=.git --exclude=node_modules --exclude=.next --exclude='.next-*' --exclude='*.tsbuildinfo' \
  --exclude='.env' --exclude='.env.*' --exclude='*.log' --exclude=.claude \
  --exclude=supabase/.temp --exclude=supabase/.branches .
"${SSH[@]}" "$SERVER" "cat > /tmp/shiftly-$RELEASE.tgz" < "$ARCHIVE"
rm -f "$ARCHIVE"

"${SSH[@]}" "$SERVER" "sudo SEED=${SEED:-0} RESEED=${RESEED:-0} bash -s" <<EOF
set -euo pipefail
cd /opt/shiftly
[ -f .env ] || { echo "Run deploy/setup-server.sh on the server first" >&2; exit 1; }
rm -rf src.new && mkdir src.new
tar -xzf /tmp/shiftly-$RELEASE.tgz -C src.new
rm /tmp/shiftly-$RELEASE.tgz
rm -rf src.old && { [ -d src ] && mv src src.old || true; } && mv src.new src
cp src/deploy/compose.yml src/deploy/gateway.Caddyfile .
rm -rf db && cp -r src/deploy/db db

# This script arrives on stdin; keep docker from reading the rest of it.
docker compose build --pull app < /dev/null
docker compose up -d --wait db auth rest realtime < /dev/null

# psql reads SQL piped to it; query runs one statement. Neither may read this script, which is still arriving on stdin.
psql() { docker compose exec -T db psql -v ON_ERROR_STOP=1 -q -h localhost -U postgres -d postgres "\$@"; }
query() { psql "\$@" < /dev/null; }

# Migrations, tracked the way the Supabase CLI does so each file runs once.
query -c "create schema if not exists supabase_migrations;
         create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);"
for file in src/supabase/migrations/*.sql; do
  name=\$(basename "\$file" .sql)
  version=\${name%%_*}
  if [ -z "\$(query -Atc "select 1 from supabase_migrations.schema_migrations where version = '\$version'")" ]; then
    echo "Applying migration \$name"
    { echo 'begin;'; cat "\$file"; echo; echo "insert into supabase_migrations.schema_migrations (version, name) values ('\$version', '\${name#*_}');"; echo 'commit;'; } | psql
  fi
done

if [ "\$RESEED" = "1" ]; then
  echo "Wiping data and loading the demo seed"
  { echo 'begin;'; cat src/deploy/reseed.sql src/supabase/seed.sql; echo 'commit;'; } | psql >/dev/null
elif [ "\$SEED" = "1" ] && [ "\$(query -Atc 'select count(*) from public.employees')" = "0" ]; then
  echo "Loading the demo seed"
  { echo 'begin;'; cat src/supabase/seed.sql; echo 'commit;'; } | psql >/dev/null
fi
query -c "notify pgrst, 'reload schema'"

docker compose up -d --wait --remove-orphans < /dev/null
docker compose up -d --force-recreate gateway < /dev/null
rm -rf src.old
docker image prune -f >/dev/null

sleep 2
curl -fsS -o /dev/null -w "App: HTTP %{http_code}\n" http://127.0.0.1:3600/login
curl -fsS -o /dev/null -w "Auth: HTTP %{http_code}\n" http://127.0.0.1:3600/auth/v1/health
EOF

echo "Deployed Shiftly release $RELEASE"
