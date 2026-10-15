alter table public.whatsapp_connections
  add column if not exists channel_number text,
  add column if not exists channel_id bigint;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'whatsapp_connections_channel_number_check'
      and conrelid = 'public.whatsapp_connections'::regclass
  ) then
    alter table public.whatsapp_connections
      add constraint whatsapp_connections_channel_number_check
      check (channel_number is null or channel_number ~ '^55[0-9]{10,11}$')
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'whatsapp_connections_channel_id_check'
      and conrelid = 'public.whatsapp_connections'::regclass
  ) then
    alter table public.whatsapp_connections
      add constraint whatsapp_connections_channel_id_check
      check (channel_id is null or channel_id > 0)
      not valid;
  end if;
end
$$;
