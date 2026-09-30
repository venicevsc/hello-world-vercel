-- Run this in the Supabase SQL Editor (or via the same direct-connection script used earlier)

create table if not exists likes (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  photo_id bigint not null references photos(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, photo_id)
);
