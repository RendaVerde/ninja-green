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
  do_not_contact boolean not null default false,
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
  attachments jsonb not null default '[]'::jsonb constraint sequence_steps_attachments_array_check check (jsonb_typeof(attachments) = 'array'),
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
  pause_reason text,
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
  provider_ticket_id text,
  provider_error_code text,
  provider_error_message text,
  direction text not null default 'outbound' check (direction in ('inbound', 'outbound')),
  body text not null,
  status text not null default 'queued',
  queue_status text check (queue_status is null or queue_status in ('pending', 'sending', 'sent', 'failed', 'unknown', 'canceled')),
  source text check (source is null or source in ('single', 'quick', 'sequence', 'legacy')),
  connection_id uuid,
  priority smallint not null default 100 check (priority between 0 and 1000),
  scheduled_at timestamptz,
  confirmed_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz,
  last_attempt_at timestamptz,
  request_started_at timestamptz,
  claimed_at timestamptz,
  claim_token uuid,
  claim_expires_at timestamptz,
  canceled_at timestamptz,
  cancel_reason text,
  uncertainty_reason text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.quick_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  attachments jsonb not null default '[]'::jsonb constraint quick_messages_attachments_array_check check (jsonb_typeof(attachments) = 'array'),
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
  channel_number text constraint whatsapp_connections_channel_number_check check (channel_number is null or channel_number ~ '^55[0-9]{10,11}$'), -- legado: não usar para identificar canais ZPRO
  channel_id bigint constraint whatsapp_connections_channel_id_check check (channel_id is null or channel_id > 0),
  active boolean not null default true,
  daily_limit integer not null default 30 check (daily_limit between 1 and 10000),
  health_status text not null default 'unknown' check (health_status in ('unknown', 'ready', 'error')),
  health_error text,
  health_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.outbound_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  automatic_sending_enabled boolean not null default false,
  pause_all boolean not null default false,
  timezone text not null default 'America/Sao_Paulo',
  per_connection_batch_limit integer not null default 3 check (per_connection_batch_limit between 1 and 50),
  last_used_connection_id uuid references public.whatsapp_connections(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_connection_secrets (
  connection_id uuid primary key references public.whatsapp_connections(id) on delete cascade,
  api_token text not null,
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

create unique index if not exists contacts_id_owner_unique_idx on public.contacts(id, owner_id);
create unique index if not exists whatsapp_connections_id_owner_unique_idx on public.whatsapp_connections(id, owner_id);

alter table public.messages
  drop constraint if exists messages_contact_owner_fk,
  add constraint messages_contact_owner_fk foreign key (contact_id, owner_id) references public.contacts(id, owner_id) on delete cascade,
  drop constraint if exists messages_connection_owner_fk,
  add constraint messages_connection_owner_fk foreign key (connection_id, owner_id) references public.whatsapp_connections(id, owner_id) on delete restrict;

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
alter table public.whatsapp_connection_secrets enable row level security;
alter table public.whatsapp_connection_attendants enable row level security;
alter table public.outbound_settings enable row level security;

revoke all on table public.whatsapp_connection_secrets from anon, authenticated;

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
create policy "outbound_settings_owner_all" on public.outbound_settings for all using (user_id = auth.uid()) with check (user_id = auth.uid() and (last_used_connection_id is null or exists(select 1 from public.whatsapp_connections where id = last_used_connection_id and owner_id = auth.uid())));

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('message-attachments', 'message-attachments', false, 52428800, array['image/*', 'video/*', 'application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "message_attachments_select_own" on storage.objects for select to authenticated
using (bucket_id = 'message-attachments' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "message_attachments_insert_own" on storage.objects for insert to authenticated
with check (bucket_id = 'message-attachments' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "message_attachments_update_own" on storage.objects for update to authenticated
using (bucket_id = 'message-attachments' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'message-attachments' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "message_attachments_delete_own" on storage.objects for delete to authenticated
using (bucket_id = 'message-attachments' and (storage.foldername(name))[1] = auth.uid()::text);

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

  insert into public.sequence_steps(sequence_id, position, delay_days, title, message_template, attachments, enabled)
  select new_sequence_id, position, delay_days, title, message_template, attachments, enabled
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

create or replace function public.claim_outbound_messages(
  target_dispatcher_id uuid,
  target_batch_size integer default 3,
  target_per_connection_limit integer default 3,
  target_lease_seconds integer default 75,
  target_owner_id uuid default null
) returns setof public.messages
language plpgsql security definer set search_path = public as $$
begin
  if target_batch_size < 1 or target_batch_size > 50
    or target_per_connection_limit < 1 or target_per_connection_limit > 50
    or target_lease_seconds < 60 or target_lease_seconds > 600 then
    raise exception 'Parâmetros inválidos para o despachante.' using errcode = '22023';
  end if;

  update public.messages
  set queue_status = 'unknown', status = 'failed', provider_error_code = 'DELIVERY_LEASE_EXPIRED',
    provider_error_message = 'A execução terminou sem confirmar o resultado do provedor.',
    uncertainty_reason = 'lease_expired_after_request_started', claim_token = null, claim_expires_at = null
  where queue_status = 'sending' and claim_expires_at < now() and request_started_at is not null
    and (target_owner_id is null or owner_id = target_owner_id);

  update public.messages
  set queue_status = 'pending', status = 'queued', claimed_at = null, claim_token = null, claim_expires_at = null
  where queue_status = 'sending' and claim_expires_at < now() and request_started_at is null
    and (target_owner_id is null or owner_id = target_owner_id);

  return query
  with ranked as materialized (
    select message_row.id,
      row_number() over (partition by message_row.connection_id order by message_row.priority desc, message_row.scheduled_at, message_row.created_at, message_row.id) as connection_rank
    from public.messages as message_row
    join public.contacts as contact_row on contact_row.id = message_row.contact_id and contact_row.owner_id = message_row.owner_id
    join public.whatsapp_connections as connection_row on connection_row.id = message_row.connection_id and connection_row.owner_id = message_row.owner_id
    left join public.outbound_settings as settings_row on settings_row.user_id = message_row.owner_id
    where message_row.queue_status = 'pending'
      and message_row.scheduled_at <= now()
      and coalesce(message_row.next_attempt_at, message_row.scheduled_at) <= now()
      and message_row.confirmed_at is not null
      and not contact_row.do_not_contact
      and connection_row.active
      and connection_row.health_status <> 'error'
      and not coalesce(settings_row.pause_all, false)
      and (message_row.source <> 'sequence' or coalesce(settings_row.automatic_sending_enabled, false))
      and (target_owner_id is null or message_row.owner_id = target_owner_id)
      and (
        select count(*) from public.messages as sent_row
        where sent_row.connection_id = connection_row.id and sent_row.queue_status = 'sent'
          and (sent_row.sent_at at time zone coalesce(settings_row.timezone, 'America/Sao_Paulo'))::date
            = (now() at time zone coalesce(settings_row.timezone, 'America/Sao_Paulo'))::date
      ) < connection_row.daily_limit
  ), candidates as (
    select message_row.id
    from public.messages as message_row join ranked on ranked.id = message_row.id
    where ranked.connection_rank <= target_per_connection_limit
    order by message_row.priority desc, message_row.scheduled_at, message_row.created_at, message_row.id
    for update of message_row skip locked
    limit target_batch_size
  ), claimed as (
    update public.messages as message_row
    set queue_status = 'sending', status = 'sending', attempt_count = message_row.attempt_count + 1,
      last_attempt_at = now(), claimed_at = now(), claim_token = target_dispatcher_id,
      claim_expires_at = now() + make_interval(secs => target_lease_seconds), request_started_at = null,
      provider_error_code = null, provider_error_message = null, uncertainty_reason = null
    from candidates where message_row.id = candidates.id returning message_row.*
  )
  select * from claimed;
end;
$$;

revoke all on function public.claim_outbound_messages(uuid, integer, integer, integer, uuid) from public;
grant execute on function public.claim_outbound_messages(uuid, integer, integer, integer, uuid) to service_role;

revoke all on function public.resolve_contact_audience(text, uuid[], uuid[]) from public;
grant execute on function public.resolve_contact_audience(text, uuid[], uuid[]) to authenticated;
revoke all on function public.configure_sequence_audience(uuid, text, uuid[], uuid[], boolean) from public;
grant execute on function public.configure_sequence_audience(uuid, text, uuid[], uuid[], boolean) to authenticated;
revoke all on function public.duplicate_sequence(uuid, text) from public;
grant execute on function public.duplicate_sequence(uuid, text) to authenticated;

-- M2: cadência real, horários, agendador e salvaguardas.
+create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

alter table public.sequences
  add column if not exists connection_id uuid references public.whatsapp_connections(id) on delete set null,
  add column if not exists priority smallint not null default 100;

alter table public.sequence_steps
  add column if not exists send_time time;

alter table public.contact_sequences
  add column if not exists schedule_status text not null default 'scheduled',
  add column if not exists legacy_due_at timestamptz,
  add column if not exists pending_message_id uuid,
  add column if not exists materialize_token uuid,
  add column if not exists materialize_expires_at timestamptz;

alter table public.messages
  add column if not exists retry_of uuid references public.messages(id) on delete set null,
  add column if not exists contact_sequence_id uuid references public.contact_sequences(id) on delete set null,
  add column if not exists first_request_started_at timestamptz;

alter table public.outbound_settings
  add column if not exists default_send_time time not null default '09:00',
  add column if not exists safe_window_start time not null default '08:00',
  add column if not exists safe_window_end time not null default '20:00',
  add column if not exists stale_tolerance_hours integer not null default 12,
  add column if not exists jitter_min_seconds integer not null default 8,
  add column if not exists jitter_max_seconds integer not null default 20,
  add column if not exists host_concurrency_limit integer not null default 3,
  add column if not exists circuit_base_minutes integer not null default 3,
  add column if not exists connection_test_interval_seconds integer not null default 60;

alter table public.whatsapp_connections
  add column if not exists circuit_failure_count integer not null default 0,
  add column if not exists circuit_backoff_level integer not null default 0,
  add column if not exists circuit_open_until timestamptz,
  add column if not exists circuit_last_failure_at timestamptz,
  add column if not exists last_tested_at timestamptz;

alter table public.sequences
  drop constraint if exists sequences_priority_check,
  add constraint sequences_priority_check check (priority between 0 and 1000) not valid;
alter table public.contact_sequences
  drop constraint if exists contact_sequences_schedule_status_check,
  add constraint contact_sequences_schedule_status_check
    check (schedule_status in ('scheduled', 'legacy_hold')) not valid;
alter table public.outbound_settings
  drop constraint if exists outbound_settings_schedule_check,
  add constraint outbound_settings_schedule_check check (
    safe_window_start < safe_window_end
    and stale_tolerance_hours between 1 and 168
    and jitter_min_seconds between 0 and 300
    and jitter_max_seconds between jitter_min_seconds and 600
    and host_concurrency_limit between 1 and 50
    and circuit_base_minutes between 1 and 60
    and connection_test_interval_seconds between 15 and 3600
  ) not valid;
alter table public.whatsapp_connections
  drop constraint if exists whatsapp_connections_health_status_check,
  add constraint whatsapp_connections_health_status_check
    check (health_status in ('unknown', 'ready', 'unavailable', 'error')) not valid,
  drop constraint if exists whatsapp_connections_circuit_check,
  add constraint whatsapp_connections_circuit_check check (
    circuit_failure_count >= 0 and circuit_backoff_level between 0 and 10
  ) not valid;

alter table public.sequences validate constraint sequences_priority_check;
alter table public.contact_sequences validate constraint contact_sequences_schedule_status_check;
alter table public.outbound_settings validate constraint outbound_settings_schedule_check;
alter table public.whatsapp_connections validate constraint whatsapp_connections_health_status_check;
alter table public.whatsapp_connections validate constraint whatsapp_connections_circuit_check;

create index if not exists contact_sequences_materialize_idx
  on public.contact_sequences(next_run_at, schedule_status)
  where paused_at is null and completed_at is null and pending_message_id is null;
create index if not exists messages_host_inflight_idx
  on public.messages(connection_id, queue_status)
  where queue_status = 'sending';
create index if not exists whatsapp_connections_base_url_idx
  on public.whatsapp_connections(endpoint_url);
create unique index if not exists messages_sequence_step_once_idx
  on public.messages(contact_sequence_id, sequence_step_id)
  where source = 'sequence';

create or replace function public.outbound_safe_timestamp(
  target_local_date date,
  target_time time,
  target_timezone text,
  target_window_start time,
  target_window_end time
) returns timestamptz
language plpgsql stable set search_path = public as $$
declare
  adjusted_date date := target_local_date;
  adjusted_time time := target_time;
begin
  if target_window_start >= target_window_end then
    raise exception 'Janela segura inválida.' using errcode = '22023';
  end if;
  if adjusted_time < target_window_start then
    adjusted_time := target_window_start;
  elsif adjusted_time >= target_window_end then
    adjusted_date := adjusted_date + 1;
    adjusted_time := target_window_start;
  end if;
  return (adjusted_date + adjusted_time) at time zone target_timezone;
exception when invalid_parameter_value then
  return (adjusted_date + adjusted_time) at time zone 'America/Sao_Paulo';
end;
$$;

create or replace function public.claim_due_sequence_enrollments(
  target_materializer_id uuid,
  target_batch_size integer default 20,
  target_lease_seconds integer default 90
) returns table (
  link_id uuid,
  owner_id uuid,
  contact_id uuid,
  sequence_id uuid,
  sequence_step_id uuid,
  connection_id uuid,
  step_position integer,
  message_template text,
  attachments jsonb,
  contact_name text,
  contact_phone text,
  contact_email text,
  contact_interest text,
  contact_kind text,
  contact_origin text,
  contact_status text,
  contact_note text,
  sequence_priority smallint,
  jitter_min_seconds integer,
  jitter_max_seconds integer
)
language plpgsql security definer set search_path = public as $$
begin
  if target_batch_size < 1 or target_batch_size > 100
    or target_lease_seconds < 60 or target_lease_seconds > 600 then
    raise exception 'Parâmetros inválidos para o materializador.' using errcode = '22023';
  end if;

  update public.contact_sequences
  set materialize_token = null, materialize_expires_at = null
  where materialize_expires_at < now() and pending_message_id is null;

  update public.contact_sequences as link
  set schedule_status = 'legacy_hold', legacy_due_at = link.next_run_at,
      next_run_at = null, materialize_token = null, materialize_expires_at = null
  from public.sequences as sequence_row
  join public.outbound_settings as settings_row on settings_row.user_id = sequence_row.owner_id
  where link.sequence_id = sequence_row.id
    and link.paused_at is null and link.completed_at is null
    and link.pending_message_id is null and link.schedule_status = 'scheduled'
    and link.next_run_at < now() - make_interval(hours => settings_row.stale_tolerance_hours);

  update public.contact_sequences as link
  set paused_at = now(), pause_reason = 'Contato marcado como não contatar.',
      next_run_at = null, materialize_token = null, materialize_expires_at = null
  from public.contacts as contact_row
  where contact_row.id = link.contact_id and contact_row.do_not_contact
    and link.paused_at is null and link.completed_at is null;

  update public.contact_sequences as link
  set paused_at = now(), pause_reason = 'Conexão automática indisponível.',
      next_run_at = null, materialize_token = null, materialize_expires_at = null
  from public.sequences as sequence_row
  join public.whatsapp_connections as connection_row on connection_row.id = sequence_row.connection_id
  join public.outbound_settings as settings_row on settings_row.user_id = sequence_row.owner_id
  where link.sequence_id = sequence_row.id
    and settings_row.automatic_sending_enabled
    and sequence_row.connection_id is not null
    and (not connection_row.active or connection_row.health_status = 'error')
    and link.paused_at is null and link.completed_at is null;

  update public.contact_sequences as link
  set completed_at = now(), next_run_at = null,
      materialize_token = null, materialize_expires_at = null
  where link.paused_at is null and link.completed_at is null
    and link.pending_message_id is null
    and not exists(
      select 1 from public.sequence_steps as step
      where step.sequence_id = link.sequence_id and step.enabled
        and step.position >= link.current_step
    );

  update public.contact_sequences as link
  set next_run_at = public.outbound_safe_timestamp(
    (link.next_run_at at time zone settings_row.timezone)::date,
    coalesce((
      select step.send_time
      from public.sequence_steps as step
      where step.sequence_id = link.sequence_id and step.enabled and step.position >= link.current_step
      order by step.position limit 1
    ), settings_row.default_send_time),
    settings_row.timezone,
    settings_row.safe_window_start,
    settings_row.safe_window_end
  )
  from public.sequences as sequence_row
  join public.outbound_settings as settings_row on settings_row.user_id = sequence_row.owner_id
  where link.sequence_id = sequence_row.id
    and link.paused_at is null and link.completed_at is null
    and link.schedule_status = 'scheduled' and link.pending_message_id is null
    and link.next_run_at <= now()
    and (
      (now() at time zone settings_row.timezone)::time < settings_row.safe_window_start
      or (now() at time zone settings_row.timezone)::time >= settings_row.safe_window_end
    );

  return query
  with candidates as materialized (
    select link.id
    from public.contact_sequences as link
    join public.sequences as sequence_row on sequence_row.id = link.sequence_id and sequence_row.active
    join public.outbound_settings as settings_row on settings_row.user_id = sequence_row.owner_id
    join public.contacts as contact_row on contact_row.id = link.contact_id and contact_row.owner_id = sequence_row.owner_id
    join public.whatsapp_connections as connection_row on connection_row.id = sequence_row.connection_id and connection_row.owner_id = sequence_row.owner_id
    where link.paused_at is null and link.completed_at is null
      and link.schedule_status = 'scheduled' and link.pending_message_id is null
      and link.materialize_token is null and link.next_run_at <= now()
      and settings_row.automatic_sending_enabled and not settings_row.pause_all
      and not contact_row.do_not_contact and connection_row.active
      and connection_row.health_status <> 'error'
      and (connection_row.circuit_open_until is null or connection_row.circuit_open_until <= now())
      and (now() at time zone settings_row.timezone)::time >= settings_row.safe_window_start
      and (now() at time zone settings_row.timezone)::time
        < (settings_row.safe_window_end - interval '1 minute')::time
    order by link.next_run_at, link.id
    for update of link skip locked
    limit target_batch_size
  ), claimed as (
    update public.contact_sequences as link
    set materialize_token = target_materializer_id,
        materialize_expires_at = now() + make_interval(secs => target_lease_seconds)
    from candidates where link.id = candidates.id
    returning link.*
  )
  select claimed.id, sequence_row.owner_id, claimed.contact_id, claimed.sequence_id,
    step_row.id, sequence_row.connection_id, step_row.position, step_row.message_template,
    step_row.attachments, contact_row.name, contact_row.phone, contact_row.email,
    contact_row.interest, contact_row.kind, contact_row.origin, contact_row.status,
    contact_row.note, sequence_row.priority, settings_row.jitter_min_seconds,
    settings_row.jitter_max_seconds
  from claimed
  join public.sequences as sequence_row on sequence_row.id = claimed.sequence_id
  join public.outbound_settings as settings_row on settings_row.user_id = sequence_row.owner_id
  join public.contacts as contact_row on contact_row.id = claimed.contact_id
  join lateral (
    select step.* from public.sequence_steps as step
    where step.sequence_id = claimed.sequence_id and step.enabled and step.position >= claimed.current_step
    order by step.position limit 1
  ) as step_row on true;
end;
$$;

create or replace function public.finalize_sequence_materialization(
  target_link_id uuid,
  target_materializer_id uuid,
  target_message_id uuid,
  target_step_position integer
) returns boolean
language sql security definer set search_path = public as $$
  update public.contact_sequences
  set pending_message_id = target_message_id, current_step = target_step_position,
      materialize_token = null, materialize_expires_at = null
  where id = target_link_id and materialize_token = target_materializer_id
    and pending_message_id is null and paused_at is null and completed_at is null
  returning true;
$$;

create or replace function public.release_sequence_materialization(
  target_link_id uuid,
  target_materializer_id uuid
) returns void
language sql security definer set search_path = public as $$
  update public.contact_sequences
  set materialize_token = null, materialize_expires_at = null
  where id = target_link_id and materialize_token = target_materializer_id
    and pending_message_id is null;
$$;

create or replace function public.advance_sequence_after_send(target_message_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  message_row public.messages%rowtype;
  link_row public.contact_sequences%rowtype;
  sequence_row public.sequences%rowtype;
  settings_row public.outbound_settings%rowtype;
  next_step public.sequence_steps%rowtype;
  local_date date;
  scheduled timestamptz;
begin
  select * into message_row from public.messages where id = target_message_id and queue_status = 'sent';
  if not found or message_row.contact_sequence_id is null then return; end if;
  select * into link_row from public.contact_sequences where id = message_row.contact_sequence_id for update;
  if not found or link_row.pending_message_id <> message_row.id then return; end if;
  select * into sequence_row from public.sequences where id = link_row.sequence_id;
  select * into settings_row from public.outbound_settings where user_id = sequence_row.owner_id;
  select * into next_step from public.sequence_steps
  where sequence_id = link_row.sequence_id and enabled and position > link_row.current_step
  order by position limit 1;
  if not found then
    update public.contact_sequences set completed_at = coalesce(message_row.sent_at, now()),
      next_run_at = null, pending_message_id = null where id = link_row.id;
    return;
  end if;
  local_date := (coalesce(message_row.sent_at, now()) at time zone settings_row.timezone)::date + next_step.delay_days;
  scheduled := public.outbound_safe_timestamp(local_date,
    coalesce(next_step.send_time, settings_row.default_send_time), settings_row.timezone,
    settings_row.safe_window_start, settings_row.safe_window_end);
  update public.contact_sequences
  set current_step = next_step.position, next_run_at = scheduled,
      pending_message_id = null, schedule_status = 'scheduled', legacy_due_at = null
  where id = link_row.id;
end;
$$;

create or replace function public.mark_outbound_request_started(
  target_message_id uuid,
  target_owner_id uuid,
  target_claim_token uuid
) returns boolean
language sql security definer set search_path = public as $$
  update public.messages
  set request_started_at = now(), first_request_started_at = coalesce(first_request_started_at, now())
  where id = target_message_id and owner_id = target_owner_id
    and claim_token = target_claim_token and queue_status = 'sending'
    and request_started_at is null
  returning true;
$$;

create or replace function public.record_provider_circuit_result(
  target_base_url text,
  target_success boolean,
  target_failure_message text default null
) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  failure_count integer;
  backoff_level integer;
  base_minutes integer;
  opened_until timestamptz;
begin
  if target_success then
    update public.whatsapp_connections set circuit_failure_count = 0,
      circuit_backoff_level = 0, circuit_open_until = null,
      health_status = 'ready', health_error = null, health_checked_at = now()
    where lower(rtrim(endpoint_url, '/')) = lower(rtrim(target_base_url, '/'));
    return null;
  end if;
  select coalesce(max(circuit_failure_count), 0) + 1,
    coalesce(max(circuit_backoff_level), 0),
    coalesce(max(settings_row.circuit_base_minutes), 3)
  into failure_count, backoff_level, base_minutes
  from public.whatsapp_connections as connection_row
  left join public.outbound_settings as settings_row on settings_row.user_id = connection_row.owner_id
  where lower(rtrim(connection_row.endpoint_url, '/')) = lower(rtrim(target_base_url, '/'));
  if failure_count >= 3 then
    backoff_level := least(backoff_level + 1, 10);
    opened_until := now() + make_interval(mins => least(60, base_minutes * (2 ^ (backoff_level - 1))::integer));
  end if;
  update public.whatsapp_connections set circuit_failure_count = failure_count,
    circuit_backoff_level = backoff_level, circuit_open_until = opened_until,
    circuit_last_failure_at = now(),
    health_status = case when opened_until is null then health_status else 'unavailable' end,
    health_error = case when opened_until is null then health_error else coalesce(target_failure_message, 'Provedor temporariamente indisponível.') end,
    health_checked_at = now()
  where lower(rtrim(endpoint_url, '/')) = lower(rtrim(target_base_url, '/'));
  return opened_until;
end;
$$;

create or replace function public.claim_outbound_messages(
  target_dispatcher_id uuid,
  target_batch_size integer default 3,
  target_per_connection_limit integer default 1,
  target_lease_seconds integer default 75,
  target_owner_id uuid default null
) returns setof public.messages
language plpgsql security definer set search_path = public as $$
begin
  if target_batch_size < 1 or target_batch_size > 50
    or target_per_connection_limit <> 1
    or target_lease_seconds < 60 or target_lease_seconds > 600 then
    raise exception 'Parâmetros inválidos para o despachante.' using errcode = '22023';
  end if;

  update public.messages set queue_status = 'unknown', status = 'failed',
    provider_error_code = 'DELIVERY_LEASE_EXPIRED',
    provider_error_message = 'A segunda execução terminou sem confirmar o resultado do provedor.',
    uncertainty_reason = 'lease_expired_after_retry', claim_token = null, claim_expires_at = null
  where queue_status = 'sending' and claim_expires_at < now() and request_started_at is not null
    and (attempt_count >= 2 or first_request_started_at < now() - interval '15 minutes')
    and (target_owner_id is null or owner_id = target_owner_id);

  update public.messages set queue_status = 'pending', status = 'queued',
    next_attempt_at = now() + interval '60 seconds', request_started_at = null,
    claim_token = null, claim_expires_at = null
  where queue_status = 'sending' and claim_expires_at < now() and request_started_at is not null
    and attempt_count = 1 and first_request_started_at >= now() - interval '15 minutes'
    and (target_owner_id is null or owner_id = target_owner_id);

  update public.messages set queue_status = 'pending', status = 'queued', claimed_at = null,
    claim_token = null, claim_expires_at = null
  where queue_status = 'sending' and claim_expires_at < now() and request_started_at is null
    and (target_owner_id is null or owner_id = target_owner_id);

  update public.messages set queue_status = 'unknown', status = 'failed',
    provider_error_code = 'AMBIGUOUS_RETRY_EXPIRED',
    provider_error_message = 'A janela segura de 15 minutos para a retentativa expirou.',
    uncertainty_reason = 'ambiguous_retry_window_expired',
    next_attempt_at = null
  where queue_status = 'pending' and attempt_count = 1
    and first_request_started_at < now() - interval '15 minutes'
    and (target_owner_id is null or owner_id = target_owner_id);

  return query
  with ranked as materialized (
    select message_row.id,
      row_number() over (partition by message_row.connection_id order by message_row.priority desc, message_row.scheduled_at, message_row.created_at, message_row.id) as connection_rank
    from public.messages as message_row
    join public.contacts as contact_row on contact_row.id = message_row.contact_id and contact_row.owner_id = message_row.owner_id
    join public.whatsapp_connections as connection_row on connection_row.id = message_row.connection_id and connection_row.owner_id = message_row.owner_id
    left join public.outbound_settings as settings_row on settings_row.user_id = message_row.owner_id
    where message_row.queue_status = 'pending' and message_row.attempt_count < 2
      and message_row.scheduled_at <= now() and coalesce(message_row.next_attempt_at, message_row.scheduled_at) <= now()
      and message_row.confirmed_at is not null and not contact_row.do_not_contact
      and connection_row.active and connection_row.health_status <> 'error'
      and (connection_row.circuit_open_until is null or connection_row.circuit_open_until <= now())
      and not coalesce(settings_row.pause_all, false)
      and (message_row.source <> 'sequence' or coalesce(settings_row.automatic_sending_enabled, false))
      and (target_owner_id is null or message_row.owner_id = target_owner_id)
      and not exists(select 1 from public.messages as active_row where active_row.connection_id = message_row.connection_id and active_row.queue_status = 'sending')
      and (select count(*) from public.messages as host_row
        join public.whatsapp_connections as host_connection on host_connection.id = host_row.connection_id
        where host_row.queue_status = 'sending'
          and lower(rtrim(host_connection.endpoint_url, '/')) = lower(rtrim(connection_row.endpoint_url, '/'))
      ) < coalesce(settings_row.host_concurrency_limit, 3)
      and (select count(*) from public.messages as sent_row
        where sent_row.connection_id = connection_row.id and sent_row.queue_status = 'sent'
          and (sent_row.sent_at at time zone coalesce(settings_row.timezone, 'America/Sao_Paulo'))::date
            = (now() at time zone coalesce(settings_row.timezone, 'America/Sao_Paulo'))::date
      ) < connection_row.daily_limit
  ), candidates as (
    select message_row.id from public.messages as message_row
    join ranked on ranked.id = message_row.id
    join public.whatsapp_connections as candidate_connection on candidate_connection.id = message_row.connection_id
    where ranked.connection_rank <= 1
      and pg_try_advisory_xact_lock(hashtextextended(message_row.connection_id::text, 0))
      and pg_try_advisory_xact_lock(hashtextextended(lower(rtrim(candidate_connection.endpoint_url, '/')), 1))
    order by message_row.priority desc, message_row.scheduled_at, message_row.created_at, message_row.id
    for update of message_row skip locked limit target_batch_size
  ), claimed as (
    update public.messages as message_row set queue_status = 'sending', status = 'sending',
      attempt_count = message_row.attempt_count + 1, last_attempt_at = now(), claimed_at = now(),
      claim_token = target_dispatcher_id, claim_expires_at = now() + make_interval(secs => target_lease_seconds),
      request_started_at = null, provider_error_code = null, provider_error_message = null, uncertainty_reason = null
    from candidates where message_row.id = candidates.id returning message_row.*
  ) select * from claimed;
end;
$$;

create or replace function public.reschedule_legacy_sequence(target_link_id uuid)
returns timestamptz
language plpgsql security invoker set search_path = public as $$
declare
  link_row public.contact_sequences%rowtype;
  sequence_row public.sequences%rowtype;
  settings_row public.outbound_settings%rowtype;
  step_row public.sequence_steps%rowtype;
  scheduled timestamptz;
begin
  select link.* into link_row from public.contact_sequences as link
  join public.contacts as contact_row on contact_row.id = link.contact_id and contact_row.owner_id = auth.uid()
  where link.id = target_link_id and link.schedule_status = 'legacy_hold' for update;
  if not found then raise exception 'Passivo retido não encontrado.' using errcode = '42501'; end if;
  select * into sequence_row from public.sequences where id = link_row.sequence_id and owner_id = auth.uid();
  select * into settings_row from public.outbound_settings where user_id = auth.uid();
  select * into step_row from public.sequence_steps where sequence_id = link_row.sequence_id
    and enabled and position >= link_row.current_step order by position limit 1;
  scheduled := public.outbound_safe_timestamp((now() at time zone settings_row.timezone)::date,
    coalesce(step_row.send_time, settings_row.default_send_time), settings_row.timezone,
    settings_row.safe_window_start, settings_row.safe_window_end);
  if scheduled < now() then scheduled := now(); end if;
  update public.contact_sequences set schedule_status = 'scheduled', legacy_due_at = null,
    next_run_at = scheduled where id = target_link_id;
  return scheduled;
end;
$$;

create or replace function public.configure_outbound_cron(target_base_url text, target_bearer text)
returns void
language plpgsql security definer set search_path = public, vault, cron as $$
declare
  url_secret_id uuid;
  bearer_secret_id uuid;
  dispatch_url text := rtrim(target_base_url, '/') || '/api/outbound/dispatch';
begin
  if target_base_url !~ '^https://' or length(target_bearer) < 24 then
    raise exception 'Configuração do cron inválida.' using errcode = '22023';
  end if;
  select id into url_secret_id from vault.secrets where name = 'outbound_dispatch_url';
  if url_secret_id is null then
    perform vault.create_secret(dispatch_url, 'outbound_dispatch_url', 'Endpoint do despachante Ninja Green');
  else
    perform vault.update_secret(url_secret_id, dispatch_url, 'outbound_dispatch_url', 'Endpoint do despachante Ninja Green');
  end if;
  select id into bearer_secret_id from vault.secrets where name = 'outbound_dispatch_bearer';
  if bearer_secret_id is null then
    perform vault.create_secret(target_bearer, 'outbound_dispatch_bearer', 'Bearer do despachante Ninja Green');
  else
    perform vault.update_secret(bearer_secret_id, target_bearer, 'outbound_dispatch_bearer', 'Bearer do despachante Ninja Green');
  end if;
  perform cron.schedule('ninja-green-outbound-dispatch', '* * * * *', $command$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'outbound_dispatch_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'outbound_dispatch_bearer')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 40000
    );
  $command$);
end;
$$;

create or replace function public.verify_outbound_cron_bearer(target_bearer text)
returns boolean
language sql security definer set search_path = public, vault as $$
  select coalesce(
    target_bearer = (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'outbound_dispatch_bearer'
      limit 1
    ),
    false
  );
$$;

revoke all on function public.claim_due_sequence_enrollments(uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.finalize_sequence_materialization(uuid, uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.release_sequence_materialization(uuid, uuid) from public, anon, authenticated;
revoke all on function public.advance_sequence_after_send(uuid) from public, anon, authenticated;
revoke all on function public.mark_outbound_request_started(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.record_provider_circuit_result(text, boolean, text) from public, anon, authenticated;
revoke all on function public.configure_outbound_cron(text, text) from public, anon, authenticated;
revoke all on function public.verify_outbound_cron_bearer(text) from public, anon, authenticated;
grant execute on function public.claim_due_sequence_enrollments(uuid, integer, integer) to service_role;
grant execute on function public.finalize_sequence_materialization(uuid, uuid, uuid, integer) to service_role;
grant execute on function public.release_sequence_materialization(uuid, uuid) to service_role;
grant execute on function public.advance_sequence_after_send(uuid) to service_role;
grant execute on function public.mark_outbound_request_started(uuid, uuid, uuid) to service_role;
grant execute on function public.record_provider_circuit_result(text, boolean, text) to service_role;
grant execute on function public.configure_outbound_cron(text, text) to service_role;
grant execute on function public.verify_outbound_cron_bearer(text) to service_role;
revoke all on function public.reschedule_legacy_sequence(uuid) from public, anon;
grant execute on function public.reschedule_legacy_sequence(uuid) to authenticated;


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
create index if not exists messages_dispatch_idx on public.messages(queue_status, scheduled_at, priority desc) where queue_status = 'pending';
create index if not exists messages_connection_sent_idx on public.messages(connection_id, sent_at) where queue_status = 'sent';
create index if not exists messages_owner_queue_idx on public.messages(owner_id, queue_status, created_at desc);
create index if not exists quick_messages_user_updated_idx on public.quick_messages(user_id, updated_at desc);
create index if not exists whatsapp_connections_owner_idx on public.whatsapp_connections(owner_id);
create index if not exists whatsapp_attendants_user_idx on public.whatsapp_connection_attendants(user_id);
