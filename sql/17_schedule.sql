-- Bright EngMath Live Classroom Board : boards and assignments can be set to open later. Run after 16_private_marks.sql. Safe to run again.
-- Until the opening time a student does not see the board at all (not on their page, not by its link). The teacher sees everything.

create or replace function public.get_join_info(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare b public.boards; names jsonb;
begin
  select * into b from public.boards where code = upper(btrim(p_code));
  if not found then return jsonb_build_object('found', false); end if;
  select coalesce(jsonb_agg(r.first_name order by r.first_name), '[]'::jsonb) into names from public.board_roster(b) r;
  return jsonb_build_object('found', true, 'enabled', b.link_enabled, 'title', case when b.starts_at is not null and b.starts_at > now() then null else b.title end, 'names', case when b.starts_at is not null and b.starts_at > now() then '[]'::jsonb else names end,
    'roster', jsonb_array_length(names) > 0, 'mode', b.mode, 'starts_at', b.starts_at, 'due_at', b.due_at);
end $$;

create or replace function public.class_portal(p_code text, p_name text, p_pin text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c public.classes; rs public.class_students; jf public.class_fails; boards jsonb;
begin
  if auth.uid() is null then raise exception 'NOT_SIGNED_IN'; end if;
  select * into c from public.classes where code = upper(btrim(p_code));
  if not found then raise exception 'CLASS_NOT_FOUND'; end if;
  select * into rs from public.class_students
    where class_id = c.id and lower(first_name) = lower(btrim(coalesce(p_name, ''))) and code is not null limit 1;
  if not found then raise exception 'NOT_ON_LIST'; end if;
  select * into jf from public.class_fails where class_id = c.id and name_lc = lower(rs.first_name);
  if found and jf.n >= 6 and jf.since > now() - interval '10 minutes' then
    return jsonb_build_object('error', 'TOO_MANY');
  end if;
  if p_pin is distinct from rs.code then
    insert into public.class_fails(class_id, name_lc, n, since) values (c.id, lower(rs.first_name), 1, now())
      on conflict (class_id, name_lc) do update set
        n = case when public.class_fails.since < now() - interval '10 minutes' then 1 else public.class_fails.n + 1 end,
        since = case when public.class_fails.since < now() - interval '10 minutes' then now() else public.class_fails.since end;
    return jsonb_build_object('error', case when coalesce(p_pin, '') = '' then 'PIN_REQUIRED' else 'PIN_WRONG' end);
  end if;
  delete from public.class_fails where class_id = c.id and name_lc = lower(rs.first_name);

  select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb) into boards from (
    select jsonb_build_object(
      'id', b.id,
      'code', case when b.starts_at is not null and b.starts_at > now() then null else b.code end,
      'title', b.title, 'mode', b.mode, 'starts_at', b.starts_at, 'due_at', b.due_at, 'created_at', b.created_at,
      'status', case
          when b.mode <> 'assignment' then 'live'
          when p.id is null then 'new'
          when p.submitted_at is not null and (p.checked_at is not null or p.score is not null or p.comment is not null) then 'checked'
          when p.submitted_at is not null then 'sent'
          when exists (select 1 from public.objects o where o.board_id = b.id and o.scope_id = p.id and not o.deleted and not o.is_feedback) then 'working'
          else 'new' end,
      'score', p.score, 'checked_at', p.checked_at) as x
    from public.boards b
    left join public.participants p on p.board_id = b.id and lower(p.name) = lower(rs.first_name)
    where b.class_id = c.id and b.link_enabled and (b.starts_at is null or b.starts_at <= now())
      and (not exists (select 1 from public.board_students bs where bs.board_id = b.id)
           or exists (select 1 from public.board_students bs where bs.board_id = b.id and bs.student_id = rs.student_id))
  ) s;
  return jsonb_build_object('name', rs.first_name, 'class', c.name, 'boards', boards, 'apps', public.student_apps_json(rs.student_id));
end $$;

create or replace function public.student_portal(p_page text, p_pin text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare st public.students; jf public.student_fails; boards jsonb;
begin
  if auth.uid() is null then raise exception 'NOT_SIGNED_IN'; end if;
  select * into st from public.students where page_code = upper(btrim(coalesce(p_page, '')));
  if not found then raise exception 'PAGE_NOT_FOUND'; end if;
  select * into jf from public.student_fails where student_id = st.id;
  if found and jf.n >= 6 and jf.since > now() - interval '10 minutes' then
    return jsonb_build_object('error', 'TOO_MANY');
  end if;
  if p_pin is distinct from st.code then
    insert into public.student_fails(student_id, n, since) values (st.id, 1, now())
      on conflict (student_id) do update set
        n = case when public.student_fails.since < now() - interval '10 minutes' then 1 else public.student_fails.n + 1 end,
        since = case when public.student_fails.since < now() - interval '10 minutes' then now() else public.student_fails.since end;
    return jsonb_build_object('error', case when coalesce(p_pin, '') = '' then 'PIN_REQUIRED' else 'PIN_WRONG' end);
  end if;
  delete from public.student_fails where student_id = st.id;

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
    where b.link_enabled and (b.starts_at is null or b.starts_at <= now()) and exists (select 1 from public.board_roster(b) r where r.student_id = st.id)
  ) s;
  return jsonb_build_object('name', st.first_name, 'boards', boards, 'apps', public.student_apps_json(st.id), 'idea', public.idea_json(st.id));
end $$;

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
    where b.link_enabled and (b.starts_at is null or b.starts_at <= now()) and exists (select 1 from public.board_roster(b) r where r.student_id = st.id)
  ) s;
  return jsonb_build_object('boards', boards);
end $$;

revoke all on all functions in schema public from anon, public;
grant execute on function public.get_join_info(text), public.class_portal(text, text, text), public.student_portal(text, text), public.my_work_after_join(uuid) to authenticated;
