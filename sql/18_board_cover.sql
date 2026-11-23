-- Bright EngMath Live Classroom Board : a cover picture for each board / assignment (the first page of the uploaded file, small).
-- Run after 17_schedule.sql. Safe to run again.
-- It lives in its own table so the teacher's lists stay light. Students get it through board_covers(), only for boards they may see.

create table if not exists public.board_covers (
  board_id uuid primary key references public.boards(id) on delete cascade,
  image text not null check (image like 'data:image/jpeg;base64,%' and char_length(image) <= 250000),
  updated_at timestamptz not null default now()
);
alter table public.board_covers enable row level security;
grant select, insert, update, delete on public.board_covers to authenticated;
drop policy if exists board_covers_teacher on public.board_covers;
create policy board_covers_teacher on public.board_covers for all to authenticated using (public.is_teacher()) with check (public.is_teacher());

create or replace function public.board_covers(p_ids uuid[]) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(c.board_id::text, c.image), '{}'::jsonb)
  from public.board_covers c join public.boards b on b.id = c.board_id
  where c.board_id = any(p_ids[1:80])
    and (public.is_teacher() or (b.link_enabled and (b.starts_at is null or b.starts_at <= now())))
$$;

revoke all on all functions in schema public from anon, public;
grant execute on function public.board_covers(uuid[]) to authenticated;
grant execute on function public.is_teacher() to authenticated;
