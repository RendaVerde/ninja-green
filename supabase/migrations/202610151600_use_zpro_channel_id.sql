alter table public.whatsapp_connections
  add column if not exists channel_id bigint;

do $$
begin
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

comment on column public.whatsapp_connections.channel_id is
  'Identificador inteiro do canal ZPRO usado por showChannelById.';

comment on column public.whatsapp_connections.channel_number is
  'Legado: a identificação por número não é confiável para canais vinculados por QR code.';
