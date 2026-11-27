-- Bright EngMath Live Classroom Board : textbooks (e-books). A book is uploaded once; every lesson made from it uses the same file (no copy per lesson).
-- Run after 19_link_task.sql. Safe to run again.
create table if not exists public.textbooks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  subject text check (subject is null or char_length(subject) <= 60),
  file_path text not null,
  pages integer not null check (pages between 1 and 1000),
  heights jsonb not null check (jsonb_typeof(heights) = 'array'),
  cover text check (cover is null or (cover like 'data:image/jpeg;base64,%' and char_length(cover) <= 250000)),
  created_at timestamptz not null default now()
);
alter table public.textbooks enable row level security;
drop policy if exists textbooks_teacher on public.textbooks;
create policy textbooks_teacher on public.textbooks for all to authenticated using (public.is_teacher()) with check (public.is_teacher());
grant select, insert, update, delete on public.textbooks to authenticated;

-- a lesson remembers which book it came from (deleting the book deletes its lessons)
alter table public.boards add column if not exists book_id uuid references public.textbooks(id) on delete cascade;

-- students (and everyone in a board) may read a book file only while one of their boards uses it
drop policy if exists boards_files_book_read on storage.objects;
create policy boards_files_book_read on storage.objects for select to authenticated
  using (bucket_id = 'boards' and (storage.foldername(name))[1] = 'books' and exists (select 1 from public.pages p where p.file_path = name));
