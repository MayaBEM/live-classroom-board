-- Bright EngMath Live Classroom Board : stickers, washi tape, pages a student adds to their own copy, and a picture for each student.
-- Run after 12_checked.sql. Safe to run again.

-- 1. stickers and tape are objects too
alter table public.objects drop constraint if exists objects_type_check;
alter table public.objects add constraint objects_type_check
  check (type in ('pen','highlighter','text','line','arrow','rect','ellipse','stamp','image','sticker','tape'));

-- 2. a picture (an animal face) for each student, chosen by the teacher
alter table public.students add column if not exists avatar text;
alter table public.students drop constraint if exists students_avatar_len;
alter table public.students add constraint students_avatar_len check (avatar is null or char_length(avatar) <= 24);

-- 3. pages a student adds to their own copy of an assignment (owner_id = that student's copy; null = a page the teacher made)
alter table public.pages add column if not exists owner_id uuid references public.participants(id) on delete cascade;
create index if not exists pages_owner_idx on public.pages(owner_id);

create or replace function public.own_page_count(pid uuid) returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::integer from public.pages where owner_id = pid
$$;
grant execute on function public.own_page_count(uuid) to authenticated;

drop policy if exists pages_student_read on public.pages;
create policy pages_student_read on public.pages for select to authenticated
  using (public.is_member(board_id) and (owner_id is null or owner_id in (select p.id from public.participants p where p.user_id = auth.uid())));

drop policy if exists pages_student_insert on public.pages;
create policy pages_student_insert on public.pages for insert to authenticated
  with check (
    owner_id is not null
    and owner_id in (select p.id from public.participants p where p.user_id = auth.uid() and p.board_id = pages.board_id)
    and public.board_mode(board_id) = 'assignment'
    and public.can_write(board_id)
    and kind in ('blank', 'lined', 'grid')
    and public.own_page_count(owner_id) < 20
  );

drop policy if exists pages_student_delete on public.pages;
create policy pages_student_delete on public.pages for delete to authenticated
  using (owner_id in (select p.id from public.participants p where p.user_id = auth.uid()) and public.can_write(board_id));
