-- Bright EngMath Live Classroom Board : database setup (Phase 1)
-- Run once in Supabase > SQL Editor. Safe to run again.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------- tables
create table if not exists public.teachers (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now()
);

create table if not exists public.class_students (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  first_name text not null check (char_length(first_name) between 1 and 24),
  created_at timestamptz not null default now()
);

create table if not exists public.boards (
  id uuid primary key default gen_random_uuid(),
  class_id uuid references public.classes(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  code text not null unique,
  link_enabled boolean not null default true,
  locked boolean not null default false,
  follow jsonb not null default '{"on":false}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.pages (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  idx integer not null,
  kind text not null check (kind in ('pdf','image','blank','lined','grid')),
  file_path text,
  pdf_page integer,
  w integer not null default 1000,
  h integer not null check (h between 200 and 6000),
  created_at timestamptz not null default now()
);
create index if not exists pages_board_idx on public.pages(board_id, idx);

create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  user_id uuid not null,
  name text not null,
  pin_hash text,
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists participants_board_idx on public.participants(board_id);
create index if not exists participants_user_idx on public.participants(user_id);

create table if not exists public.objects (
  id uuid primary key,
  board_id uuid not null references public.boards(id) on delete cascade,
  page_id uuid not null references public.pages(id) on delete cascade,
  participant_id uuid references public.participants(id) on delete cascade,
  author text not null default 'Teacher',
  type text not null check (type in ('pen','highlighter','text','line','arrow','rect','ellipse')),
  data jsonb not null,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists objects_board_idx on public.objects(board_id);
create index if not exists objects_page_idx on public.objects(page_id);

alter table public.teachers enable row level security;
alter table public.classes enable row level security;
alter table public.class_students enable row level security;
alter table public.boards enable row level security;
alter table public.pages enable row level security;
alter table public.participants enable row level security;
alter table public.objects enable row level security;

-- ------------------------------------------------------------- helpers
create or replace function public.is_teacher() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.teachers t where t.user_id = auth.uid());
$$;

create or replace function public.is_member(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.participants p join public.boards d on d.id = p.board_id
    where p.board_id = b and p.user_id = auth.uid() and d.link_enabled
  );
$$;

create or replace function public.can_write(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.participants p join public.boards d on d.id = p.board_id
    where p.board_id = b and p.user_id = auth.uid() and d.link_enabled and not d.locked
  );
$$;

create or replace function public.is_member_text(t text) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  return public.is_member(t::uuid);
exception when others then
  return false;
end $$;

-- -------------------------------------------------------------- policies
drop policy if exists classes_teacher on public.classes;
create policy classes_teacher on public.classes for all to authenticated
  using (public.is_teacher()) with check (public.is_teacher());

drop policy if exists class_students_teacher on public.class_students;
create policy class_students_teacher on public.class_students for all to authenticated
  using (public.is_teacher()) with check (public.is_teacher());

drop policy if exists boards_teacher on public.boards;
create policy boards_teacher on public.boards for all to authenticated
  using (public.is_teacher()) with check (public.is_teacher());
drop policy if exists boards_student_read on public.boards;
create policy boards_student_read on public.boards for select to authenticated
  using (public.is_member(id));

drop policy if exists pages_teacher on public.pages;
create policy pages_teacher on public.pages for all to authenticated
  using (public.is_teacher()) with check (public.is_teacher());
drop policy if exists pages_student_read on public.pages;
create policy pages_student_read on public.pages for select to authenticated
  using (public.is_member(board_id));

drop policy if exists participants_teacher on public.participants;
create policy participants_teacher on public.participants for all to authenticated
  using (public.is_teacher()) with check (public.is_teacher());
drop policy if exists participants_own_read on public.participants;
create policy participants_own_read on public.participants for select to authenticated
  using (user_id = auth.uid());

drop policy if exists objects_teacher on public.objects;
create policy objects_teacher on public.objects for all to authenticated
  using (public.is_teacher()) with check (public.is_teacher());
drop policy if exists objects_student_read on public.objects;
create policy objects_student_read on public.objects for select to authenticated
  using (public.is_member(board_id));
drop policy if exists objects_student_insert on public.objects;
create policy objects_student_insert on public.objects for insert to authenticated
  with check (
    public.can_write(board_id)
    and participant_id in (select p.id from public.participants p where p.user_id = auth.uid() and p.board_id = objects.board_id)
    and exists (select 1 from public.pages pg where pg.id = objects.page_id and pg.board_id = objects.board_id)
  );
drop policy if exists objects_student_update on public.objects;
create policy objects_student_update on public.objects for update to authenticated
  using (public.can_write(board_id) and participant_id in (select p.id from public.participants p where p.user_id = auth.uid()))
  with check (public.can_write(board_id) and participant_id in (select p.id from public.participants p where p.user_id = auth.uid()));

-- the server fills in the author name and blocks moving objects between boards
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
       or new.participant_id is distinct from old.participant_id then
      raise exception 'IMMUTABLE_FIELDS';
    end if;
    new.author := old.author;
  end if;
  if pg_column_size(new.data) > 300000 then raise exception 'OBJECT_TOO_BIG'; end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists objects_guard_trg on public.objects;
create trigger objects_guard_trg before insert or update on public.objects
  for each row execute function public.objects_guard();

-- ------------------------------------------------- student join functions
create or replace function public.get_join_info(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare b public.boards; names jsonb;
begin
  select * into b from public.boards where code = upper(btrim(p_code));
  if not found then return jsonb_build_object('found', false); end if;
  select coalesce(jsonb_agg(first_name order by first_name), '[]'::jsonb) into names
    from public.class_students where class_id = b.class_id;
  return jsonb_build_object('found', true, 'enabled', b.link_enabled, 'title', b.title, 'names', names);
end $$;

create or replace function public.join_board(p_code text, p_name text, p_pin text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare b public.boards; nm text; ph text; p public.participants;
begin
  if auth.uid() is null then raise exception 'NOT_SIGNED_IN'; end if;
  select * into b from public.boards where code = upper(btrim(p_code));
  if not found or not b.link_enabled then raise exception 'BOARD_CLOSED'; end if;
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
      if p.pin_hash is not null then
        if ph is null then raise exception 'PIN_REQUIRED'; end if;
        if ph <> p.pin_hash then raise exception 'PIN_WRONG'; end if;
      elsif p.last_seen > now() - interval '45 seconds' then
        raise exception 'NAME_IN_USE';
      end if;
      update public.participants set user_id = auth.uid(), last_seen = now(), pin_hash = coalesce(pin_hash, ph)
        where id = p.id;
    else
      insert into public.participants(board_id, user_id, name, pin_hash)
        values (b.id, auth.uid(), nm, ph) returning * into p;
    end if;
  end if;
  return jsonb_build_object('participant_id', p.id, 'board_id', b.id, 'name', p.name);
end $$;

create or replace function public.heartbeat() returns void
language sql security definer set search_path = public as $$
  update public.participants set last_seen = now() where user_id = auth.uid();
$$;

-- ----------------------------------------------------------- privileges
revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon, public;
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.classes, public.class_students, public.boards,
  public.pages, public.participants, public.objects to authenticated;
revoke all on public.teachers from authenticated;
grant execute on function public.is_teacher(), public.is_member(uuid), public.can_write(uuid),
  public.is_member_text(text), public.get_join_info(text), public.join_board(text, text, text),
  public.heartbeat() to authenticated;

-- ------------------------------------------------------------- realtime
do $$
declare t text;
begin
  foreach t in array array['objects','boards','pages','participants'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- live broadcast channels are private: board:<id>:s (everyone on the board), board:<id>:t (teacher only writes)
drop policy if exists bem_rt_read on realtime.messages;
create policy bem_rt_read on realtime.messages for select to authenticated using (
  (select realtime.topic()) like 'board:%'
  and (public.is_teacher() or public.is_member_text(split_part((select realtime.topic()), ':', 2)))
);
drop policy if exists bem_rt_write on realtime.messages;
create policy bem_rt_write on realtime.messages for insert to authenticated with check (
  (select realtime.topic()) like 'board:%'
  and (
    public.is_teacher()
    or ((select realtime.topic()) like 'board:%:s'
        and public.is_member_text(split_part((select realtime.topic()), ':', 2)))
  )
);

-- -------------------------------------------------------------- storage
insert into storage.buckets (id, name, public, file_size_limit)
values ('boards', 'boards', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = 52428800;

drop policy if exists boards_files_teacher on storage.objects;
create policy boards_files_teacher on storage.objects for all to authenticated
  using (bucket_id = 'boards' and public.is_teacher())
  with check (bucket_id = 'boards' and public.is_teacher());
drop policy if exists boards_files_member_read on storage.objects;
create policy boards_files_member_read on storage.objects for select to authenticated
  using (bucket_id = 'boards' and public.is_member_text((storage.foldername(name))[1]));
