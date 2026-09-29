-- Run this in the Supabase SQL Editor (Project -> SQL Editor -> New query)
-- RLS intentionally left off for now, per assignment instructions.

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

-- Auto-create a (mostly empty) profile row whenever a new auth user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Storage bucket for profile photos (never store binary image data in the DB)
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- storage.objects has RLS on by default regardless of our own tables' RLS,
-- so it needs its own policies even though app-level RLS is off for now.
drop policy if exists "Authenticated users can upload avatars" on storage.objects;
create policy "Authenticated users can upload avatars"
on storage.objects for insert
to authenticated
with check (bucket_id = 'avatars');

drop policy if exists "Authenticated users can update their avatars" on storage.objects;
create policy "Authenticated users can update their avatars"
on storage.objects for update
to authenticated
using (bucket_id = 'avatars');

drop policy if exists "Public can view avatars" on storage.objects;
create policy "Public can view avatars"
on storage.objects for select
to public
using (bucket_id = 'avatars');
