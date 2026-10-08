-- Execute este arquivo uma vez no SQL Editor do Supabase.
-- Toda informação comercial pertence a um usuário autenticado.

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    case when new.raw_app_meta_data ->> 'role' = 'admin' then 'admin' else 'user' end
  )
  on conflict (id) do update set
    full_name = excluded.full_name,
    role = excluded.role,
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert or update of raw_user_meta_data, raw_app_meta_data on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  phone text not null,
  email text,
  kind text not null check (kind in ('Cliente', 'Licenciado')),
  interest text not null default '',
  origin text not null default 'Cadastro manual',
  status text not null default 'Novo',
  note text,
  consent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sequences (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  audience text not null default 'Todos os contatos',
  pause_on_reply boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  color text check (color is null or color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sequence_steps (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references public.sequences(id) on delete cascade,
  position integer not null check (position >= 0),
  delay_days integer not null default 0 check (delay_days between 0 and 365),
  title text not null,
  message_template text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique(sequence_id, position)
);

create table if not exists public.contact_tags (
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(contact_id, tag_id)
);

create table if not exists public.sequence_tag_targets (
  user_id uuid not null references auth.users(id) on delete cascade,
  sequence_id uuid not null references public.sequences(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(sequence_id, tag_id)
);

create table if not exists public.sequence_contact_targets (
  user_id uuid not null references auth.users(id) on delete cascade,
  sequence_id uuid not null references public.sequences(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(sequence_id, contact_id)
);

create table if not exists public.contact_sequences (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  sequence_id uuid not null references public.sequences(id) on delete cascade,
  current_step integer not null default 0,
  next_run_at timestamptz,
  paused_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(contact_id, sequence_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  sequence_step_id uuid references public.sequence_steps(id) on delete set null,
  channel text not null default 'whatsapp',
  provider text,
  provider_message_id text,
  direction text not null default 'outbound' check (direction in ('inbound', 'outbound')),
  body text not null,
  status text not null default 'queued',
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.quick_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

alter table public.profiles enable row level security;
alter table public.contacts enable row level security;
alter table public.sequences enable row level security;
alter table public.tags enable row level security;
alter table public.sequence_steps enable row level security;
alter table public.contact_tags enable row level security;
alter table public.sequence_tag_targets enable row level security;
alter table public.sequence_contact_targets enable row level security;
alter table public.contact_sequences enable row level security;
alter table public.messages enable row level security;
alter table public.quick_messages enable row level security;
alter table public.whatsapp_connections enable row level security;
alter table public.whatsapp_connection_attendants enable row level security;

create policy "profiles_read_own_or_admin" on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy "profiles_update_own" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy "contacts_owner_all" on public.contacts for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "sequences_owner_all" on public.sequences for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "tags_owner_all" on public.tags for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "steps_through_sequence" on public.sequence_steps for all using (exists(select 1 from public.sequences where sequences.id = sequence_steps.sequence_id and sequences.owner_id = auth.uid())) with check (exists(select 1 from public.sequences where sequences.id = sequence_steps.sequence_id and sequences.owner_id = auth.uid()));
create policy "contact_tags_owner_all" on public.contact_tags for all using (user_id = auth.uid() and exists(select 1 from public.contacts where contacts.id = contact_tags.contact_id and contacts.owner_id = auth.uid()) and exists(select 1 from public.tags where tags.id = contact_tags.tag_id and tags.user_id = auth.uid())) with check (user_id = auth.uid() and exists(select 1 from public.contacts where contacts.id = contact_tags.contact_id and contacts.owner_id = auth.uid()) and exists(select 1 from public.tags where tags.id = contact_tags.tag_id and tags.user_id = auth.uid()));
create policy "sequence_tag_targets_owner_all" on public.sequence_tag_targets for all using (user_id = auth.uid() and exists(select 1 from public.sequences where sequences.id = sequence_tag_targets.sequence_id and sequences.owner_id = auth.uid()) and exists(select 1 from public.tags where tags.id = sequence_tag_targets.tag_id and tags.user_id = auth.uid())) with check (user_id = auth.uid() and exists(select 1 from public.sequences where sequences.id = sequence_tag_targets.sequence_id and sequences.owner_id = auth.uid()) and exists(select 1 from public.tags where tags.id = sequence_tag_targets.tag_id and tags.user_id = auth.uid()));
create policy "sequence_contact_targets_owner_all" on public.sequence_contact_targets for all using (user_id = auth.uid() and exists(select 1 from public.sequences where sequences.id = sequence_contact_targets.sequence_id and sequences.owner_id = auth.uid()) and exists(select 1 from public.contacts where contacts.id = sequence_contact_targets.contact_id and contacts.owner_id = auth.uid())) with check (user_id = auth.uid() and exists(select 1 from public.sequences where sequences.id = sequence_contact_targets.sequence_id and sequences.owner_id = auth.uid()) and exists(select 1 from public.contacts where contacts.id = sequence_contact_targets.contact_id and contacts.owner_id = auth.uid()));
create policy "contact_sequences_owner_all" on public.contact_sequences for all using (exists(select 1 from public.contacts where contacts.id = contact_sequences.contact_id and contacts.owner_id = auth.uid()) and exists(select 1 from public.sequences where sequences.id = contact_sequences.sequence_id and sequences.owner_id = auth.uid())) with check (exists(select 1 from public.contacts where contacts.id = contact_sequences.contact_id and contacts.owner_id = auth.uid()) and exists(select 1 from public.sequences where sequences.id = contact_sequences.sequence_id and sequences.owner_id = auth.uid()));
create policy "messages_owner_all" on public.messages for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "quick_messages_owner_all" on public.quick_messages for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "whatsapp_connections_read" on public.whatsapp_connections for select using (public.can_access_whatsapp_connection(id));
create policy "whatsapp_connections_insert" on public.whatsapp_connections for insert with check (owner_id = auth.uid());
create policy "whatsapp_connections_update" on public.whatsapp_connections for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "whatsapp_connections_delete" on public.whatsapp_connections for delete using (owner_id = auth.uid());
create policy "whatsapp_attendants_read" on public.whatsapp_connection_attendants for select using (public.can_access_whatsapp_connection(connection_id));
create policy "whatsapp_attendants_manage" on public.whatsapp_connection_attendants for all using (exists(select 1 from public.whatsapp_connections where id = connection_id and owner_id = auth.uid())) with check (exists(select 1 from public.whatsapp_connections where id = connection_id and owner_id = auth.uid()));

create or replace function public.resolve_contact_audience(
  target_audience text,
  target_tag_ids uuid[] default '{}'::uuid[],
  target_contact_ids uuid[] default '{}'::uuid[]
) returns table(contact_id uuid)
language plpgsql security invoker set search_path = public as $$
declare
  current_user_id uuid := auth.uid();
  normalized_tag_ids uuid[];
  normalized_contact_ids uuid[];
begin
  if current_user_id is null then
    raise exception 'Sessão expirada.' using errcode = '42501';
  end if;
  if target_audience not in ('Todos os contatos', 'Somente clientes', 'Somente licenciados') then
    raise exception 'Público inválido.' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct value), '{}'::uuid[]) into normalized_tag_ids
  from unnest(coalesce(target_tag_ids, '{}'::uuid[])) as value;
  select coalesce(array_agg(distinct value), '{}'::uuid[]) into normalized_contact_ids
  from unnest(coalesce(target_contact_ids, '{}'::uuid[])) as value;

  if exists(select 1 from unnest(normalized_tag_ids) as selected_id where not exists(select 1 from public.tags where id = selected_id and user_id = current_user_id)) then
    raise exception 'Uma ou mais tags são inválidas.' using errcode = '42501';
  end if;
  if exists(select 1 from unnest(normalized_contact_ids) as selected_id where not exists(select 1 from public.contacts where id = selected_id and owner_id = current_user_id)) then
    raise exception 'Um ou mais contatos são inválidos.' using errcode = '42501';
  end if;

  return query
  select contact_row.id
  from public.contacts as contact_row
  where contact_row.owner_id = current_user_id
    and (target_audience = 'Todos os contatos'
      or (target_audience = 'Somente clientes' and contact_row.kind = 'Cliente')
      or (target_audience = 'Somente licenciados' and contact_row.kind = 'Licenciado'))
    and (
      (cardinality(normalized_tag_ids) = 0 and cardinality(normalized_contact_ids) = 0)
      or contact_row.id = any(normalized_contact_ids)
      or exists(
        select 1 from public.contact_tags
        where contact_tags.user_id = current_user_id
          and contact_tags.contact_id = contact_row.id
          and contact_tags.tag_id = any(normalized_tag_ids)
      )
    );
end;
$$;

create or replace function public.configure_sequence_audience(
  target_sequence_id uuid,
  target_audience text,
  target_tag_ids uuid[] default '{}'::uuid[],
  target_contact_ids uuid[] default '{}'::uuid[],
  confirm_move boolean default false
) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  current_user_id uuid := auth.uid();
  normalized_tag_ids uuid[];
  normalized_contact_ids uuid[];
  resolved_contact_ids uuid[];
  conflicts jsonb;
  first_delay integer;
  moved_count integer := 0;
  removed_count integer := 0;
  assigned_count integer := 0;
  selected_contact_id uuid;
begin
  if current_user_id is null then
    raise exception 'Sessão expirada.' using errcode = '42501';
  end if;
  if target_audience not in ('Todos os contatos', 'Somente clientes', 'Somente licenciados') then
    raise exception 'Público inválido.' using errcode = '22023';
  end if;

  perform 1 from public.sequences where id = target_sequence_id and owner_id = current_user_id for update;
  if not found then
    raise exception 'Cadência não encontrada.' using errcode = '42501';
  end if;

  select coalesce(array_agg(distinct value), '{}'::uuid[]) into normalized_tag_ids
  from unnest(coalesce(target_tag_ids, '{}'::uuid[])) as value;
  select coalesce(array_agg(distinct value), '{}'::uuid[]) into normalized_contact_ids
  from unnest(coalesce(target_contact_ids, '{}'::uuid[])) as value;

  select coalesce(array_agg(resolved.contact_id), '{}'::uuid[]) into resolved_contact_ids
  from public.resolve_contact_audience(target_audience, normalized_tag_ids, normalized_contact_ids) as resolved;

  select coalesce(jsonb_agg(jsonb_build_object(
    'contactId', active_link.contact_id,
    'contactName', contact_row.name,
    'sequenceId', active_link.sequence_id,
    'sequenceName', sequence_row.name
  ) order by contact_row.name), '[]'::jsonb) into conflicts
  from public.contact_sequences as active_link
  join public.contacts as contact_row on contact_row.id = active_link.contact_id and contact_row.owner_id = current_user_id
  join public.sequences as sequence_row on sequence_row.id = active_link.sequence_id and sequence_row.owner_id = current_user_id
  where active_link.contact_id = any(resolved_contact_ids)
    and active_link.sequence_id <> target_sequence_id
    and active_link.paused_at is null
    and active_link.completed_at is null;

  if jsonb_array_length(conflicts) > 0 and not confirm_move then
    return jsonb_build_object('status', 'conflict', 'conflicts', conflicts, 'resolvedCount', cardinality(resolved_contact_ids));
  end if;

  update public.sequences set audience = target_audience, updated_at = now()
  where id = target_sequence_id and owner_id = current_user_id;

  delete from public.sequence_tag_targets where sequence_id = target_sequence_id and user_id = current_user_id;
  insert into public.sequence_tag_targets(user_id, sequence_id, tag_id)
  select current_user_id, target_sequence_id, selected_id from unnest(normalized_tag_ids) as selected_id;

  delete from public.sequence_contact_targets where sequence_id = target_sequence_id and user_id = current_user_id;
  insert into public.sequence_contact_targets(user_id, sequence_id, contact_id)
  select current_user_id, target_sequence_id, selected_id from unnest(normalized_contact_ids) as selected_id;

  update public.contact_sequences as active_link
  set paused_at = now(), next_run_at = null
  where active_link.sequence_id = target_sequence_id
    and active_link.paused_at is null
    and active_link.completed_at is null
    and not (active_link.contact_id = any(resolved_contact_ids))
    and exists(select 1 from public.contacts where id = active_link.contact_id and owner_id = current_user_id);
  get diagnostics removed_count = row_count;

  if confirm_move then
    update public.contact_sequences as active_link
    set paused_at = now(), next_run_at = null
    where active_link.contact_id = any(resolved_contact_ids)
      and active_link.sequence_id <> target_sequence_id
      and active_link.paused_at is null
      and active_link.completed_at is null
      and exists(select 1 from public.contacts where id = active_link.contact_id and owner_id = current_user_id)
      and exists(select 1 from public.sequences where id = active_link.sequence_id and owner_id = current_user_id);
    get diagnostics moved_count = row_count;
  end if;

  select delay_days into first_delay from public.sequence_steps
  where sequence_id = target_sequence_id and enabled = true order by position limit 1;

  foreach selected_contact_id in array resolved_contact_ids loop
    if not exists(
      select 1 from public.contact_sequences
      where contact_id = selected_contact_id
        and sequence_id = target_sequence_id
        and paused_at is null
        and completed_at is null
    ) then
      insert into public.contact_sequences(contact_id, sequence_id, current_step, next_run_at, paused_at, completed_at)
      values (
        selected_contact_id,
        target_sequence_id,
        0,
        case when first_delay is null then null else now() + make_interval(days => first_delay) end,
        null,
        null
      )
      on conflict (contact_id, sequence_id) do update set
        current_step = 0,
        next_run_at = excluded.next_run_at,
        paused_at = null,
        completed_at = null;
      assigned_count := assigned_count + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'status', 'success',
    'conflicts', conflicts,
    'resolvedCount', cardinality(resolved_contact_ids),
    'assignedCount', assigned_count,
    'movedCount', moved_count,
    'removedCount', removed_count
  );
end;
$$;

create or replace function public.duplicate_sequence(target_sequence_id uuid, duplicate_name text)
returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  current_user_id uuid := auth.uid();
  source_sequence public.sequences%rowtype;
  new_sequence_id uuid;
begin
  if current_user_id is null then
    raise exception 'Sessão expirada.' using errcode = '42501';
  end if;
  select * into source_sequence from public.sequences
  where id = target_sequence_id and owner_id = current_user_id;
  if not found then
    raise exception 'Cadência não encontrada.' using errcode = '42501';
  end if;

  insert into public.sequences(owner_id, name, audience, pause_on_reply, active)
  values (current_user_id, duplicate_name, source_sequence.audience, source_sequence.pause_on_reply, source_sequence.active)
  returning id into new_sequence_id;

  insert into public.sequence_steps(sequence_id, position, delay_days, title, message_template, enabled)
  select new_sequence_id, position, delay_days, title, message_template, enabled
  from public.sequence_steps where sequence_id = target_sequence_id order by position;

  insert into public.sequence_tag_targets(user_id, sequence_id, tag_id)
  select current_user_id, new_sequence_id, tag_id from public.sequence_tag_targets
  where sequence_id = target_sequence_id and user_id = current_user_id;

  insert into public.sequence_contact_targets(user_id, sequence_id, contact_id)
  select current_user_id, new_sequence_id, contact_id from public.sequence_contact_targets
  where sequence_id = target_sequence_id and user_id = current_user_id;

  return new_sequence_id;
end;
$$;

revoke all on function public.resolve_contact_audience(text, uuid[], uuid[]) from public;
grant execute on function public.resolve_contact_audience(text, uuid[], uuid[]) to authenticated;
revoke all on function public.configure_sequence_audience(uuid, text, uuid[], uuid[], boolean) from public;
grant execute on function public.configure_sequence_audience(uuid, text, uuid[], uuid[], boolean) to authenticated;
revoke all on function public.duplicate_sequence(uuid, text) from public;
grant execute on function public.duplicate_sequence(uuid, text) to authenticated;

create index if not exists contacts_owner_status_idx on public.contacts(owner_id, status);
create index if not exists sequences_owner_idx on public.sequences(owner_id);
create unique index if not exists tags_user_name_unique_idx on public.tags(user_id, lower(btrim(name)));
create index if not exists contact_tags_user_contact_idx on public.contact_tags(user_id, contact_id);
create index if not exists contact_tags_user_tag_idx on public.contact_tags(user_id, tag_id);
create index if not exists sequence_tag_targets_user_sequence_idx on public.sequence_tag_targets(user_id, sequence_id);
create index if not exists sequence_contact_targets_user_sequence_idx on public.sequence_contact_targets(user_id, sequence_id);
create unique index if not exists contact_sequences_one_active_idx on public.contact_sequences(contact_id) where paused_at is null and completed_at is null;
create index if not exists contact_sequences_next_run_idx on public.contact_sequences(next_run_at) where paused_at is null and completed_at is null;
create index if not exists messages_contact_created_idx on public.messages(contact_id, created_at desc);
create index if not exists quick_messages_user_updated_idx on public.quick_messages(user_id, updated_at desc);
create index if not exists whatsapp_connections_owner_idx on public.whatsapp_connections(owner_id);
create index if not exists whatsapp_attendants_user_idx on public.whatsapp_connection_attendants(user_id);
