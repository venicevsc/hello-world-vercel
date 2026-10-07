-- Chat jokes: a user texts the bot, and any exchange can be posted to the feed
-- as a caption without a photo. Run after assignment4.sql. Idempotent.

-- ---------------------------------------------------------------- schema --

-- A chat post is a caption with no photo: setup = the user's message,
-- caption_text = the bot's reply.
alter table public.captions alter column photo_id drop not null;
alter table public.captions add column if not exists setup text;

alter table public.captions drop constraint if exists captions_angle_check;
alter table public.captions
  add constraint captions_angle_check
  check (angle is null or angle in ('photo', 'name', 'both', 'chat'));

alter table public.captions drop constraint if exists captions_photo_or_setup;
alter table public.captions
  add constraint captions_photo_or_setup check (photo_id is not null or setup is not null);

-- Each chat reply can be posted at most once.
create unique index if not exists captions_chat_generation_uniq
  on public.captions (generation_id) where photo_id is null;

create index if not exists captions_chat_created_idx
  on public.captions (created_at desc) where photo_id is null;

-- Every chat reply is a generation too, so its prompts are saved.
alter table public.generations alter column photo_id drop not null;
alter table public.generations
  add column if not exists kind text not null default 'photo',
  add column if not exists output text;

alter table public.generations drop constraint if exists generations_kind_check;
alter table public.generations
  add constraint generations_kind_check check (kind in ('photo', 'chat'));

-- --------------------------------------------------------------- functions --

-- Photo generations left today (limit 10). Chat replies have their own limit.
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
      where user_id = auth.uid() and kind = 'photo'
        and created_at > now() - interval '24 hours'
    ))::int
  end;
$$;

-- Chat replies left for the signed-in user in the last 24 hours (limit: 60).
create or replace function public.chat_replies_remaining()
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() is null then 0
    else greatest(0, 60 - (
      select count(*) from public.generations
      where user_id = auth.uid() and kind = 'chat'
        and created_at > now() - interval '24 hours'
    ))::int
  end;
$$;

-- Records one chat reply with its prompts. Not posted until post_chat_joke().
create or replace function public.save_chat_reply(
  p_model text,
  p_system_prompt text,
  p_user_prompt text,
  p_setup text,
  p_reply text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_gen bigint;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if public.chat_replies_remaining() <= 0 then
    raise exception 'daily chat limit reached' using errcode = 'P0001';
  end if;

  if length(coalesce(p_setup, '')) not between 1 and 200
     or length(coalesce(p_reply, '')) not between 1 and 280 then
    raise exception 'invalid chat message';
  end if;

  insert into public.generations (user_id, kind, model, system_prompt, user_prompt, context, output)
  values (v_user, 'chat', p_model, p_system_prompt, p_user_prompt, p_setup, p_reply)
  returning id into v_gen;

  return v_gen;
end;
$$;

-- Posts one of the caller's own chat replies to the feed. Returns the caption id.
create or replace function public.post_chat_joke(p_generation_id bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gen public.generations;
  v_caption bigint;
begin
  select * into v_gen from public.generations
  where id = p_generation_id and user_id = auth.uid() and kind = 'chat';

  if not found then
    raise exception 'chat reply not found';
  end if;

  select id into v_caption from public.captions
  where generation_id = v_gen.id and photo_id is null;

  if v_caption is null then
    insert into public.captions (photo_id, generation_id, caption_text, setup, angle)
    values (null, v_gen.id, v_gen.output, v_gen.context, 'chat')
    returning id into v_caption;
  end if;

  return v_caption;
end;
$$;

revoke all on function public.chat_replies_remaining() from public, anon;
grant execute on function public.chat_replies_remaining() to authenticated;

revoke all on function public.save_chat_reply(text, text, text, text, text) from public, anon;
grant execute on function public.save_chat_reply(text, text, text, text, text) to authenticated;

revoke all on function public.post_chat_joke(bigint) from public, anon;
grant execute on function public.post_chat_joke(bigint) to authenticated;
