create extension if not exists pg_cron with schema pg_catalog;
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
