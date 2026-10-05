create table if not exists public.whatsapp_connections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  provider text not null check (provider in ('uazapi', 'baileys', 'evolution', 'evolution_go', 'zpro')),
  endpoint_url text,
  instance_name text,
  api_token text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_connection_attendants (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.whatsapp_connections(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  profile_name text not null,
  email text not null,
  role text not null default 'attendant' check (role in ('attendant', 'manager')),
  created_at timestamptz not null default now(),
  unique(connection_id, email)
);

create or replace function public.can_access_whatsapp_connection(target_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.whatsapp_connections where id = target_id and owner_id = auth.uid())
    or exists(select 1 from public.whatsapp_connection_attendants where connection_id = target_id and user_id = auth.uid());
$$;

create or replace function public.link_whatsapp_attendant()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.whatsapp_connection_attendants
  set user_id = new.id
  where lower(email) = lower(new.email) and user_id is null;
  return new;
end;
$$;

drop trigger if exists on_auth_user_link_whatsapp on auth.users;
create trigger on_auth_user_link_whatsapp after insert or update of email on auth.users
for each row execute procedure public.link_whatsapp_attendant();

alter table public.whatsapp_connections enable row level security;
alter table public.whatsapp_connection_attendants enable row level security;

drop policy if exists "whatsapp_connections_read" on public.whatsapp_connections;
drop policy if exists "whatsapp_connections_insert" on public.whatsapp_connections;
drop policy if exists "whatsapp_connections_update" on public.whatsapp_connections;
drop policy if exists "whatsapp_connections_delete" on public.whatsapp_connections;
drop policy if exists "whatsapp_attendants_read" on public.whatsapp_connection_attendants;
drop policy if exists "whatsapp_attendants_manage" on public.whatsapp_connection_attendants;

create policy "whatsapp_connections_read" on public.whatsapp_connections for select using (public.can_access_whatsapp_connection(id));
create policy "whatsapp_connections_insert" on public.whatsapp_connections for insert with check (owner_id = auth.uid());
create policy "whatsapp_connections_update" on public.whatsapp_connections for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "whatsapp_connections_delete" on public.whatsapp_connections for delete using (owner_id = auth.uid());
create policy "whatsapp_attendants_read" on public.whatsapp_connection_attendants for select using (public.can_access_whatsapp_connection(connection_id));
create policy "whatsapp_attendants_manage" on public.whatsapp_connection_attendants for all using (exists(select 1 from public.whatsapp_connections where id = connection_id and owner_id = auth.uid())) with check (exists(select 1 from public.whatsapp_connections where id = connection_id and owner_id = auth.uid()));

create index if not exists whatsapp_connections_owner_idx on public.whatsapp_connections(owner_id);
create index if not exists whatsapp_attendants_user_idx on public.whatsapp_connection_attendants(user_id);
