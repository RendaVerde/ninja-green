alter table public.sequence_steps
add column if not exists attachments jsonb not null default '[]'::jsonb;

alter table public.quick_messages
add column if not exists attachments jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists(select 1 from pg_constraint where conname = 'sequence_steps_attachments_array_check') then
    alter table public.sequence_steps add constraint sequence_steps_attachments_array_check check (jsonb_typeof(attachments) = 'array');
  end if;
  if not exists(select 1 from pg_constraint where conname = 'quick_messages_attachments_array_check') then
    alter table public.quick_messages add constraint quick_messages_attachments_array_check check (jsonb_typeof(attachments) = 'array');
  end if;
end;
$$;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('message-attachments', 'message-attachments', false, 52428800, array['image/*', 'video/*', 'application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "message_attachments_select_own" on storage.objects;
create policy "message_attachments_select_own" on storage.objects for select to authenticated
using (bucket_id = 'message-attachments' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "message_attachments_insert_own" on storage.objects;
create policy "message_attachments_insert_own" on storage.objects for insert to authenticated
with check (bucket_id = 'message-attachments' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "message_attachments_update_own" on storage.objects;
create policy "message_attachments_update_own" on storage.objects for update to authenticated
using (bucket_id = 'message-attachments' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'message-attachments' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "message_attachments_delete_own" on storage.objects;
create policy "message_attachments_delete_own" on storage.objects for delete to authenticated
using (bucket_id = 'message-attachments' and (storage.foldername(name))[1] = auth.uid()::text);

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

revoke all on function public.duplicate_sequence(uuid, text) from public;
grant execute on function public.duplicate_sequence(uuid, text) to authenticated;
