-- Run this in the Supabase SQL Editor (Project -> SQL Editor -> New query)

create table if not exists photos (
  id bigint generated always as identity primary key,
  image_url text not null,
  alt_text text,
  created_at timestamptz not null default now()
);

create table if not exists captions (
  id bigint generated always as identity primary key,
  photo_id bigint not null references photos(id) on delete cascade,
  caption_text text not null,
  created_at timestamptz not null default now()
);

alter table photos enable row level security;
alter table captions enable row level security;

create policy "Public read access" on photos
  for select using (true);

create policy "Public read access" on captions
  for select using (true);

-- Seed data: a couple of photos with a few joke captions each
insert into photos (image_url, alt_text) values
  ('https://picsum.photos/seed/humor-cat/600/400', 'A cat staring at a laptop'),
  ('https://picsum.photos/seed/humor-dog/600/400', 'A dog wearing sunglasses');

insert into captions (photo_id, caption_text)
select id, caption from photos, (values
  ('When you realize it''s Monday again.'),
  ('Judging your code review comments.'),
  ('Currently drafting a strongly worded email.')
) as t(caption)
where photos.alt_text = 'A cat staring at a laptop';

insert into captions (photo_id, caption_text)
select id, caption from photos, (values
  ('Too cool to fetch.'),
  ('Living my best life, no notes.')
) as t(caption)
where photos.alt_text = 'A dog wearing sunglasses';
