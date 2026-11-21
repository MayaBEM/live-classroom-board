-- Bright EngMath Live Classroom Board : roster codes. Run after 03_timer.sql. Safe to run again.
-- A class can have a student list. Each student on the list gets a 4-number code from the teacher.
-- On a board of that class, a student taps their own name and types their code: nobody can open another student's work.

alter table public.class_students add column if not exists code text;
alter table public.class_students drop constraint if exists class_students_code_check;
alter table public.class_students add constraint class_students_code_check check (code is null or code ~ '^[0-9]{4}$');

-- wrong-code counter (only the join function touches it)
create table if not exists public.join_fails (
  board_id uuid not null references public.boards(id) on delete cascade,
  name_lc text not null,
  n integer not null default 0,
  since timestamptz not null default now(),
  primary key (board_id, name_lc)
);
alter table public.join_fails enable row level security;
revoke all on public.join_fails from anon, authenticated;

create or replace function public.get_join_info(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare b public.boards; names jsonb; has_roster boolean;
begin
  select * into b from public.boards where code = upper(btrim(p_code));
  if not found then return jsonb_build_object('found', false); end if;
  select coalesce(jsonb_agg(first_name order by first_name), '[]'::jsonb) into names
    from public.class_students where class_id = b.class_id;
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

revoke all on all functions in schema public from anon, public;
grant execute on function public.get_join_info(text), public.join_board(text, text, text) to authenticated;
