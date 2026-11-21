-- Bright EngMath Live Classroom Board : Phase 3 (class countdown timer). Run after 02_assignment.sql. Safe to run again.

-- the timer lives on the board row, so every student receives it through the normal realtime updates
alter table public.boards add column if not exists timer jsonb;

-- students' clocks can differ from the teacher's: everybody measures the countdown against the server clock
create or replace function public.server_now() returns timestamptz
language sql stable security definer set search_path = public as $$
  select now();
$$;
revoke all on function public.server_now() from anon, public;
grant execute on function public.server_now() to authenticated;
