-- Bright EngMath Live Classroom Board : Phase 2 (assignment mode). Run after 01_setup.sql. Safe to run again.

-- ------------------------------------------------------------ new columns
alter table public.boards add column if not exists mode text not null default 'live';
alter table public.boards drop constraint if exists boards_mode_check;
alter table public.boards add constraint boards_mode_check check (mode in ('live', 'assignment'));
alter table public.boards add column if not exists starts_at timestamptz;
alter table public.boards add column if not exists due_at timestamptz;

alter table public.participants add column if not exists submitted_at timestamptz;
alter table public.participants add column if not exists score text;
alter table public.participants add column if not exists comment text;
alter table public.participants add column if not exists cur_page integer;
alter table public.participants add column if not exists reclaim_ok boolean not null default false;
alter table public.participants drop constraint if exists participants_score_len;
alter table public.participants add constraint participants_score_len check (char_length(score) <= 24 and char_length(comment) <= 1500);

-- scope_id = whose private copy an object belongs to (null = shared live board)
alter table public.objects add column if not exists scope_id uuid references public.participants(id) on delete cascade;
alter table public.objects add column if not exists is_feedback boolean not null default false;
create index if not exists objects_scope_idx on public.objects(scope_id);
alter table public.objects drop constraint if exists objects_type_check;
alter table public.objects add constraint objects_type_check
  check (type in ('pen','highlighter','text','line','arrow','rect','ellipse','stamp'));

-- ------------------------------------------------------------- helpers
create or replace function public.board_mode(b uuid) returns text
language sql stable security definer set search_path = public as $$
  select mode from public.boards where id = b;
$$;

-- writing is allowed only: link on, not locked by the teacher, not submitted, inside the start/due window
create or replace function public.can_write(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.participants p join public.boards d on d.id = p.board_id
    where p.board_id = b and p.user_id = auth.uid()
      and d.link_enabled and not d.locked
      and p.submitted_at is null
      and (d.starts_at is null or d.starts_at <= now())
      and (d.due_at is null or d.due_at >= now())
  );
$$;

-- ------------------------------------------------------------- object rules
drop policy if exists objects_student_read on public.objects;
create policy objects_student_read on public.objects for select to authenticated
  using (
    public.is_member(board_id)
    and (scope_id is null or scope_id in (select p.id from public.participants p where p.user_id = auth.uid()))
  );

drop policy if exists objects_student_insert on public.objects;
create policy objects_student_insert on public.objects for insert to authenticated
  with check (
    public.can_write(board_id)
    and is_feedback = false
    and participant_id in (select p.id from public.participants p where p.user_id = auth.uid() and p.board_id = objects.board_id)
    and exists (select 1 from public.pages pg where pg.id = objects.page_id and pg.board_id = objects.board_id)
    and scope_id is not distinct from (case when public.board_mode(board_id) = 'assignment' then participant_id else null end)
  );

drop policy if exists objects_student_update on public.objects;
create policy objects_student_update on public.objects for update to authenticated
  using (public.can_write(board_id) and is_feedback = false
         and participant_id in (select p.id from public.participants p where p.user_id = auth.uid()))
  with check (public.can_write(board_id) and is_feedback = false
         and participant_id in (select p.id from public.participants p where p.user_id = auth.uid()));

create or replace function public.objects_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.participant_id is null then
      new.author := 'Teacher';
    else
      select name into new.author from public.participants where id = new.participant_id;
    end if;
  else
    if new.board_id <> old.board_id or new.page_id <> old.page_id
       or new.participant_id is distinct from old.participant_id
       or new.scope_id is distinct from old.scope_id
       or new.is_feedback <> old.is_feedback then
      raise exception 'IMMUTABLE_FIELDS';
    end if;
    new.author := old.author;
  end if;
  if pg_column_size(new.data) > 300000 then raise exception 'OBJECT_TOO_BIG'; end if;
  new.updated_at := now();
  return new;
end $$;

-- ------------------------------------------------------ live channel rules
-- board:<id>:s  everyone (live classes only)   board:<id>:t  teacher writes, members read
-- board:<id>:p:<participant>  one student's private copy (that student + teacher)
create or replace function public.rt_can_read(topic text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare parts text[]; b uuid; kind text; pid uuid;
begin
  if public.is_teacher() then return topic like 'board:%'; end if;
  parts := string_to_array(topic, ':');
  if parts[1] <> 'board' then return false; end if;
  b := parts[2]::uuid; kind := parts[3];
  if not public.is_member(b) then return false; end if;
  if kind = 't' then return true; end if;
  if kind = 's' then return public.board_mode(b) = 'live'; end if;
  if kind = 'p' then
    pid := parts[4]::uuid;
    return exists (select 1 from public.participants where id = pid and board_id = b and user_id = auth.uid());
  end if;
  return false;
exception when others then
  return false;
end $$;

create or replace function public.rt_can_write(topic text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare parts text[]; b uuid; kind text; pid uuid;
begin
  if public.is_teacher() then return topic like 'board:%'; end if;
  parts := string_to_array(topic, ':');
  if parts[1] <> 'board' then return false; end if;
  b := parts[2]::uuid; kind := parts[3];
  if not public.is_member(b) then return false; end if;
  if kind = 's' then return public.board_mode(b) = 'live'; end if;
  if kind = 'p' then
    pid := parts[4]::uuid;
    return exists (select 1 from public.participants where id = pid and board_id = b and user_id = auth.uid());
  end if;
  return false;
exception when others then
  return false;
end $$;

drop policy if exists bem_rt_read on realtime.messages;
create policy bem_rt_read on realtime.messages for select to authenticated
  using (public.rt_can_read((select realtime.topic())));
drop policy if exists bem_rt_write on realtime.messages;
create policy bem_rt_write on realtime.messages for insert to authenticated
  with check (public.rt_can_write((select realtime.topic())));

-- --------------------------------------------------------------- functions
create or replace function public.get_join_info(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare b public.boards; names jsonb;
begin
  select * into b from public.boards where code = upper(btrim(p_code));
  if not found then return jsonb_build_object('found', false); end if;
  select coalesce(jsonb_agg(first_name order by first_name), '[]'::jsonb) into names
    from public.class_students where class_id = b.class_id;
  return jsonb_build_object('found', true, 'enabled', b.link_enabled, 'title', b.title, 'names', names,
    'mode', b.mode, 'starts_at', b.starts_at, 'due_at', b.due_at);
end $$;

create or replace function public.join_board(p_code text, p_name text, p_pin text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare b public.boards; nm text; ph text; p public.participants;
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
        null; -- right PIN: move the copy to this device
      elsif p.pin_hash is not null then
        if ph is null then raise exception 'PIN_REQUIRED'; end if;
        raise exception 'PIN_WRONG';
      elsif b.mode = 'assignment' then
        -- private work: another device may only take it over when the teacher allowed it
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

drop function if exists public.heartbeat();
create or replace function public.heartbeat(p_page integer default null) returns void
language sql security definer set search_path = public as $$
  update public.participants set last_seen = now(), cur_page = coalesce(p_page, cur_page) where user_id = auth.uid();
$$;

create or replace function public.submit_work(p_participant uuid) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare t timestamptz;
begin
  update public.participants set submitted_at = now()
    where id = p_participant and user_id = auth.uid() and submitted_at is null
    returning submitted_at into t;
  if t is null then
    select submitted_at into t from public.participants where id = p_participant and user_id = auth.uid();
  end if;
  return t;
end $$;

revoke all on all functions in schema public from anon, public;
grant execute on function public.board_mode(uuid), public.rt_can_read(text), public.rt_can_write(text),
  public.get_join_info(text), public.join_board(text, text, text), public.heartbeat(integer),
  public.submit_work(uuid), public.can_write(uuid), public.is_member(uuid), public.is_member_text(text),
  public.is_teacher() to authenticated;
