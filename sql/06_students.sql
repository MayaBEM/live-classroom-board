-- Bright EngMath Live Classroom Board : one list of students with fixed codes. Run after 05_class_portal.sql. Safe to run again.
-- The teacher keeps ONE list of students (name + 4-number code that never changes).
-- A class and a board are then made by adding students from that list. A board with no members listed is for the whole class.

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  first_name text not null check (char_length(first_name) between 1 and 24),
  code text not null check (code ~ '^[0-9]{4}$'),
  created_at timestamptz not null default now()
);
create unique index if not exists students_code_idx on public.students(code);
create unique index if not exists students_name_idx on public.students(lower(first_name));
alter table public.students enable row level security;
drop policy if exists students_teacher on public.students;
create policy students_teacher on public.students for all to authenticated using (public.is_teacher()) with check (public.is_teacher());
grant select, insert, update, delete on public.students to authenticated;

alter table public.class_students add column if not exists student_id uuid references public.students(id) on delete cascade;
create unique index if not exists class_students_member_idx on public.class_students(class_id, student_id) where student_id is not null;

create table if not exists public.board_students (
  board_id uuid not null references public.boards(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  primary key (board_id, student_id)
);
alter table public.board_students enable row level security;
drop policy if exists board_students_teacher on public.board_students;
create policy board_students_teacher on public.board_students for all to authenticated using (public.is_teacher()) with check (public.is_teacher());
grant select, insert, update, delete on public.board_students to authenticated;

-- a change of name or code on the list reaches every class at once
create or replace function public.students_sync() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.class_students set first_name = new.first_name, code = new.code where student_id = new.id;
  return new;
end $$;
drop trigger if exists students_sync_trg on public.students;
create trigger students_sync_trg after update of first_name, code on public.students for each row execute function public.students_sync();

-- the students already in your classes become the first entries of the list (same names, same codes where possible)
do $$
declare r record; c text; sid uuid;
begin
  for r in select distinct on (lower(first_name)) first_name, code from public.class_students where student_id is null order by lower(first_name), code loop
    select id into sid from public.students where lower(first_name) = lower(r.first_name);
    if sid is null then
      c := r.code;
      while c is null or exists (select 1 from public.students where code = c) loop
        c := (1000 + floor(random() * 9000))::int::text;
      end loop;
      insert into public.students(first_name, code) values (r.first_name, c);
    end if;
  end loop;
  update public.class_students cs set student_id = s.id from public.students s where cs.student_id is null and lower(cs.first_name) = lower(s.first_name);
  update public.class_students cs set code = s.code from public.students s where cs.student_id = s.id and cs.code is distinct from s.code;
end $$;

create or replace function public.get_join_info(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare b public.boards; names jsonb; has_roster boolean;
begin
  select * into b from public.boards where code = upper(btrim(p_code));
  if not found then return jsonb_build_object('found', false); end if;
  select coalesce(jsonb_agg(cs.first_name order by cs.first_name), '[]'::jsonb) into names
    from public.class_students cs
    where cs.class_id = b.class_id
      and (not exists (select 1 from public.board_students x where x.board_id = b.id)
           or exists (select 1 from public.board_students x where x.board_id = b.id and x.student_id = cs.student_id));
  select exists (select 1 from public.class_students where class_id = b.class_id and code is not null) into has_roster;
  return jsonb_build_object('found', true, 'enabled', b.link_enabled, 'title', b.title, 'names', names,
    'roster', has_roster, 'mode', b.mode, 'starts_at', b.starts_at, 'due_at', b.due_at);
end $$;

create or replace function public.join_board(p_code text, p_name text, p_pin text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare b public.boards; nm text; ph text; p public.participants; rs public.class_students; jf public.join_fails; has_roster boolean;
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

  select exists (select 1 from public.class_students where class_id = b.class_id and code is not null) into has_roster;

  if has_roster then
    -- ---- class list with codes: the student must be on the list and type the code the teacher gave them
    select * into rs from public.class_students
      where class_id = b.class_id and lower(first_name) = lower(nm) and code is not null limit 1;
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
    if exists (select 1 from public.board_students x where x.board_id = b.id)
       and not exists (select 1 from public.board_students x where x.board_id = b.id and x.student_id = rs.student_id) then
      raise exception 'NOT_IN_BOARD';
    end if;
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
  return jsonb_build_object('name', rs.first_name, 'class', c.name, 'boards', boards);
end $$;

revoke all on all functions in schema public from anon, public;
grant execute on function public.get_join_info(text), public.join_board(text, text, text), public.class_portal(text, text, text) to authenticated;
