-- From supabase/docker (self-hosting): the schema Realtime keeps its tenants in.
\set pguser `echo "$POSTGRES_USER"`

create schema if not exists _realtime;
alter schema _realtime owner to :pguser;
