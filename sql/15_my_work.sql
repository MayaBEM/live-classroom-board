-- Bright EngMath Live Classroom Board : "My work" for a student who came in with a board link. Run after 14_teacher_view.sql. Safe to run again.
-- Whoever has already joined a board (so already gave the right name and code) can see the list of their own work.
create or replace function public.my_work_after_join(p_board uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.participants; bb public.boards; st public.students; boards jsonb;
begin
  if auth.uid() is null then raise exception 'NOT_SIGNED_IN'; end if;
  select * into p from public.participants where board_id = p_board and user_id = auth.uid() order by created_at limit 1;
  if not found then return jsonb_build_object('boards', '[]'::jsonb); end if;
  select * into bb from public.boards where id = p_board;
  select s.* into st from public.students s
    where lower(s.first_name) = lower(p.name) and exists (select 1 from public.board_roster(bb) r where r.student_id = s.id) limit 1;
  if not found then return jsonb_build_object('boards', '[]'::jsonb); end if;

  select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb) into boards from (
    select jsonb_build_object(
      'id', b.id,
      'code', case when b.starts_at is not null and b.starts_at > now() then null else b.code end,
      'title', b.title, 'mode', b.mode, 'starts_at', b.starts_at, 'due_at', b.due_at, 'created_at', b.created_at,
      'status', case
          when b.mode <> 'assignment' then 'live'
          when q.id is null then 'new'
          when q.submitted_at is not null and (q.checked_at is not null or q.score is not null or q.comment is not null) then 'checked'
          when q.submitted_at is not null then 'sent'
          when exists (select 1 from public.objects o where o.board_id = b.id and o.scope_id = q.id and not o.deleted and not o.is_feedback) then 'working'
          else 'new' end,
      'score', q.score) as x
    from public.boards b
    left join public.participants q on q.board_id = b.id and lower(q.name) = lower(st.first_name)
    where b.link_enabled and exists (select 1 from public.board_roster(b) r where r.student_id = st.id)
  ) s;
  return jsonb_build_object('boards', boards);
end $$;

revoke all on function public.my_work_after_join(uuid) from anon, public;
grant execute on function public.my_work_after_join(uuid) to authenticated;
