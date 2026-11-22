-- Bright EngMath Live Classroom Board : a cover picture for each app on the shelf. Run after 08_app_shelf.sql. Safe to run again.
alter table public.apps add column if not exists cover text;
alter table public.apps drop constraint if exists apps_cover_check;
alter table public.apps add constraint apps_cover_check check (cover is null or (cover like 'data:image/jpeg;base64,%' and char_length(cover) <= 150000));

create or replace function public.student_apps_json(sid uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'title', a.title, 'url', a.url, 'note', a.note, 'cover', a.cover) order by sa.added_at desc), '[]'::jsonb)
  from public.student_apps sa join public.apps a on a.id = sa.app_id where sa.student_id = sid
$$;
revoke all on all functions in schema public from anon, public;
