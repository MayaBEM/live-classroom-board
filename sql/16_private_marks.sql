-- Bright EngMath Live Classroom Board : the teacher can draw without the students seeing it. Run after 15_my_work.sql. Safe to run again.
-- A mark with hidden_from_students = true is only for the teacher, until the teacher shows it.
alter table public.objects add column if not exists hidden_from_students boolean not null default false;

drop policy if exists objects_student_read on public.objects;
create policy objects_student_read on public.objects for select to authenticated
  using (
    public.is_member(board_id)
    and not hidden_from_students
    and (scope_id is null or scope_id in (select p.id from public.participants p where p.user_id = auth.uid()))
  );

drop policy if exists objects_student_insert on public.objects;
create policy objects_student_insert on public.objects for insert to authenticated
  with check (
    public.can_write(board_id)
    and is_feedback = false
    and hidden_from_students = false
    and participant_id in (select p.id from public.participants p where p.user_id = auth.uid() and p.board_id = objects.board_id)
    and exists (select 1 from public.pages pg where pg.id = objects.page_id and pg.board_id = objects.board_id)
    and scope_id is not distinct from (case when public.board_mode(board_id) = 'assignment' then participant_id else null end)
  );

drop policy if exists objects_student_update on public.objects;
create policy objects_student_update on public.objects for update to authenticated
  using (public.can_write(board_id) and is_feedback = false and hidden_from_students = false
         and participant_id in (select p.id from public.participants p where p.user_id = auth.uid()))
  with check (public.can_write(board_id) and is_feedback = false and hidden_from_students = false
         and participant_id in (select p.id from public.participants p where p.user_id = auth.uid()));
