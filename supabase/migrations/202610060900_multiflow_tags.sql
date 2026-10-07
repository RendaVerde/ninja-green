create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  color text check (color is null or color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
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

alter table public.tags enable row level security;
alter table public.contact_tags enable row level security;
alter table public.sequence_tag_targets enable row level security;
alter table public.sequence_contact_targets enable row level security;

drop policy if exists "tags_owner_all" on public.tags;
create policy "tags_owner_all" on public.tags for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "contact_tags_owner_all" on public.contact_tags;
create policy "contact_tags_owner_all" on public.contact_tags for all using (user_id = auth.uid() and exists(select 1 from public.contacts where contacts.id = contact_tags.contact_id and contacts.owner_id = auth.uid()) and exists(select 1 from public.tags where tags.id = contact_tags.tag_id and tags.user_id = auth.uid())) with check (user_id = auth.uid() and exists(select 1 from public.contacts where contacts.id = contact_tags.contact_id and contacts.owner_id = auth.uid()) and exists(select 1 from public.tags where tags.id = contact_tags.tag_id and tags.user_id = auth.uid()));

drop policy if exists "sequence_tag_targets_owner_all" on public.sequence_tag_targets;
create policy "sequence_tag_targets_owner_all" on public.sequence_tag_targets for all using (user_id = auth.uid() and exists(select 1 from public.sequences where sequences.id = sequence_tag_targets.sequence_id and sequences.owner_id = auth.uid()) and exists(select 1 from public.tags where tags.id = sequence_tag_targets.tag_id and tags.user_id = auth.uid())) with check (user_id = auth.uid() and exists(select 1 from public.sequences where sequences.id = sequence_tag_targets.sequence_id and sequences.owner_id = auth.uid()) and exists(select 1 from public.tags where tags.id = sequence_tag_targets.tag_id and tags.user_id = auth.uid()));

drop policy if exists "sequence_contact_targets_owner_all" on public.sequence_contact_targets;
create policy "sequence_contact_targets_owner_all" on public.sequence_contact_targets for all using (user_id = auth.uid() and exists(select 1 from public.sequences where sequences.id = sequence_contact_targets.sequence_id and sequences.owner_id = auth.uid()) and exists(select 1 from public.contacts where contacts.id = sequence_contact_targets.contact_id and contacts.owner_id = auth.uid())) with check (user_id = auth.uid() and exists(select 1 from public.sequences where sequences.id = sequence_contact_targets.sequence_id and sequences.owner_id = auth.uid()) and exists(select 1 from public.contacts where contacts.id = sequence_contact_targets.contact_id and contacts.owner_id = auth.uid()));

drop policy if exists "contact_sequences_owner_all" on public.contact_sequences;
create policy "contact_sequences_owner_all" on public.contact_sequences for all using (exists(select 1 from public.contacts where contacts.id = contact_sequences.contact_id and contacts.owner_id = auth.uid()) and exists(select 1 from public.sequences where sequences.id = contact_sequences.sequence_id and sequences.owner_id = auth.uid())) with check (exists(select 1 from public.contacts where contacts.id = contact_sequences.contact_id and contacts.owner_id = auth.uid()) and exists(select 1 from public.sequences where sequences.id = contact_sequences.sequence_id and sequences.owner_id = auth.uid()));

create unique index if not exists tags_user_name_unique_idx on public.tags(user_id, lower(btrim(name)));
create index if not exists contact_tags_user_contact_idx on public.contact_tags(user_id, contact_id);
create index if not exists contact_tags_user_tag_idx on public.contact_tags(user_id, tag_id);
create index if not exists sequence_tag_targets_user_sequence_idx on public.sequence_tag_targets(user_id, sequence_id);
create index if not exists sequence_contact_targets_user_sequence_idx on public.sequence_contact_targets(user_id, sequence_id);

do $$
begin
  if exists(
    select 1 from public.contact_sequences
    where paused_at is null and completed_at is null
    group by contact_id having count(*) > 1
  ) then
    raise exception 'Existem contatos em mais de uma sequência ativa. Resolva-os antes de reaplicar esta migração.';
  end if;
end;
$$;

create unique index if not exists contact_sequences_one_active_idx on public.contact_sequences(contact_id) where paused_at is null and completed_at is null;

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
  if current_user_id is null then raise exception 'Sessão expirada.' using errcode = '42501'; end if;
  if target_audience not in ('Todos os contatos', 'Somente clientes', 'Somente licenciados') then raise exception 'Público inválido.' using errcode = '22023'; end if;
  perform 1 from public.sequences where id = target_sequence_id and owner_id = current_user_id for update;
  if not found then raise exception 'Cadência não encontrada.' using errcode = '42501'; end if;

  select coalesce(array_agg(distinct value), '{}'::uuid[]) into normalized_tag_ids from unnest(coalesce(target_tag_ids, '{}'::uuid[])) as value;
  select coalesce(array_agg(distinct value), '{}'::uuid[]) into normalized_contact_ids from unnest(coalesce(target_contact_ids, '{}'::uuid[])) as value;
  if exists(select 1 from unnest(normalized_tag_ids) as selected_id where not exists(select 1 from public.tags where id = selected_id and user_id = current_user_id)) then raise exception 'Uma ou mais tags são inválidas.' using errcode = '42501'; end if;
  if exists(select 1 from unnest(normalized_contact_ids) as selected_id where not exists(select 1 from public.contacts where id = selected_id and owner_id = current_user_id)) then raise exception 'Um ou mais contatos são inválidos.' using errcode = '42501'; end if;

  select coalesce(array_agg(contact_row.id), '{}'::uuid[]) into resolved_contact_ids
  from public.contacts as contact_row
  where contact_row.owner_id = current_user_id
    and (target_audience = 'Todos os contatos' or (target_audience = 'Somente clientes' and contact_row.kind = 'Cliente') or (target_audience = 'Somente licenciados' and contact_row.kind = 'Licenciado'))
    and ((cardinality(normalized_tag_ids) = 0 and cardinality(normalized_contact_ids) = 0) or contact_row.id = any(normalized_contact_ids) or exists(select 1 from public.contact_tags where user_id = current_user_id and contact_id = contact_row.id and tag_id = any(normalized_tag_ids)));

  select coalesce(jsonb_agg(jsonb_build_object('contactId', active_link.contact_id, 'contactName', contact_row.name, 'sequenceId', active_link.sequence_id, 'sequenceName', sequence_row.name) order by contact_row.name), '[]'::jsonb) into conflicts
  from public.contact_sequences as active_link
  join public.contacts as contact_row on contact_row.id = active_link.contact_id and contact_row.owner_id = current_user_id
  join public.sequences as sequence_row on sequence_row.id = active_link.sequence_id and sequence_row.owner_id = current_user_id
  where active_link.contact_id = any(resolved_contact_ids) and active_link.sequence_id <> target_sequence_id and active_link.paused_at is null and active_link.completed_at is null;
  if jsonb_array_length(conflicts) > 0 and not confirm_move then return jsonb_build_object('status', 'conflict', 'conflicts', conflicts, 'resolvedCount', cardinality(resolved_contact_ids)); end if;

  update public.sequences set audience = target_audience, updated_at = now() where id = target_sequence_id and owner_id = current_user_id;
  delete from public.sequence_tag_targets where sequence_id = target_sequence_id and user_id = current_user_id;
  insert into public.sequence_tag_targets(user_id, sequence_id, tag_id) select current_user_id, target_sequence_id, selected_id from unnest(normalized_tag_ids) as selected_id;
  delete from public.sequence_contact_targets where sequence_id = target_sequence_id and user_id = current_user_id;
  insert into public.sequence_contact_targets(user_id, sequence_id, contact_id) select current_user_id, target_sequence_id, selected_id from unnest(normalized_contact_ids) as selected_id;

  update public.contact_sequences as active_link set paused_at = now(), next_run_at = null
  where active_link.sequence_id = target_sequence_id and active_link.paused_at is null and active_link.completed_at is null and not (active_link.contact_id = any(resolved_contact_ids))
    and exists(select 1 from public.contacts where id = active_link.contact_id and owner_id = current_user_id);
  get diagnostics removed_count = row_count;
  if confirm_move then
    update public.contact_sequences as active_link set paused_at = now(), next_run_at = null
    where active_link.contact_id = any(resolved_contact_ids) and active_link.sequence_id <> target_sequence_id and active_link.paused_at is null and active_link.completed_at is null
      and exists(select 1 from public.contacts where id = active_link.contact_id and owner_id = current_user_id)
      and exists(select 1 from public.sequences where id = active_link.sequence_id and owner_id = current_user_id);
    get diagnostics moved_count = row_count;
  end if;

  select delay_days into first_delay from public.sequence_steps where sequence_id = target_sequence_id and enabled = true order by position limit 1;
  foreach selected_contact_id in array resolved_contact_ids loop
    if not exists(select 1 from public.contact_sequences where contact_id = selected_contact_id and sequence_id = target_sequence_id and paused_at is null and completed_at is null) then
      insert into public.contact_sequences(contact_id, sequence_id, current_step, next_run_at, paused_at, completed_at)
      values (selected_contact_id, target_sequence_id, 0, case when first_delay is null then null else now() + make_interval(days => first_delay) end, null, null)
      on conflict (contact_id, sequence_id) do update set current_step = 0, next_run_at = excluded.next_run_at, paused_at = null, completed_at = null;
      assigned_count := assigned_count + 1;
    end if;
  end loop;
  return jsonb_build_object('status', 'success', 'conflicts', conflicts, 'resolvedCount', cardinality(resolved_contact_ids), 'assignedCount', assigned_count, 'movedCount', moved_count, 'removedCount', removed_count);
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
  if current_user_id is null then raise exception 'Sessão expirada.' using errcode = '42501'; end if;
  select * into source_sequence from public.sequences where id = target_sequence_id and owner_id = current_user_id;
  if not found then raise exception 'Cadência não encontrada.' using errcode = '42501'; end if;
  insert into public.sequences(owner_id, name, audience, pause_on_reply, active) values (current_user_id, duplicate_name, source_sequence.audience, source_sequence.pause_on_reply, source_sequence.active) returning id into new_sequence_id;
  insert into public.sequence_steps(sequence_id, position, delay_days, title, message_template, enabled) select new_sequence_id, position, delay_days, title, message_template, enabled from public.sequence_steps where sequence_id = target_sequence_id order by position;
  insert into public.sequence_tag_targets(user_id, sequence_id, tag_id) select current_user_id, new_sequence_id, tag_id from public.sequence_tag_targets where sequence_id = target_sequence_id and user_id = current_user_id;
  insert into public.sequence_contact_targets(user_id, sequence_id, contact_id) select current_user_id, new_sequence_id, contact_id from public.sequence_contact_targets where sequence_id = target_sequence_id and user_id = current_user_id;
  return new_sequence_id;
end;
$$;

revoke all on function public.configure_sequence_audience(uuid, text, uuid[], uuid[], boolean) from public;
grant execute on function public.configure_sequence_audience(uuid, text, uuid[], uuid[], boolean) to authenticated;
revoke all on function public.duplicate_sequence(uuid, text) from public;
grant execute on function public.duplicate_sequence(uuid, text) to authenticated;
