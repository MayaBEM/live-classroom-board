-- Bright EngMath Live Classroom Board : a page for each student (and boards made for one student). Run after 06_students.sql. Safe to run again.
-- Every student gets a private page link (page_code). On it the student types the code and sees ALL their work:
-- boards made just for them, and boards of their classes that they are part of.

alter table public.students add column if not exists page_code text;
update public.students set page_code = upper(substr(md5(random()::text || id::text), 1, 6)) where page_code is null;
alter table public.students alter column page_code set default upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
alter table public.students alter column page_code set not null;
create unique index if not exists students_page_code_idx on public.students(page_code);

create table if not exists public.student_fails (
  student_id uuid primary key references public.students(id) on delete cascade,
  n integer not null default 0,
  since timestamptz not null default now()
);
alter table public.student_fails enable row level security;

-- the people a board is for: its own list if it has one (inside the class, if it has a class), otherwise the whole class
create or replace function public.board_roster(b public.boards) returns table(student_id uuid, first_name text, code text)
language sql stable security definer set search_path = public as $$
  select s.id, s.first_name, s.code from public.students s
  where case
    when exists (select 1 from public.board_students x where x.board_id = b.id)
      then exists (select 1 from public.board_students x where x.board_id = b.id and x.student_id = s.id)
           and (b.class_id is null or exists (select 1 from public.class_students cs where cs.class_id = b.class_id and cs.student_id = s.id))
    else b.class_id is not null and exists (select 1 from public.class_students cs where cs.class_id = b.class_id and cs.student_id = s.id)
  end
$$;

create or replace function public.get_join_info(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare b public.boards; names jsonb;
begin
  select * into b from public.boards where code = upper(btrim(p_code));
  if not found then return jsonb_build_object('found', false); end if;
  select coalesce(jsonb_agg(r.first_name order by r.first_name), '[]'::jsonb) into names from public.board_roster(b) r;
  return jsonb_build_object('found', true, 'enabled', b.link_enabled, 'title', b.title, 'names', names,
    'roster', jsonb_array_length(names) > 0, 'mode', b.mode, 'starts_at', b.starts_at, 'due_at', b.due_at);
end $$;

create or replace function public.join_board(p_code text, p_name text, p_pin text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare b public.boards; nm text; ph text; p public.participants; rs record; jf public.join_fails; has_roster boolean;
begin
  if auth.uid() is null then raise exception 'NOT_SIGNED_IN'; end if;
  select * into b from public.boards where code = upper(btrim(p_code));
  if not found or not b.link_enabled then raise exception 'BOARD_CLOSED'; end if;
  if b.starts_at is not null and b.starts_at > now() then raise exception 'NOT_STARTED'; end if;
  nm := left(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), 24);
  if nm = '' then raise exception 'NAME_REQUIRED'; end if;
  if coalesce(p_pin, '') <> '' then
    if p_pin !~ '^[0-9]{4}$' then raise exception 'PIN_FORMAT'; end if;
    ph := encode(digest(b.id::text || lower(nm) || p_pin, 'sha256'), 'hex');
  end if;

  select exists (select 1 from public.board_roster(b)) into has_roster;

  if has_roster then
    -- ---- class list with codes: the student must be on the list and type the code the teacher gave them
    select * into rs from public.board_roster(b) r where lower(r.first_name) = lower(nm) limit 1;
    if not found then raise exception 'NOT_ON_LIST'; end if;
    nm := rs.first_name;
    -- this device already opened this student's copy: no code needed again
    select * into p from public.participants where board_id = b.id and user_id = auth.uid() and lower(name) = lower(nm) order by created_at limit 1;
    if found then
      update public.participants set last_seen = now() where id = p.id;
      return jsonb_build_object('participant_id', p.id, 'board_id', b.id, 'name', p.name, 'mode', b.mode);
    end if;
    select * into jf from public.join_fails where board_id = b.id and name_lc = lower(nm);
    if found and jf.n >= 6 and jf.since > now() - interval '10 minutes' then
      return jsonb_build_object('error', 'TOO_MANY');
    end if;
    if p_pin is distinct from rs.code then
      insert into public.join_fails(board_id, name_lc, n, since) values (b.id, lower(nm), 1, now())
        on conflict (board_id, name_lc) do update set
          n = case when public.join_fails.since < now() - interval '10 minutes' then 1 else public.join_fails.n + 1 end,
          since = case when public.join_fails.since < now() - interval '10 minutes' then now() else public.join_fails.since end;
      return jsonb_build_object('error', case when coalesce(p_pin, '') = '' then 'PIN_REQUIRED' else 'PIN_WRONG' end);
    end if;
    delete from public.join_fails where board_id = b.id and name_lc = lower(nm);
    -- a board can be made for some of the class only: the student must be one of them
    ph := encode(digest(b.id::text || lower(nm) || p_pin, 'sha256'), 'hex');
    select * into p from public.participants where board_id = b.id and lower(name) = lower(nm) order by created_at limit 1;
    if found then
      update public.participants set user_id = auth.uid(), last_seen = now(), reclaim_ok = false, pin_hash = ph where id = p.id;
    else
      insert into public.participants(board_id, user_id, name, pin_hash) values (b.id, auth.uid(), nm, ph) returning * into p;
    end if;
    return jsonb_build_object('participant_id', p.id, 'board_id', b.id, 'name', p.name, 'mode', b.mode);
  end if;

  -- ---- no class list (or no codes yet): the student types a name, a PIN is optional
  select * into p from public.participants
    where board_id = b.id and user_id = auth.uid() and lower(name) = lower(nm)
    order by created_at limit 1;
  if found then
    update public.participants set last_seen = now(), pin_hash = coalesce(pin_hash, ph) where id = p.id;
  else
    select * into p from public.participants
      where board_id = b.id and lower(name) = lower(nm) order by created_at limit 1;
    if found then
      if p.pin_hash is not null and ph is not null and ph = p.pin_hash then
        null;
      elsif p.pin_hash is not null then
        if ph is null then raise exception 'PIN_REQUIRED'; end if;
        raise exception 'PIN_WRONG';
      elsif b.mode = 'assignment' then
        if not p.reclaim_ok then raise exception 'NAME_TAKEN_ASSIGNMENT'; end if;
      elsif p.last_seen > now() - interval '45 seconds' then
        raise exception 'NAME_IN_USE';
      end if;
      update public.participants set user_id = auth.uid(), last_seen = now(), reclaim_ok = false,
        pin_hash = coalesce(pin_hash, ph) where id = p.id;
    else
      insert into public.participants(board_id, user_id, name, pin_hash)
        values (b.id, auth.uid(), nm, ph) returning * into p;
    end if;
  end if;
  return jsonb_build_object('participant_id', p.id, 'board_id', b.id, 'name', p.name, 'mode', b.mode);
end $$;


create or replace function public.get_student_page(p_page text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare st public.students;
begin
  select * into st from public.students where page_code = upper(btrim(coalesce(p_page, '')));
  if not found then return jsonb_build_object('found', false); end if;
  return jsonb_build_object('found', true, 'name', st.first_name);
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
  return jsonb_build_object('name', st.first_name, 'boards', boards);
end $$;

revoke all on all functions in schema public from anon, public;
grant execute on function public.get_join_info(text), public.join_board(text, text, text), public.get_student_page(text), public.student_portal(text, text) to authenticated;
