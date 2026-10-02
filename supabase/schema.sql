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

alter table public.profiles enable row level security;
alter table public.contacts enable row level security;
alter table public.sequences enable row level security;
alter table public.sequence_steps enable row level security;
alter table public.contact_sequences enable row level security;
alter table public.messages enable row level security;

create policy "profiles_read_own_or_admin" on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy "contacts_owner_all" on public.contacts for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "sequences_owner_all" on public.sequences for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "steps_through_sequence" on public.sequence_steps for all using (exists(select 1 from public.sequences where sequences.id = sequence_steps.sequence_id and sequences.owner_id = auth.uid())) with check (exists(select 1 from public.sequences where sequences.id = sequence_steps.sequence_id and sequences.owner_id = auth.uid()));
create policy "contact_sequences_owner_all" on public.contact_sequences for all using (exists(select 1 from public.contacts where contacts.id = contact_sequences.contact_id and contacts.owner_id = auth.uid())) with check (exists(select 1 from public.contacts where contacts.id = contact_sequences.contact_id and contacts.owner_id = auth.uid()));
create policy "messages_owner_all" on public.messages for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create index if not exists contacts_owner_status_idx on public.contacts(owner_id, status);
create index if not exists sequences_owner_idx on public.sequences(owner_id);
create index if not exists contact_sequences_next_run_idx on public.contact_sequences(next_run_at) where paused_at is null and completed_at is null;
create index if not exists messages_contact_created_idx on public.messages(contact_id, created_at desc);
