-- Bright EngMath Live Classroom Board : class link ("My boards"). Run after 04_roster_codes.sql. Safe to run again.
-- Each class gets one link. A student opens it, taps their name, types their code and sees every board of the class that is theirs.

alter table public.classes add column if not exists code text;
update public.classes set code = upper(substr(md5(random()::text || id::text), 1, 6)) where code is null;
create unique index if not exists classes_code_idx on public.classes(code);

create table if not exists public.class_fails (
  class_id uuid not null references public.classes(id) on delete cascade,
  name_lc text not null,
  n integer not null default 0,
  since timestamptz not null default now(),
  primary key (class_id, name_lc)
);
alter table public.class_fails enable row level security;
revoke all on public.class_fails from anon, authenticated;

create or replace function public.get_class_info(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c public.classes; names jsonb;
begin
  select * into c from public.classes where code = upper(btrim(p_code));
  if not found then return jsonb_build_object('found', false); end if;
  select coalesce(jsonb_agg(first_name order by first_name), '[]'::jsonb) into names
    from public.class_students where class_id = c.id and code is not null;
  return jsonb_build_object('found', true, 'name', c.name, 'names', names);
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
  ) s;
  return jsonb_build_object('name', rs.first_name, 'class', c.name, 'boards', boards);
end $$;

revoke all on all functions in schema public from anon, public;
grant execute on function public.get_class_info(text), public.class_portal(text, text, text) to authenticated;
