alter table public.messages
  add column if not exists provider_ticket_id text,
  add column if not exists provider_error_code text,
  add column if not exists provider_error_message text;
