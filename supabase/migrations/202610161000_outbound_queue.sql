alter table public.contacts
  add column if not exists do_not_contact boolean not null default false;

alter table public.contact_sequences
  add column if not exists pause_reason text;

alter table public.whatsapp_connections
  add column if not exists daily_limit integer not null default 30,
  add column if not exists health_status text not null default 'unknown',
  add column if not exists health_error text,
  add column if not exists health_checked_at timestamptz;

alter table public.messages
  add column if not exists queue_status text,
  add column if not exists source text,
  add column if not exists connection_id uuid,
  add column if not exists priority smallint not null default 100,
  add column if not exists scheduled_at timestamptz,
  add column if not exists confirmed_at timestamptz,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists request_started_at timestamptz,
  add column if not exists claimed_at timestamptz,
  add column if not exists claim_token uuid,
  add column if not exists claim_expires_at timestamptz,
  add column if not exists canceled_at timestamptz,
  add column if not exists cancel_reason text,
  add column if not exists uncertainty_reason text;

create table if not exists public.outbound_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  automatic_sending_enabled boolean not null default false,
  pause_all boolean not null default false,
  timezone text not null default 'America/Sao_Paulo',
  per_connection_batch_limit integer not null default 3,
  last_used_connection_id uuid references public.whatsapp_connections(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.outbound_settings enable row level security;

drop policy if exists "outbound_settings_owner_all" on public.outbound_settings;
create policy "outbound_settings_owner_all"
on public.outbound_settings for all
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and (
    last_used_connection_id is null
    or exists(
      select 1
      from public.whatsapp_connections
      where id = last_used_connection_id
        and owner_id = auth.uid()
    )
  )
);

update public.messages
set
  queue_status = case status
    when 'sent' then 'sent'
    when 'failed' then 'failed'
    when 'opened' then 'canceled'
    when 'sending' then 'unknown'
    else 'canceled'
  end,
  source = 'legacy',
  scheduled_at = coalesce(sent_at, created_at),
  confirmed_at = created_at,
  canceled_at = case when status in ('opened', 'queued') then coalesce(sent_at, created_at) else canceled_at end,
  cancel_reason = case
    when status = 'opened' then 'legacy_manual_opened'
    when status = 'queued' then 'legacy_queue_not_migrated'
    else cancel_reason
  end,
  uncertainty_reason = case
    when status = 'sending' then 'legacy_sending_state'
    else uncertainty_reason
  end
where queue_status is null;

alter table public.messages
  drop constraint if exists messages_queue_status_check,
  add constraint messages_queue_status_check
    check (queue_status is null or queue_status in ('pending', 'sending', 'sent', 'failed', 'unknown', 'canceled')) not valid,
  drop constraint if exists messages_source_check,
  add constraint messages_source_check
    check (source is null or source in ('single', 'quick', 'sequence', 'legacy')) not valid,
  drop constraint if exists messages_attempt_count_check,
  add constraint messages_attempt_count_check
    check (attempt_count >= 0) not valid,
  drop constraint if exists messages_priority_check,
  add constraint messages_priority_check
    check (priority between 0 and 1000) not valid;

alter table public.whatsapp_connections
  drop constraint if exists whatsapp_connections_daily_limit_check,
  add constraint whatsapp_connections_daily_limit_check
    check (daily_limit between 1 and 10000) not valid,
  drop constraint if exists whatsapp_connections_health_status_check,
  add constraint whatsapp_connections_health_status_check
    check (health_status in ('unknown', 'ready', 'error')) not valid;

alter table public.outbound_settings
  drop constraint if exists outbound_settings_batch_limit_check,
  add constraint outbound_settings_batch_limit_check
    check (per_connection_batch_limit between 1 and 50) not valid;

create unique index if not exists contacts_id_owner_unique_idx
  on public.contacts(id, owner_id);
create unique index if not exists whatsapp_connections_id_owner_unique_idx
  on public.whatsapp_connections(id, owner_id);

alter table public.messages
  drop constraint if exists messages_contact_owner_fk,
  add constraint messages_contact_owner_fk
    foreign key (contact_id, owner_id)
    references public.contacts(id, owner_id)
    on delete cascade not valid,
  drop constraint if exists messages_connection_owner_fk,
  add constraint messages_connection_owner_fk
    foreign key (connection_id, owner_id)
    references public.whatsapp_connections(id, owner_id)
    on delete restrict not valid;

alter table public.messages validate constraint messages_queue_status_check;
alter table public.messages validate constraint messages_source_check;
alter table public.messages validate constraint messages_attempt_count_check;
alter table public.messages validate constraint messages_priority_check;
alter table public.whatsapp_connections validate constraint whatsapp_connections_daily_limit_check;
alter table public.whatsapp_connections validate constraint whatsapp_connections_health_status_check;
alter table public.outbound_settings validate constraint outbound_settings_batch_limit_check;
alter table public.messages validate constraint messages_contact_owner_fk;
alter table public.messages validate constraint messages_connection_owner_fk;

create index if not exists messages_dispatch_idx
  on public.messages(queue_status, scheduled_at, priority desc)
  where queue_status = 'pending';
create index if not exists messages_connection_sent_idx
  on public.messages(connection_id, sent_at)
  where queue_status = 'sent';
create index if not exists messages_owner_queue_idx
  on public.messages(owner_id, queue_status, created_at desc);

create or replace function public.claim_outbound_messages(
  target_dispatcher_id uuid,
  target_batch_size integer default 3,
  target_per_connection_limit integer default 3,
  target_lease_seconds integer default 75,
  target_owner_id uuid default null
) returns setof public.messages
language plpgsql
security definer
set search_path = public
as $$
begin
  if target_batch_size < 1 or target_batch_size > 50
    or target_per_connection_limit < 1 or target_per_connection_limit > 50
    or target_lease_seconds < 60 or target_lease_seconds > 600 then
    raise exception 'Parâmetros inválidos para o despachante.' using errcode = '22023';
  end if;

  update public.messages
  set
    queue_status = 'unknown',
    status = 'failed',
    provider_error_code = 'DELIVERY_LEASE_EXPIRED',
    provider_error_message = 'A execução terminou sem confirmar o resultado do provedor.',
    uncertainty_reason = 'lease_expired_after_request_started',
    claim_token = null,
    claim_expires_at = null
  where queue_status = 'sending'
    and claim_expires_at < now()
    and request_started_at is not null
    and (target_owner_id is null or owner_id = target_owner_id);

  update public.messages
  set
    queue_status = 'pending',
    status = 'queued',
    claimed_at = null,
    claim_token = null,
    claim_expires_at = null
  where queue_status = 'sending'
    and claim_expires_at < now()
    and request_started_at is null
    and (target_owner_id is null or owner_id = target_owner_id);

  return query
  with ranked as materialized (
    select
      message_row.id,
      row_number() over (
        partition by message_row.connection_id
        order by message_row.priority desc, message_row.scheduled_at, message_row.created_at, message_row.id
      ) as connection_rank
    from public.messages as message_row
    join public.contacts as contact_row
      on contact_row.id = message_row.contact_id
      and contact_row.owner_id = message_row.owner_id
    join public.whatsapp_connections as connection_row
      on connection_row.id = message_row.connection_id
      and connection_row.owner_id = message_row.owner_id
    left join public.outbound_settings as settings_row
      on settings_row.user_id = message_row.owner_id
    where message_row.queue_status = 'pending'
      and message_row.scheduled_at <= now()
      and coalesce(message_row.next_attempt_at, message_row.scheduled_at) <= now()
      and message_row.confirmed_at is not null
      and not contact_row.do_not_contact
      and connection_row.active
      and connection_row.health_status <> 'error'
      and not coalesce(settings_row.pause_all, false)
      and (
        message_row.source <> 'sequence'
        or coalesce(settings_row.automatic_sending_enabled, false)
      )
      and (target_owner_id is null or message_row.owner_id = target_owner_id)
      and (
        select count(*)
        from public.messages as sent_row
        where sent_row.connection_id = connection_row.id
          and sent_row.queue_status = 'sent'
          and (sent_row.sent_at at time zone coalesce(settings_row.timezone, 'America/Sao_Paulo'))::date
            = (now() at time zone coalesce(settings_row.timezone, 'America/Sao_Paulo'))::date
      ) < connection_row.daily_limit
  ), candidates as (
    select message_row.id
    from public.messages as message_row
    join ranked on ranked.id = message_row.id
    where ranked.connection_rank <= target_per_connection_limit
    order by message_row.priority desc, message_row.scheduled_at, message_row.created_at, message_row.id
    for update of message_row skip locked
    limit target_batch_size
  ), claimed as (
    update public.messages as message_row
    set
      queue_status = 'sending',
      status = 'sending',
      attempt_count = message_row.attempt_count + 1,
      last_attempt_at = now(),
      claimed_at = now(),
      claim_token = target_dispatcher_id,
      claim_expires_at = now() + make_interval(secs => target_lease_seconds),
      request_started_at = null,
      provider_error_code = null,
      provider_error_message = null,
      uncertainty_reason = null
    from candidates
    where message_row.id = candidates.id
    returning message_row.*
  )
  select * from claimed;
end;
$$;

revoke all on function public.claim_outbound_messages(uuid, integer, integer, integer, uuid) from public;
revoke all on function public.claim_outbound_messages(uuid, integer, integer, integer, uuid) from anon;
revoke all on function public.claim_outbound_messages(uuid, integer, integer, integer, uuid) from authenticated;
grant execute on function public.claim_outbound_messages(uuid, integer, integer, integer, uuid) to service_role;
