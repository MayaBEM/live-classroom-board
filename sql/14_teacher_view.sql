-- Bright EngMath Live Classroom Board : the teacher can open any student's page without the code. Run after 13_decor_pages_avatar.sql. Safe to run again.
create or replace function public.teacher_student_portal(p_page text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare st public.students; boards jsonb;
begin
  if not public.is_teacher() then raise exception 'NOT_TEACHER'; end if;
  select * into st from public.students where page_code = upper(btrim(coalesce(p_page, '')));
  if not found then raise exception 'PAGE_NOT_FOUND'; end if;

  select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb) into boards from (
    select jsonb_build_object(
      'id', b.id,
      'code', case when b.starts_at is not null and b.starts_at > now() then null else b.code end,
      'title', b.title, 'mode', b.mode, 'starts_at', b.starts_at, 'due_at', b.due_at, 'created_at', b.created_at,
      'class', c.name,
      'status', case
          when b.mode <> 'assignment' then 'live'
          when p.id is null then 'new'
          when p.submitted_at is not null and (p.checked_at is not null or p.score is not null or p.comment is not null) then 'checked'
          when p.submitted_at is not null then 'sent'
          when exists (select 1 from public.objects o where o.board_id = b.id and o.scope_id = p.id and not o.deleted and not o.is_feedback) then 'working'
          else 'new' end,
      'score', p.score, 'checked_at', p.checked_at) as x
    from public.boards b
    left join public.classes c on c.id = b.class_id
    left join public.participants p on p.board_id = b.id and lower(p.name) = lower(st.first_name)
    where b.link_enabled and exists (select 1 from public.board_roster(b) r where r.student_id = st.id)
  ) s;
  return jsonb_build_object('name', st.first_name, 'boards', boards, 'apps', public.student_apps_json(st.id), 'idea', public.idea_json(st.id));
end $$;

revoke all on function public.teacher_student_portal(text) from anon, public;
grant execute on function public.teacher_student_portal(text) to authenticated;
