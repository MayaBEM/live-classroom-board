-- Bright EngMath Live Classroom Board : the small idea board on each student's page. Run after 09_app_cover.sql. Safe to run again.
-- The student writes or draws on it whenever they like and it saves by itself. The teacher sees it, and can write over it or leave a short message.

create table if not exists public.idea_boards (
  student_id uuid primary key references public.students(id) on delete cascade,
  strokes jsonb not null default '[]'::jsonb,
  tstrokes jsonb not null default '[]'::jsonb,
  reply text check (reply is null or char_length(reply) <= 300),
  n integer not null default 0,
  updated_at timestamptz not null default now(),
  teacher_updated_at timestamptz,
  teacher_seen_at timestamptz,
  check (jsonb_typeof(strokes) = 'array' and jsonb_typeof(tstrokes) = 'array'),
  check (pg_column_size(strokes) <= 250000 and pg_column_size(tstrokes) <= 250000)
);
alter table public.idea_boards enable row level security;
drop policy if exists idea_boards_teacher on public.idea_boards;
create policy idea_boards_teacher on public.idea_boards for all to authenticated using (public.is_teacher()) with check (public.is_teacher());
grant select, insert, update, delete on public.idea_boards to authenticated;

create or replace function public.idea_json(sid uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((select jsonb_build_object('strokes', strokes, 'tstrokes', tstrokes, 'reply', reply, 'reply_at', teacher_updated_at) from public.idea_boards where student_id = sid),
                  jsonb_build_object('strokes', '[]'::jsonb, 'tstrokes', '[]'::jsonb, 'reply', null, 'reply_at', null))
$$;

-- page link + 4-number code, with the same lockout as the student page (6 wrong tries = 10 minutes)
create or replace function public.student_check(p_page text, p_pin text) returns table(sid uuid, err text)
language plpgsql security definer set search_path = public as $$
declare st public.students; jf public.student_fails;
begin
  if auth.uid() is null then return query select null::uuid, 'NOT_SIGNED_IN'::text; return; end if;
  select * into st from public.students where page_code = upper(btrim(coalesce(p_page, '')));
  if not found then return query select null::uuid, 'PAGE_NOT_FOUND'::text; return; end if;
  select * into jf from public.student_fails where student_id = st.id;
  if found and jf.n >= 6 and jf.since > now() - interval '10 minutes' then return query select null::uuid, 'TOO_MANY'::text; return; end if;
  if p_pin is distinct from st.code then
    insert into public.student_fails(student_id, n, since) values (st.id, 1, now())
      on conflict (student_id) do update set
        n = case when public.student_fails.since < now() - interval '10 minutes' then 1 else public.student_fails.n + 1 end,
        since = case when public.student_fails.since < now() - interval '10 minutes' then now() else public.student_fails.since end;
    return query select null::uuid, (case when coalesce(p_pin, '') = '' then 'PIN_REQUIRED' else 'PIN_WRONG' end)::text; return;
  end if;
  delete from public.student_fails where student_id = st.id;
  return query select st.id, null::text;
end $$;

create or replace function public.idea_save(p_page text, p_pin text, p_strokes jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c record;
begin
  select * into c from public.student_check(p_page, p_pin);
  if c.err is not null then return jsonb_build_object('error', c.err); end if;
  if p_strokes is null or jsonb_typeof(p_strokes) <> 'array' or pg_column_size(p_strokes) > 250000 then return jsonb_build_object('error', 'TOO_BIG'); end if;
  insert into public.idea_boards(student_id, strokes, n, updated_at) values (c.sid, p_strokes, jsonb_array_length(p_strokes), now())
    on conflict (student_id) do update set strokes = excluded.strokes, n = excluded.n, updated_at = now();
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.idea_get(p_page text, p_pin text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c record;
begin
  select * into c from public.student_check(p_page, p_pin);
  if c.err is not null then return jsonb_build_object('error', c.err); end if;
  return jsonb_build_object('idea', public.idea_json(c.sid));
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
          when p.submitted_at is not null and (p.score is not null or p.comment is not null) then 'checked'
          when p.submitted_at is not null then 'sent'
          when exists (select 1 from public.objects o where o.board_id = b.id and o.scope_id = p.id and not o.deleted and not o.is_feedback) then 'working'
          else 'new' end,
      'score', p.score) as x
    from public.boards b
    left join public.classes c on c.id = b.class_id
    left join public.participants p on p.board_id = b.id and lower(p.name) = lower(st.first_name)
    where b.link_enabled and exists (select 1 from public.board_roster(b) r where r.student_id = st.id)
  ) s;
  return jsonb_build_object('name', st.first_name, 'boards', boards, 'apps', public.student_apps_json(st.id), 'idea', public.idea_json(st.id));
end $$;

revoke all on all functions in schema public from anon, public;
grant execute on function public.student_portal(text, text), public.idea_save(text, text, jsonb), public.idea_get(text, text) to authenticated;
