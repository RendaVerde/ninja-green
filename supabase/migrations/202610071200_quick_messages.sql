create table if not exists public.quick_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.quick_messages enable row level security;

drop policy if exists "quick_messages_owner_all" on public.quick_messages;
create policy "quick_messages_owner_all" on public.quick_messages
for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

create index if not exists quick_messages_user_updated_idx
on public.quick_messages(user_id, updated_at desc);

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

revoke all on function public.resolve_contact_audience(text, uuid[], uuid[]) from public;
grant execute on function public.resolve_contact_audience(text, uuid[], uuid[]) to authenticated;
revoke all on function public.configure_sequence_audience(uuid, text, uuid[], uuid[], boolean) from public;
grant execute on function public.configure_sequence_audience(uuid, text, uuid[], uuid[], boolean) to authenticated;
