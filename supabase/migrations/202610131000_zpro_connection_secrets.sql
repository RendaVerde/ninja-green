create table if not exists public.whatsapp_connection_secrets (
  connection_id uuid primary key references public.whatsapp_connections(id) on delete cascade,
  api_token text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.whatsapp_connection_secrets enable row level security;
revoke all on table public.whatsapp_connection_secrets from anon, authenticated;

insert into public.whatsapp_connection_secrets(connection_id, api_token)
select id, api_token
from public.whatsapp_connections
where api_token is not null and btrim(api_token) <> ''
on conflict (connection_id) do update set
  api_token = excluded.api_token,
  updated_at = now();

update public.whatsapp_connections
set api_token = null,
    updated_at = now()
where api_token is not null;
