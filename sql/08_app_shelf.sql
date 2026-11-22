-- Bright EngMath Live Classroom Board : the app shelf. Run after 07_student_page.sql. Safe to run again.
-- The teacher keeps a shelf of links (her own web apps and games) and puts them on the page of each student she chooses.

create table if not exists public.apps (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 60),
  url text not null check (url ~* '^https?://[^ ]+$' and char_length(url) <= 500),
  note text check (note is null or char_length(note) <= 140),
  created_at timestamptz not null default now()
);
create table if not exists public.student_apps (
  student_id uuid not null references public.students(id) on delete cascade,
  app_id uuid not null references public.apps(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (student_id, app_id)
);
alter table public.apps enable row level security;
alter table public.student_apps enable row level security;
drop policy if exists apps_teacher on public.apps;
create policy apps_teacher on public.apps for all to authenticated using (public.is_teacher()) with check (public.is_teacher());
drop policy if exists student_apps_teacher on public.student_apps;
create policy student_apps_teacher on public.student_apps for all to authenticated using (public.is_teacher()) with check (public.is_teacher());
grant select, insert, update, delete on public.apps, public.student_apps to authenticated;

create or replace function public.student_apps_json(sid uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'title', a.title, 'url', a.url, 'note', a.note) order by sa.added_at desc), '[]'::jsonb)
  from public.student_apps sa join public.apps a on a.id = sa.app_id where sa.student_id = sid
$$;

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
          when p.submitted_at is not null and (p.score is not null or p.comment is not null) then 'checked'
          when p.submitted_at is not null then 'sent'
          when exists (select 1 from public.objects o where o.board_id = b.id and o.scope_id = p.id and not o.deleted and not o.is_feedback) then 'working'
          else 'new' end,
      'score', p.score) as x
    from public.boards b
    left join public.participants p on p.board_id = b.id and lower(p.name) = lower(rs.first_name)
    where b.class_id = c.id and b.link_enabled
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
  return jsonb_build_object('name', st.first_name, 'boards', boards, 'apps', public.student_apps_json(st.id));
end $$;

revoke all on all functions in schema public from anon, public;
grant execute on function public.class_portal(text, text, text), public.student_portal(text, text) to authenticated;
