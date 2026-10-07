-- Assignment 4: AI captions, voting, and RLS on every table.
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------- schema --

alter table public.profiles add column if not exists hometown text;

alter table public.photos
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- One row per AI run; keeps the exact prompts that produced the captions.
create table if not exists public.generations (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  photo_id bigint not null references public.photos(id) on delete cascade,
  model text not null,
  system_prompt text not null,
  user_prompt text not null,
  context text,
  created_at timestamptz not null default now()
);

alter table public.captions
  add column if not exists generation_id bigint references public.generations(id) on delete cascade,
  add column if not exists angle text;

alter table public.captions drop constraint if exists captions_angle_check;
alter table public.captions
  add constraint captions_angle_check check (angle is null or angle in ('photo', 'name', 'both'));

create table if not exists public.caption_votes (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  caption_id bigint not null references public.captions(id) on delete cascade,
  vote smallint not null check (vote in (-1, 1)),
  created_at timestamptz not null default now(),
  unique (user_id, caption_id)
);

create index if not exists captions_photo_id_idx on public.captions (photo_id);
create index if not exists caption_votes_caption_id_idx on public.caption_votes (caption_id);
create index if not exists generations_user_created_idx on public.generations (user_id, created_at desc);

-- Public vote totals. Runs with the view owner's rights on purpose so anyone can
-- see aggregate scores without being able to read individual votes.
create or replace view public.caption_scores as
select
  c.id as caption_id,
  c.photo_id,
  c.created_at,
  coalesce(sum(v.vote), 0)::int as score,
  (count(*) filter (where v.vote = 1))::int as upvotes,
  (count(*) filter (where v.vote = -1))::int as downvotes
from public.captions c
left join public.caption_votes v on v.caption_id = c.id
group by c.id;

revoke all on public.caption_scores from anon, authenticated;
grant select on public.caption_scores to anon, authenticated;

-- ------------------------------------------------------------------- RLS --

alter table public.profiles enable row level security;
alter table public.likes enable row level security;
alter table public.photos enable row level security;
alter table public.captions enable row level security;
alter table public.generations enable row level security;
alter table public.caption_votes enable row level security;

-- profiles: you can only see and edit your own row (the signup trigger creates it)
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- likes: private to each user
drop policy if exists "likes_select_own" on public.likes;
create policy "likes_select_own" on public.likes
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "likes_insert_own" on public.likes;
create policy "likes_insert_own" on public.likes
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "likes_delete_own" on public.likes;
create policy "likes_delete_own" on public.likes
  for delete to authenticated using (user_id = (select auth.uid()));

-- photos + captions: world-readable, writable only through save_generation()
drop policy if exists "Public read access" on public.photos;
drop policy if exists "photos_select_all" on public.photos;
create policy "photos_select_all" on public.photos
  for select to anon, authenticated using (true);

drop policy if exists "Public read access" on public.captions;
drop policy if exists "captions_select_all" on public.captions;
create policy "captions_select_all" on public.captions
  for select to anon, authenticated using (true);

-- generations (prompts): visible only to the user who ran them
drop policy if exists "generations_select_own" on public.generations;
create policy "generations_select_own" on public.generations
  for select to authenticated using (user_id = (select auth.uid()));

-- votes: each user can only see and change their own votes
drop policy if exists "caption_votes_select_own" on public.caption_votes;
create policy "caption_votes_select_own" on public.caption_votes
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "caption_votes_insert_own" on public.caption_votes;
create policy "caption_votes_insert_own" on public.caption_votes
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "caption_votes_update_own" on public.caption_votes;
create policy "caption_votes_update_own" on public.caption_votes
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "caption_votes_delete_own" on public.caption_votes;
create policy "caption_votes_delete_own" on public.caption_votes
  for delete to authenticated using (user_id = (select auth.uid()));

-- --------------------------------------------------------------- functions --

-- Generations left for the signed-in user in the last 24 hours (limit: 10).
create or replace function public.generations_remaining()
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() is null then 0
    else greatest(0, 10 - (
      select count(*) from public.generations
      where user_id = auth.uid() and created_at > now() - interval '24 hours'
    ))::int
  end;
$$;

-- Creates a photo, its generation record (with prompts) and its captions atomically.
create or replace function public.save_generation(
  p_image_url text,
  p_alt_text text,
  p_model text,
  p_system_prompt text,
  p_user_prompt text,
  p_context text,
  p_captions jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_photo bigint;
  v_gen bigint;
  v_count int;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if public.generations_remaining() <= 0 then
    raise exception 'daily generation limit reached' using errcode = 'P0001';
  end if;

  if p_image_url is null
     or position('/storage/v1/object/public/photos/' || v_user::text || '/' in p_image_url) = 0 then
    raise exception 'image must be uploaded to your own photos folder';
  end if;

  if p_captions is null or jsonb_typeof(p_captions) <> 'array' then
    raise exception 'captions must be a json array';
  end if;

  v_count := jsonb_array_length(p_captions);
  if v_count < 1 or v_count > 5 then
    raise exception 'expected between 1 and 5 captions';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_captions) as c(item)
    where length(coalesce(c.item->>'text', '')) not between 1 and 280
       or coalesce(c.item->>'angle', '') not in ('photo', 'name', 'both')
  ) then
    raise exception 'invalid caption';
  end if;

  insert into public.photos (image_url, alt_text, user_id)
  values (p_image_url, nullif(left(p_alt_text, 200), ''), v_user)
  returning id into v_photo;

  insert into public.generations (user_id, photo_id, model, system_prompt, user_prompt, context)
  values (v_user, v_photo, p_model, p_system_prompt, p_user_prompt, nullif(left(p_context, 200), ''))
  returning id into v_gen;

  insert into public.captions (photo_id, generation_id, caption_text, angle)
  select v_photo, v_gen, c.item->>'text', c.item->>'angle'
  from jsonb_array_elements(p_captions) as c(item);

  return v_photo;
end;
$$;

revoke all on function public.generations_remaining() from public, anon;
grant execute on function public.generations_remaining() to authenticated;

revoke all on function public.save_generation(text, text, text, text, text, text, jsonb) from public, anon;
grant execute on function public.save_generation(text, text, text, text, text, text, jsonb) to authenticated;

-- ----------------------------------------------------------------- storage --

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

update storage.buckets
set file_size_limit = 10485760,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
where id = 'avatars';

-- Public buckets serve files by URL without any policy; these policies only
-- govern writes, and only inside a folder named after the signed-in user's id.
drop policy if exists "Authenticated users can upload avatars" on storage.objects;
drop policy if exists "Authenticated users can update their avatars" on storage.objects;
drop policy if exists "Public can view avatars" on storage.objects;

drop policy if exists "own_folder_select" on storage.objects;
create policy "own_folder_select" on storage.objects
  for select to authenticated
  using (bucket_id in ('avatars', 'photos') and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "own_folder_insert" on storage.objects;
create policy "own_folder_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id in ('avatars', 'photos') and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "own_folder_update" on storage.objects;
create policy "own_folder_update" on storage.objects
  for update to authenticated
  using (bucket_id in ('avatars', 'photos') and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id in ('avatars', 'photos') and (storage.foldername(name))[1] = (select auth.uid())::text);
